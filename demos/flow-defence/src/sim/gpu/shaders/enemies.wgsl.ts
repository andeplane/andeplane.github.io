// Enemy spores — GPU particles riding the LBM velocity field. Runs once per
// 60 Hz tick, after the LBM substeps and before the glow pass:
//   sample flow → steer → move (blocked by solid cells) → take neutralizer
//   damage → stamp glow (comet blob; big flash on death) → count kills/escapes.
//
// Counters layout (atomic<u32>):
//   [0] breach count (written by erosion pass)
//   [1] spores killed by towers (monotone, pays bounty)
//   [2] spores escaped to the outlet (monotone)
//   [5] spores suffocated in stagnant water (monotone, pays NOTHING —
//       otherwise sealed basins become risk-free bounty farms)

import { CONFIG } from '../../../config'
import { CELL } from '../../core/constants'

export const GLOW_SCALE = 1024
/** Floats per enemy struct (pos.xy, vel.xy, hp, state, seed, pad). */
export const ENEMY_STRIDE = 8

export function enemiesShaderSource(width: number, height: number): string {
  const e = CONFIG.enemies
  return /* wgsl */ `
const SIM_W : i32 = ${width};
const SIM_H : i32 = ${height};
const MAX_ENEMIES : u32 = ${e.max}u;
const ADV : f32 = ${CONFIG.sim.substeps}.0;   // lattice steps per tick
const CARRY : f32 = ${e.carry};
const SWIM : f32 = ${e.swim};
const WANDER : f32 = ${e.wander};
const STEER : f32 = ${e.steer};
const DMG : f32 = ${e.towerDamage};
const STAGNANT_U : f32 = ${e.stagnantU};
const SUFFOCATE : f32 = ${e.suffocate};
const GLOW_STAMP : f32 = ${e.glowStamp};
const KILL_FLASH : f32 = ${e.killFlash};
const GLOW_SCALE : f32 = ${GLOW_SCALE}.0;

const CELL_BEDROCK : u32 = ${CELL.BEDROCK}u;
const CELL_WALL : u32 = ${CELL.WALL}u;
const CELL_OUTLET : u32 = ${CELL.OUTLET}u;

struct Enemy {
  pos : vec2<f32>,
  vel : vec2<f32>,   // displacement per tick
  hp : f32,
  state : f32,       // 0 = empty/dead, 1 = alive
  seed : f32,
  pad : f32,
};

struct EnemyParams {
  time : f32,   // sim tick (drives the wander phase)
  pad0 : f32,
  pad1 : f32,
  pad2 : f32,
};

@group(0) @binding(0) var<storage, read_write> enemies : array<Enemy>;
@group(0) @binding(1) var macroTex : texture_2d<f32>;
@group(0) @binding(2) var linearSampler : sampler;
@group(0) @binding(3) var<storage, read> cellType : array<u32>;
@group(0) @binding(4) var<storage, read> solidity : array<f32>;
@group(0) @binding(5) var<storage, read> towerField : array<f32>;
@group(0) @binding(6) var<storage, read_write> counters : array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> glow : array<atomic<u32>>;
@group(0) @binding(8) var<uniform> params : EnemyParams;

fn cellIdx(p : vec2<f32>) -> i32 {
  let x = clamp(i32(p.x), 0, SIM_W - 1);
  let y = clamp(i32(p.y), 0, SIM_H - 1);
  return y * SIM_W + x;
}

// Spores squeeze through badly eroded walls (solidity < 0.6) — breached dams
// leak the swarm, matching the water they ride.
fn blocked(p : vec2<f32>) -> bool {
  if (p.x < 1.0 || p.x >= f32(SIM_W) || p.y < 1.0 || p.y >= f32(SIM_H) - 1.0) { return true; }
  let idx = cellIdx(p);
  let t = cellType[idx];
  if (t == CELL_BEDROCK) { return true; }
  if (t == CELL_WALL && solidity[idx] >= 0.6) { return true; }
  return false;
}

fn stamp(p : vec2<f32>, amount : f32, radius : i32) {
  let cx = i32(round(p.x));
  let cy = i32(round(p.y));
  let r2 = f32(radius * radius) + 1.0;
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      let x = cx + dx;
      let y = cy + dy;
      if (x < 0 || x >= SIM_W || y < 0 || y >= SIM_H) { continue; }
      let d2 = f32(dx * dx + dy * dy);
      let w = max(1.0 - d2 / r2, 0.0);
      if (w <= 0.0) { continue; }
      atomicAdd(&glow[y * SIM_W + x], u32(amount * w * GLOW_SCALE));
    }
  }
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= MAX_ENEMIES) { return; }
  var e = enemies[i];
  if (e.state != 1.0) { return; }

  // Sample the flow (bilinear) at the spore's position.
  let uv = (e.pos + vec2<f32>(0.5)) / vec2<f32>(f32(SIM_W), f32(SIM_H));
  let mac = textureSampleLevel(macroTex, linearSampler, uv, 0.0);

  // Smoothly varying wander direction per spore — swarms, not bead chains.
  let wanderAngle = e.seed * 6.2832 + sin(params.time * 0.045 + e.seed * 37.0) * 2.4;
  let wander = vec2<f32>(cos(wanderAngle), sin(wanderAngle)) * WANDER;

  let goal = (mac.xy * CARRY + vec2<f32>(SWIM, 0.0) + wander) * ADV;
  e.vel = mix(e.vel, goal, STEER);

  // Move, blocked by solids (axis-separated slide along walls).
  let cand = e.pos + e.vel;
  if (!blocked(cand)) {
    e.pos = cand;
  } else if (!blocked(vec2<f32>(cand.x, e.pos.y))) {
    e.pos = vec2<f32>(cand.x, e.pos.y);
    e.vel.y = 0.0;
  } else if (!blocked(vec2<f32>(e.pos.x, cand.y))) {
    e.pos = vec2<f32>(e.pos.x, cand.y);
    e.vel.x = 0.0;
  } else {
    e.vel = e.vel * 0.2;
  }

  let idx = cellIdx(e.pos);

  // Neutralizer damage, plus suffocation in stagnant water (spores need
  // current to breathe — sealed-off arms and dead eddies are lethal).
  let towerDmg = towerField[idx];
  e.hp -= towerDmg * DMG;
  if (length(mac.xy) < STAGNANT_U) { e.hp -= SUFFOCATE; }
  if (e.hp <= 0.0) {
    e.state = 0.0;
    if (towerDmg > 0.0) {
      atomicAdd(&counters[1], 1u);
      stamp(e.pos, KILL_FLASH, 3);   // the kill flash — bloom pops on it
    } else {
      // Drowned quietly: no bounty, a dimmer flash.
      atomicAdd(&counters[5], 1u);
      stamp(e.pos, KILL_FLASH * 0.35, 2);
    }
    enemies[i] = e;
    return;
  }

  // Escape at the outlet.
  if (cellType[idx] == CELL_OUTLET || e.pos.x >= f32(SIM_W) - 2.0) {
    e.state = 0.0;
    atomicAdd(&counters[2], 1u);
    enemies[i] = e;
    return;
  }

  stamp(e.pos, GLOW_STAMP, 2);
  enemies[i] = e;
}
`
}

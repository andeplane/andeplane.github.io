// Every tunable in one place. Balancing happens here, not in scattered literals.

import { LEVELS } from './engine/levelDefs'

export const CONFIG = {
  sim: {
    width: 512,
    height: 256,
    /** LBM substeps per 60 Hz tick (pacing/quality knob). */
    substeps: 3,
    tau0: 0.58,
    smagorinsky: 0.12,
    uClamp: 0.25,
  },
  dye: {
    /** Dye grid resolution multiplier over the sim grid. */
    scale: 2,
    /** Per-frame dye retention (1 = never fades). */
    fade: 0.9993,
    /** Width of the injection band at the inlet, in dye pixels. */
    injectWidth: 6,
  },
  inlet: {
    /** Number of inlet segments along the left edge. */
    segments: 3,
    /** Bedrock margin (rows) at top and bottom of the domain. */
    margin: 10,
    /** Gap (rows) between inlet segments. */
    gap: 12,
    /** Nominal inlet velocity (lattice units) when a segment is fully open. */
    u: 0.09,
    /** Nominal inlet density (small head; surges push it up temporarily). */
    rho: 1.006,
    /** Extra density a full surge adds (the water-hammer spike). Kept just
     *  BELOW the piping threshold so a surge alone doesn't dissolve arm seals
     *  (shear still bites, and full dams build far bigger heads and still
     *  fail); the spike reads as pressure glow + faster current. */
    surgeRho: 0.022,
    /** Extra velocity factor a full surge adds. */
    surgeU: 0.4,
    /**
     * Flood escalation: extra density at full flood — the river's answer to
     * being strangled. Deliberately far ABOVE the piping threshold: while the
     * base is starved, this ramps in and bursts any blockade, however thick.
     */
    floodRho: 0.08,
    /**
     * Back-pressure choke: inlet velocity scales by 1 − choke·(downstream ρ
     * excess). A pump loses flow against head. Stall head ≈ 1/choke — this is
     * THE conservation knob: a stiff pump (small choke) keeps pushing through
     * constrictions, so a hair-thin canal carries fire-hose velocity and gets
     * shredded by shear, basins drift instead of stagnating, and dams get
     * pressure-cooked. (Was 50 — that soft pump "gave up" against any wall
     * and made blockades/hair-canals cheap to hold.)
     */
    choke: 18,
  },
  /**
   * Enemies are discrete spores riding the current — GPU particles advected
   * by the real velocity field, so every wall visibly re-routes the attack.
   */
  enemies: {
    /** Enemy buffer capacity (slots are allocated monotonically per match). */
    max: 1024,
    // Per-type movement personalities (carry/swim/steer) live in sporeDefs.
    /**
     * Spores need current to breathe: below this flow speed they suffocate.
     * This is what makes SEALING an arm a real (and paying) defense — spores
     * spawned behind your seal die in still water instead of zombie-stalling
     * the wave, and dead eddies are lethal pockets.
     */
    stagnantU: 0.01,
    /** HP lost per tick while suffocating (hp 1 dies in ~1.4 s). */
    suffocate: 0.012,
    /**
     * Becalmed spores HUNT for current: below seekU flow speed they sample
     * the surrounding speed field and crawl up the gradient, and while a
     * gradient is in reach they hold their breath (suffocation slowed by
     * seekBreath). Spores only die quietly where there is genuinely nowhere
     * to go — a sealed pocket. A dam with a canal LEAKS the swarm through
     * the canal; a rotting blockade funnels them to its cracks.
     */
    seekU: 0.03,
    /** Probe distance (cells) for the speed-gradient sniff. */
    seekRadius: 12,
    /** Crawl speed up the gradient (lattice units, like swim). */
    seek: 0.04,
    /** Min speed difference across probes that counts as "current in reach". */
    seekGradEps: 0.004,
    /** Suffocation multiplier while actively seeking (holding breath). */
    seekBreath: 0.25,
    /** Random wander speed (lattice units) — swarms read as alive, not beads. */
    wander: 0.02,
    /** HP lost per tick = neutralizer field rate × this. */
    towerDamage: 0.4,
    /** Glow stamped into the bio field per tick (blob brightness). */
    glowStamp: 0.9,
    /** Extra glow splashed on death — the kill flash bloom pops on. */
    killFlash: 6,
    /** Gold per kill. */
    bounty: 3,
    /** x column spores spawn at (just downstream of the inlet). */
    spawnX: 4,
  },
  /**
   * The player's direct verb: hold right mouse to blast water radially
   * outward from the cursor — physically shove spores off their line.
   */
  jet: {
    /** Effect radius in sim cells. */
    radius: 18,
    /** Body force magnitude at full charge (lattice units). */
    force: 0.008,
    /** Seconds of continuous use from full charge. */
    drainSeconds: 2.5,
    /** Seconds to recharge from empty. */
    rechargeSeconds: 5,
  },
  /** The enemy glow field: advected + faded each tick; spores stamp into it. */
  glow: {
    /** Per-tick retention — short comet tails behind each spore. */
    fade: 0.9,
    /** Brightness ceiling (keeps kill flashes from washing the tone map). */
    cap: 8,
  },
  erosion: {
    /** Integrity lost per tick per unit of shear speed above the threshold.
     *  Above the threshold, self-healing also stops — walls lining fast water
     *  decay and need repainting; narrow canals are not free. */
    kShear: 0.022,
    shearThreshold: 0.08,
    /**
     * Piping: pressure head above this erodes (scaled by porosity) AND blocks
     * self-healing. Set above stagnation heads from deflecting a jet (~0.02)
     * but below dam heads under surge (~0.05): routing walls are durable,
     * dams crack when the water hammers them.
     */
    kPipe: 1.6,
    /** Below the choke-18 stall head (~0.056) so sealed arms and dams still
     *  rot and need repainting — but slowly enough that ATTENTIVE repair
     *  keeps a seal alive. Flood escalation (head ~0.08) bursts anything. */
    pipeThreshold: 0.04,
    /** Minimum porosity of an intact wall — the seed leak that makes piping possible. */
    porosityEps: 0.02,
    /** Constant self-healing per tick; erosion competes against it, so calm
     *  walls regenerate while heavily scoured walls still die. */
    cureRate: 0.005,
    /**
     * Construction armor: fresh walls carry integrity above 1 purely to absorb
     * the placement pressure transient (water slamming into a new obstacle
     * spikes local head for ~1–2 s and would otherwise trigger the porosity
     * death spiral before the flow reorganizes). Values > 1 behave as fully
     * solid; cracks/porosity only begin below 1.
     */
    freshSolidity: 2.0,
  },
  build: {
    /** Brush radius (cells) for wall painting. */
    brushRadius: 1.6,
    /** Gold per wall cell. */
    wallCostPerCell: 0.12,
    /** Gold per cell to repaint (repair) a standing wall back to full armor. */
    wallRepairCostPerCell: 0.06,
    /** Refund per wall cell erased (the undo verb — half the build price). */
    wallRefundPerCell: 0.06,
    /** Minimum distance (cells) between towers — no degenerate stacking;
     *  defenses must claim territory. */
    towerSpacing: 20,
  },
  // Tower stats live in engine/towerDefs.ts (the tower registry); spore
  // personalities live in engine/sporeDefs.ts. This file keeps only the
  // world/physics/economy tunables.
  match: {
    /** Passive gold per second. */
    goldTrickle: 1,
    /**
     * The base drinks from the river: nominal outlet water flux (sum of ux
     * over outlet cells per tick, empirically measured on the open default
     * arena). Intake below thirstFraction × nominal during a wave means the
     * defender has strangled the flow — the base THIRSTS and bleeds lives.
     * This is the anti-blockade rule: reroute the river, never stop it.
     * Re-measure (scratchpad flux-measure.mjs) whenever inlet.choke moves.
     */
    nominalFlux: 13.8,
    /** Deliberately low: thirst punishes BLOCKADES (net discharge ≈ 0), never
     *  narrow canals — a canal's cost is erosion and pressure, not thirst.
     *  (Measured: minimal 15-row canal ≈ 0.6–1.0; blockade flushes ≈ 0–0.3.) */
    thirstFraction: 0.05,
    /** Ticks for flood escalation to ramp from 0 to full while starved. */
    floodRampTicks: 1800,
    /** Ticks of starvation tolerated before lives start draining. */
    thirstGraceTicks: 5 * 60,
    /** While thirsting past grace: one life lost per this many ticks. */
    thirstLifeTicks: 3 * 60,
    /** Ticks of the initial build phase before wave 1 auto-starts. */
    buildTicks: 45 * 60,
    /** Ticks between waves (Space skips). */
    interWaveTicks: 12 * 60,
    /** A wave force-completes this many ticks after its last spawn (backstop —
     *  suffocation resolves trapped spores long before this). */
    waveTimeoutTicks: 45 * 60,
    /** Wave-clear bonus: base + perWave × wave number. */
    clearBonusBase: 20,
    clearBonusPerWave: 10,
  },
  /**
   * Carrier-dye tint per inlet segment. Deliberately quiet, single-family
   * water tones: dye shows the CURRENT, and must never compete with the
   * spores (hot pink), which are the only saturated threat color on screen.
   */
  segmentColors: [
    [0.3, 0.46, 0.58],
    [0.26, 0.42, 0.6],
    [0.32, 0.5, 0.56],
    [0.28, 0.44, 0.58],
    [0.3, 0.48, 0.6],
  ] as ReadonlyArray<readonly [number, number, number]>,
  /** The campaign — see engine/levelDefs.ts (pure data, one entry per arena). */
  levels: LEVELS,
} as const

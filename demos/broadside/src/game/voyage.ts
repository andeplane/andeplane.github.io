import type { LevelDef, IslandDef, EnemyDef } from "./levels";
import { Rng } from "../sim/rng";
import { Session } from "./session";
import {
  IDLE_INTENT,
  damageShip,
  updateShip,
  SHIP_SPECS,
  type ShipIntent,
  type Side,
} from "../sim/ships";
import { distance, angleDiff, headingTo } from "../sim/math";
import { findAim } from "../sim/cannons";
import { aimFortShot } from "./forts";
import { thinkAi, createBrain } from "./ai";
import { TOTAL_LEVELS, worldOf, stageOf } from "./campaign";
import { wrapAngle } from "../sim/math";
import { SIM_DT } from "../sim/world";
import { navigationCourse } from "./navigationCourses";
import { voyageWeather, weatherWind, type VoyageWeather } from "./weather";

export const PACKS = [
  {
    name: "First sails",
    subtitle: "Learn the wheel · secret passages",
    color: "#7ce5c5",
  },
  {
    name: "Pirate waters",
    subtitle: "Island cannons · learn to fight back",
    color: "#ffc877",
  },
  {
    name: "Whirlpool straits",
    subtitle: "Swirling currents · dangerous crossings",
    color: "#ffa28e",
  },
  {
    name: "The glowing deep",
    subtitle: "Kraken waters · legendary treasure",
    color: "#ba9aff",
  },
] as const;
export const RELICS = [
  {
    name: "The captain’s gold",
    kind: "gold",
    color: "#ffce77",
    story: "A growing fortune brought home from your voyages.",
  },
  {
    name: "Moonlit silver",
    kind: "coins",
    color: "#c8e9ff",
    story: "Silver doubloons stamped with a moon and kept by the sea.",
  },
  {
    name: "The rose diamond",
    kind: "gem",
    color: "#ff9fd1",
    story: "A pink diamond hiding at the end of a secret passage.",
  },
  {
    name: "The lagoon emerald",
    kind: "gem",
    color: "#54f2c2",
    story: "A green star rescued from the cheekiest pirates.",
  },
  {
    name: "The sapphire ring",
    kind: "ring",
    color: "#76ceff",
    story: "A golden ring with a blue diamond bright as the summer sky.",
  },
  {
    name: "The captain’s crown",
    kind: "crown",
    color: "#ffd478",
    story: "For a brave captain with a very big heart.",
  },
  {
    name: "The firefly lantern",
    kind: "lantern",
    color: "#ffb860",
    story: "A hundred little lights to guide you home.",
  },
  {
    name: "The ruby of Redwake",
    kind: "gem",
    color: "#ff668e",
    story: "The fortress kept it safe. Now you do.",
  },
  {
    name: "The tides of time",
    kind: "hourglass",
    color: "#80d9ff",
    story: "Its sparkling sand counts stories, never seconds.",
  },
  {
    name: "The sleeping kraken",
    kind: "egg",
    color: "#b08cff",
    story: "A mysterious egg. Something inside is dreaming.",
  },
  {
    name: "The little sea guardian",
    kind: "turtle",
    color: "#83edbe",
    story: "A friend from the deepest, brightest part of the sea.",
  },
  {
    name: "The heart of the ocean",
    kind: "orb",
    color: "#9ddcff",
    story: "Every voyage, every treasure, every brave little turn.",
  },
] as const;
const NAMES = [
  [
    "A little captain",
    "Between the palms",
    "The first turn",
    "Rocky passage",
    "Two ways home",
    "Hidden lagoon",
    "The long bend",
    "Between the reefs",
    "The secret passage",
    "The captain’s trial",
  ],
  [
    "The watchful island",
    "Cannon alley",
    "Across the crossfire",
    "The fortress escape",
    "Hello, pirates!",
    "Your first broadside",
    "Two rival captains",
    "The pirate patrol",
    "Battle at the bay",
    "Captain’s crossing",
  ],
  [
    "The swirling sea",
    "Follow the current",
    "The whirlpool passage",
    "A narrow escape",
    "Two spinning tides",
    "Cannons and currents",
    "The broken channel",
    "Eye of the maelstrom",
    "The spinning gauntlet",
    "The tides of time",
  ],
  [
    "Something below",
    "The waking deep",
    "Tentacle crossing",
    "The purple passage",
    "Kraken’s cove",
    "The haunted channel",
    "The deepwater patrol",
    "Into the abyss",
    "The final storm",
    "The last horizon",
  ],
];
export interface WhirlpoolDef {
  x: number;
  z: number;
  radius: number;
  strength: number;
  spin: number;
}
export interface VoyageDef {
  index: number;
  pack: number;
  weather: VoyageWeather;
  level: LevelDef;
  finish: { x: number; z: number };
  gems: { x: number; z: number; found: boolean }[];
  forts: number[];
  whirlpools: WhirlpoolDef[];
  kraken: { x: number; z: number } | null;
}
/** Seeded templates keep a wide, tested route on both sides of every obstacle. */
export function generateVoyage(
  index: number,
  seed = 4100 + index * 137,
): VoyageDef {
  if (!Number.isInteger(index) || index < 0 || index >= TOTAL_LEVELS)
    throw new RangeError("Unknown voyage");
  const pack = worldOf(index),
    stage = stageOf(index),
    rng = new Rng(seed);
  if (pack === 0) {
    const course = navigationCourse(stage);
    const islands = course.islands;
    // The treasure landmark is always last, beyond a safe, broad finish line.
    islands.push({
      pos: { x: course.finish.x, z: course.finish.z + 42 },
      radius: 26,
      kind: "sand",
      props: ["palms"],
    });
    return {
      index,
      pack,
      weather: voyageWeather(index),
      finish: course.finish,
      gems: course.gems.map((p) => ({ ...p, found: false })),
      forts: [],
      whirlpools: [],
      kraken: null,
      level: {
        id: `voyage-${index}`,
        name: NAMES[pack]![stage]!,
        intro: course.intro,
        seed,
        wind: { direction: 1.3 + stage * 0.025, strength: 0.9 },
        bounds: 320,
        islands,
        player: { ship: "galleon", pos: course.start, heading: course.heading },
        waves: [
          {
            title: PACKS[pack]!.name,
            subtitle: "Find a safe passage.",
            enemies: [],
          },
        ],
        repairBetweenWaves: 0,
      },
    };
  }
  const islands: IslandDef[] = [];
  const add = (
    x: number,
    z: number,
    radius: number,
    props: IslandDef["props"],
    kind: IslandDef["kind"] = "sand",
  ) => islands.push({ pos: { x, z }, radius, props, kind });
  // Outlying islands frame a broad navigable channel. Seeded obstacles vary its bends.
  add(-53, -43, 18, ["palms"]);
  add(54, -5, 18, pack > 0 ? ["fort", "palms"] : ["lighthouse", "palms"]);
  if (stage > 0 || pack > 0)
    add(rng.range(-9, 9), 30 + stage * 1.5, 12 + stage * 0.7, [
      "rocks",
      "palms",
    ]);
  add(-58, 80, 19, pack > 0 && stage > 0 ? ["fort", "palms"] : ["palms"]);
  if (stage >= 3)
    add(
      57,
      112,
      15 + stage * 0.3,
      stage >= 7 && pack > 0 ? ["fort", "rocks"] : ["rocks"],
      "rock",
    );
  if (stage >= 5)
    add(stage % 2 ? -18 : 18, 100, 11 + (stage - 5) * 0.6, ["rocks"], "rock");
  if (stage >= 8) add(stage % 2 ? 54 : -54, 43, 12, ["rocks"], "rock");
  // Exposed sea rocks leave broad passages; more appear as navigation gets harder.
  add(24 + rng.range(-2, 2), -43, 4.5, [], "sea-rock");
  if (stage >= 2) add(-28 + rng.range(-2, 2), 57, 4, [], "sea-rock");
  if (stage >= 6) add(30 + rng.range(-2, 2), 126, 4.2, [], "sea-rock");
  // The treasure island stays last so the destination landmark remains stable.
  add(0, 190, 26, ["palms"]);
  const enemies: EnemyDef[] = [];
  const combat = pack === 1 ? stage >= 4 : pack > 1 && stage >= 2;
  if (combat) {
    enemies.push({
      ship: stage >= 7 ? "brigantine" : "sloop",
      pos: { x: 30, z: -50 },
      heading: -Math.PI / 2,
      patrol: [
        { x: 30, z: -45 },
        { x: 32, z: 55 },
      ],
    });
    if (stage >= 6)
      enemies.push({
        ship: "sloop",
        pos: { x: -30, z: 92 },
        heading: Math.PI / 2,
        patrol: [
          { x: -30, z: 92 },
          { x: 22, z: 65 },
        ],
      });
    if (stage === 9 && pack > 1)
      enemies.push({
        ship: pack === 3 ? "warship" : "brigantine",
        pos: { x: 38, z: 105 },
        heading: -Math.PI / 2,
        patrol: [
          { x: 38, z: 105 },
          { x: -30, z: 112 },
        ],
      });
  }
  const whirlpools: WhirlpoolDef[] = [];
  if (pack >= 2) {
    whirlpools.push({
      x: stage % 2 ? -29 : 29,
      z: 48,
      radius: 18 + stage * 0.25,
      strength: 4 + stage * 0.2,
      spin: 1,
    });
    if (stage >= 4)
      whirlpools.push({
        x: stage % 2 ? 30 : -30,
        z: 100,
        radius: 18,
        strength: 5,
        spin: -1,
      });
    if (stage >= 8)
      whirlpools.push({ x: 0, z: -30, radius: 16, strength: 5.5, spin: 1 });
  }
  const gems = [
    { x: index === 0 ? 0 : -32, z: 18, found: false },
    { x: 32, z: 82, found: false },
    { x: -28, z: 130, found: false },
  ];
  // Hidden routes never ask the player to collect a gem inside solid rock.
  for (const gem of gems) {
    for (const island of islands) {
      const d = distance(gem, island.pos),
        margin = island.radius + 9;
      if (d < margin) {
        const dx = gem.x - island.pos.x,
          dz = gem.z - island.pos.z;
        gem.x = island.pos.x + (dx / Math.max(d, 0.01)) * margin;
        gem.z = island.pos.z + (dz / Math.max(d, 0.01)) * margin;
      }
    }
  }
  return {
    index,
    pack,
    weather: voyageWeather(index),
    finish: { x: 0, z: 148 },
    gems,
    forts: islands.flatMap((i, n) => (i.props.includes("fort") ? [n] : [])),
    whirlpools,
    kraken: pack === 3 ? { x: stage % 2 ? -26 : 26, z: 78 } : null,
    level: {
      id: `voyage-${index}`,
      name: NAMES[pack]![stage]!,
      intro:
        pack === 1 && stage < 4
          ? "Island cannons are firing! Keep moving and steer away from their shots."
          : pack === 1
            ? "Pirates ahead! Turn your broadside toward them and tap BOOM to fight back."
            : pack === 2
              ? "Whirlpools pull and spin your ship. Keep sailing and steer away from the dark center."
              : "The kraken is waking. Avoid the purple ripples and watch for swirling currents!",
      seed,
      wind: { direction: 1.3 + stage * 0.025, strength: 0.9 },
      bounds: 260,
      islands,
      player: { ship: "galleon", pos: { x: 0, z: -90 }, heading: 0 },
      waves: [
        {
          title: PACKS[pack]!.name,
          subtitle: combat
            ? "Turn your side and fight back!"
            : "Find a safe passage.",
          enemies,
        },
      ],
      repairBetweenWaves: 0,
    },
  };
}

export class VoyageSession extends Session {
  readonly voyage: VoyageDef;
  gemsFound = 0;
  damageTaken = 0;
  elapsed = 0;
  stars = 0;
  private fortClocks = new Map<number, number>();
  private krakenHit = -10;
  private whirlpoolHits = new Map<number, number>();
  failureReason: "island" | "rocks" | null = null;
  private fortTargets = new Map<
    number,
    { x: number; z: number; impactAt: number }
  >();
  constructor(voyage: VoyageDef, junior = true) {
    super(voyage.level, { junior });
    this.voyage = voyage;
    if (voyage.weather.drift) {
      this.world.windField = (time) => weatherWind(voyage.weather, time);
      this.world.wind = this.world.windField(0);
    }
    this.chapter = voyage.pack;
    this.state = "exploring";
    this.autoFire = false;
    this.player.spec = {
      ...this.player.spec,
      maxSpeed: 12,
      turnRate: 1.15,
      acceleration: 4,
      reloadTime: 1.7,
      cannonRange: 80,
    };
    this.player.sail = 2;
    this.treasures = [
      {
        id: 0,
        chapter: voyage.pack,
        name: "The far sea",
        prize: "1,000 gold",
        icon: "✦",
        pos: { ...voyage.finish },
        island: voyage.level.islands.length - 1,
        found: false,
        progress: 0,
      },
    ];
    for (const e of voyage.level.waves[0]!.enemies) {
      const ship = this.world.addShip(
        {
          ...SHIP_SPECS[e.ship],
          damage: 4 + Math.floor(stageOf(voyage.index) / 4),
          maxHull: e.ship === "sloop" ? 100 : SHIP_SPECS[e.ship].maxHull,
        },
        "pirates",
        e.pos,
        e.heading,
      );
      ship.sail = 1;
      this.brains.set(
        ship.id,
        createBrain(ship.id, e.patrol, {
          detectRange: 80,
          fleeAt: 0,
          telegraph: stageOf(voyage.index) < 6 ? 1.8 : 1.2,
        }),
      );
    }
    for (const i of voyage.forts) this.fortClocks.set(i, 1.5 + i * 0.4);
    this.events = [];
  }
  /** The player chooses when to shoot; the crew chooses the loaded broadside. */
  get firingSide(): Side {
    const ship = this.player;
    const enemy = this.enemies
      .filter(
        (s) =>
          s.alive && distance(s.pos, ship.pos) < ship.spec.cannonRange * 1.1,
      )
      .sort((a, b) => distance(a.pos, ship.pos) - distance(b.pos, ship.pos))[0];
    if (enemy)
      return angleDiff(ship.heading, headingTo(ship.pos, enemy.pos)) > 0
        ? "starboard"
        : "port";
    return ship.reload.starboard <= ship.reload.port ? "starboard" : "port";
  }
  get targetInArc(): boolean {
    const aim = findAim(this.player, this.firingSide, this.enemies);
    return aim.distance < this.player.spec.cannonRange * 0.92;
  }
  override step(intent: ShipIntent = IDLE_INTENT, dt = SIM_DT): void {
    this.events = [];
    this.simEvents = [];
    if (this.state === "lost") {
      // The level is over, but its dead ship still animates beneath the water.
      updateShip(this.player, IDLE_INTENT, this.world.wind, dt);
      return;
    }
    if (this.state === "won") return;
    this.elapsed += dt;
    if (this.voyage.pack === 0)
      intent = { ...intent, firePort: false, fireStarboard: false };
    if (intent.firePort && intent.fireStarboard) {
      const side = this.firingSide;
      intent = {
        ...intent,
        firePort: side === "port",
        fireStarboard: side === "starboard",
      };
    }
    this.world.setIntent(this.player.id, intent);
    for (const brain of this.brains.values()) {
      const ship = this.world.getShip(brain.shipId);
      if (ship)
        this.world.setIntent(
          ship.id,
          thinkAi(
            brain,
            ship,
            this.player,
            this.world.islands,
            dt,
            this.world.bounds,
          ),
        );
    }
    const before = this.player.hull;
    this.simEvents = this.world.step(dt);
    const crashed = this.level.islands.find((island) => {
      // Capsule hull: the bow/stern can strike before the ship's center arrives.
      const dx = island.pos.x - this.player.pos.x,
        dz = island.pos.z - this.player.pos.z,
        fx = Math.sin(this.player.heading),
        fz = Math.cos(this.player.heading),
        halfLength = this.player.spec.length * 0.4,
        along = Math.max(-halfLength, Math.min(halfLength, dx * fx + dz * fz));
      return (
        Math.hypot(dx - fx * along, dz - fz * along) <=
        island.radius + this.player.spec.beam * 0.6 + 1e-6
      );
    });
    if (crashed) {
      this.failureReason = crashed.kind === "sand" ? "island" : "rocks";
      const damage = this.player.hull;
      if (damageShip(this.player, damage)) {
        this.simEvents.push(
          {
            type: "hit",
            shipId: this.player.id,
            x: this.player.pos.x,
            y: 1,
            z: this.player.pos.z,
            damage,
          },
          { type: "sunk", shipId: this.player.id },
        );
      }
      this.player.sail = 0;
      this.damageTaken += Math.max(0, before - this.player.hull);
      this.state = "lost";
      this.events.push({ type: "state", state: "lost" });
      return;
    }
    for (const [i, clock] of this.fortClocks) {
      const next = clock - dt;
      this.fortClocks.set(i, next);
      if (next <= 0) {
        this.fortClocks.set(i, 4.5);
        const p = this.level.islands[i]!.pos;
        if (distance(p, this.player.pos) < 92) {
          const aim = aimFortShot(p, this.player);
          const id = -Math.round(this.elapsed * 1000) - i;
          this.world.balls.push({
            id,
            ownerId: -i - 1,
            team: "pirates",
            pos: { x: p.x, y: 12, z: p.z },
            vel: aim.velocity,
            damage:
              this.voyage.pack === 1 && stageOf(this.voyage.index) < 4
                ? 12
                : 18,
            alive: true,
          });
          this.fortTargets.set(id, {
            x: aim.x,
            z: aim.z,
            impactAt: this.elapsed + aim.flight,
          });
          this.simEvents.push({
            type: "fire",
            shipId: -i - 1,
            side: "port",
            muzzles: [{ x: p.x, y: 12, z: p.z }],
          });
        }
      }
    }
    // Currents blend smoothly at the rim. Full sail and deliberate steering can escape.
    this.voyage.whirlpools.forEach((w, i) => {
      const dx = this.player.pos.x - w.x,
        dz = this.player.pos.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d >= w.radius) return;
      const nx = d > 0.01 ? dx / d : 1,
        nz = d > 0.01 ? dz / d : 0;
      const influence = (1 - d / w.radius) ** 2;
      const pull = w.strength * influence,
        swirl = pull * 1.2 * w.spin;
      this.player.pos.x += (-nx * pull - nz * swirl) * dt;
      this.player.pos.z += (-nz * pull + nx * swirl) * dt;
      this.player.heading = wrapAngle(
        this.player.heading + w.spin * influence * 0.55 * dt,
      );
      if (
        d < w.radius * 0.3 &&
        this.elapsed - (this.whirlpoolHits.get(i) ?? -10) >= 1.5
      ) {
        this.whirlpoolHits.set(i, this.elapsed);
        damageShip(this.player, 8);
        this.simEvents.push({
          type: "hit",
          shipId: this.player.id,
          x: this.player.pos.x,
          y: 1,
          z: this.player.pos.z,
          damage: 8,
        });
      }
    });
    const k = this.voyage.kraken;
    if (
      k &&
      Math.sin(this.elapsed * 0.7) > 0.45 &&
      distance(this.player.pos, k) < 18 &&
      this.elapsed - this.krakenHit > 2
    ) {
      this.krakenHit = this.elapsed;
      damageShip(this.player, 16);
      this.simEvents.push({
        type: "hit",
        shipId: this.player.id,
        x: this.player.pos.x,
        y: 2,
        z: this.player.pos.z,
        damage: 16,
      });
    }
    this.damageTaken += Math.max(0, before - this.player.hull);
    if (!this.player.alive) {
      if (this.options.junior) {
        this.player.alive = true;
        this.player.hull = this.player.spec.maxHull;
        this.player.sinkTime = 0;
        this.rescues++;
        this.events.push({ type: "rescue" });
      } else {
        this.state = "lost";
        this.events.push({ type: "state", state: "lost" });
        return;
      }
    }
    for (const gem of this.voyage.gems)
      if (!gem.found && distance(gem, this.player.pos) < 10) {
        gem.found = true;
        this.gemsFound++;
        this.events.push({ type: "gold", amount: 1, x: gem.x, z: gem.z });
      }
    const t = this.treasures[0]!;
    // Both branches lead to a broad exit. Young captains need not hit a tiny point.
    const atExit =
      this.player.pos.z >= this.voyage.finish.z - 15 &&
      this.player.pos.z < this.voyage.finish.z + 45 &&
      Math.abs(this.player.pos.x) < 78;
    if (atExit) {
      t.progress = Math.min(1, t.progress + dt / 0.8);
      if (t.progress >= 1) {
        t.found = true;
        this.state = "won";
        this.player.sail = 0;
        const damage = this.damageTaken / this.player.spec.maxHull;
        this.stars =
          damage <= 0.15 && this.rescues === 0
            ? 3
            : damage <= 0.55 && this.rescues === 0
              ? 2
              : 1;
        this.events.push(
          { type: "treasure", treasure: t },
          { type: "state", state: "won" },
        );
      }
    } else t.progress = 0;
  }
  get incomingFortShots(): { x: number; z: number; remaining: number }[] {
    for (const id of this.fortTargets.keys())
      if (!this.world.balls.some((b) => b.id === id && b.alive))
        this.fortTargets.delete(id);
    return [...this.fortTargets.values()].map((t) => ({
      x: t.x,
      z: t.z,
      remaining: Math.max(0, t.impactAt - this.elapsed),
    }));
  }
  get fortWarnings(): { x: number; z: number; ready: number }[] {
    return [...this.fortClocks].map(([i, time]) => ({
      ...this.level.islands[i]!.pos,
      ready: time,
    }));
  }
}

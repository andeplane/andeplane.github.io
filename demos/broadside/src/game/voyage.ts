import type { LevelDef, IslandDef, EnemyDef } from "./levels";
import { Rng } from "../sim/rng";
import { Session } from "./session";
import {
  IDLE_INTENT,
  damageShip,
  SHIP_SPECS,
  type ShipIntent,
  type Side,
} from "../sim/ships";
import { distance, angleDiff, headingTo } from "../sim/math";
import { elevationForTarget, findAim } from "../sim/cannons";
import { thinkAi, createBrain } from "./ai";
import { SIM_DT } from "../sim/world";

export const PACKS = [
  {
    name: "First sails",
    subtitle: "Learn the wheel · secret passages",
    color: "#7ce5c5",
  },
  {
    name: "Pirate waters",
    subtitle: "Your first cannons · cheeky rivals",
    color: "#ffc877",
  },
  {
    name: "Fortress coast",
    subtitle: "Island cannons · narrow escapes",
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
    story: "Your very first chest of shining gold. A fortune in adventures.",
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
  "A little captain",
  "Between the palms",
  "The secret passage",
  "Hello, pirates!",
  "Two ways home",
  "Captain’s crossing",
  "The watchful island",
  "Through the crossfire",
  "The fortress escape",
  "Something below",
  "The purple passage",
  "The last horizon",
];
export interface VoyageDef {
  index: number;
  pack: number;
  level: LevelDef;
  finish: { x: number; z: number };
  gems: { x: number; z: number; found: boolean }[];
  forts: number[];
  kraken: { x: number; z: number } | null;
}
/** Seeded templates keep a wide, tested route on both sides of every obstacle. */
export function generateVoyage(
  index: number,
  seed = 4100 + index * 137,
): VoyageDef {
  const pack = Math.floor(index / 3),
    stage = index % 3,
    rng = new Rng(seed);
  const islands: IslandDef[] = [];
  const add = (
    x: number,
    z: number,
    radius: number,
    props: IslandDef["props"],
    kind: "sand" | "rock" = "sand",
  ) => islands.push({ pos: { x, z }, radius, props, kind });
  add(-53, -43, 18, ["palms"]);
  add(54, 0, 18, pack === 2 ? ["fort"] : ["lighthouse", "palms"]);
  if (index > 0)
    add(rng.range(-4, 4), 35, stage === 2 ? 19 : 14, ["rocks", "palms"]);
  add(-58, 79, 20, pack >= 2 ? ["fort", "palms"] : ["palms"]);
  if (stage > 0) add(57, 110, 15, ["rocks"], "rock");
  add(0, 185, 26, ["palms"]);
  const enemies: EnemyDef[] =
    pack === 0
      ? []
      : [
          {
            ship:
              index === 11 ? "warship" : stage === 2 ? "brigantine" : "sloop",
            pos: { x: 32, z: pack === 1 ? -75 : 12 },
            heading: -Math.PI / 2,
            patrol: [
              { x: 30, z: 12 },
              { x: -25, z: 80 },
            ],
          },
        ];
  if (pack > 0 && stage > 0)
    enemies.push({
      ship: "sloop",
      pos: { x: -28, z: 100 },
      heading: Math.PI / 2,
      patrol: [
        { x: -28, z: 100 },
        { x: 22, z: 65 },
      ],
    });
  return {
    index,
    pack,
    finish: { x: 0, z: 148 },
    gems: [
      { x: index === 0 ? 0 : -29, z: 20, found: false },
      { x: 30, z: 85, found: false },
      { x: -25, z: 126, found: false },
    ],
    forts:
      pack >= 2
        ? islands.flatMap((i, n) => (i.props.includes("fort") ? [n] : []))
        : [],
    kraken: pack === 3 ? { x: stage === 1 ? -25 : 25, z: 70 } : null,
    level: {
      id: `voyage-${index}`,
      name: NAMES[index] ?? `Voyage ${index + 1}`,
      intro:
        pack === 0
          ? "Steer through the islands. Find the glowing treasure at the far sea."
          : pack === 1
            ? "Steer past the pirates. Turn your side toward them and tap BOOM!"
            : pack === 2
              ? "Watch the red warning rings. Island cannons guard these waters!"
              : "Purple ripples warn you: the kraken is waking!",
      seed,
      wind: { direction: 1.3, strength: 0.9 },
      bounds: 260,
      islands,
      player: { ship: "galleon", pos: { x: 0, z: -90 }, heading: 0 },
      waves: [
        {
          title: "Pirate waters",
          subtitle: "You can sail past or fight!",
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
  private grounded = new Set<number>();
  constructor(voyage: VoyageDef, junior = true) {
    super(voyage.level, { junior });
    this.voyage = voyage;
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
        prize: RELICS[voyage.index]!.name,
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
          damage: 4,
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
          detectRange: 65,
          fleeAt: 0,
          telegraph: 1.2,
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
    if (this.state === "won" || this.state === "lost") return;
    this.elapsed += dt;
    if (this.voyage.pack === 0)
      intent = { ...intent, firePort: false, fireStarboard: false };
    else if (intent.firePort && intent.fireStarboard) {
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
    for (const i of this.grounded)
      if (
        distance(this.player.pos, this.level.islands[i]!.pos) >
        this.level.islands[i]!.radius + this.player.spec.beam * 0.6 + 2
      )
        this.grounded.delete(i);
    for (const e of this.simEvents)
      if (e.type === "bump" && e.shipId === this.player.id) {
        const i = this.level.islands.findIndex(
          (island) =>
            distance(this.player.pos, island.pos) <
            island.radius + this.player.spec.beam * 0.6 + 1,
        );
        if (i >= 0 && !this.grounded.has(i)) {
          this.grounded.add(i);
          damageShip(this.player, this.options.junior ? 10 : 20);
        }
      }
    for (const [i, clock] of this.fortClocks) {
      const next = clock - dt;
      this.fortClocks.set(i, next);
      if (next <= 0) {
        this.fortClocks.set(i, 4.5);
        const p = this.level.islands[i]!.pos;
        if (distance(p, this.player.pos) < 92) {
          const dx = this.player.pos.x - p.x,
            dz = this.player.pos.z - p.z,
            d = Math.hypot(dx, dz),
            speed = 25;
          this.world.balls.push({
            id: -Math.round(this.elapsed * 1000) - i,
            ownerId: -i - 1,
            team: "pirates",
            pos: { x: p.x, y: 12, z: p.z },
            vel: {
              x: (dx / d) * speed * Math.cos(elevationForTarget(d, speed, 12)),
              y: speed * Math.sin(elevationForTarget(d, speed, 12)),
              z: (dz / d) * speed * Math.cos(elevationForTarget(d, speed, 12)),
            },
            damage: 18,
            alive: true,
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
  get fortWarnings(): { x: number; z: number; ready: number }[] {
    return [...this.fortClocks].map(([i, time]) => ({
      ...this.level.islands[i]!.pos,
      ready: time,
    }));
  }
}

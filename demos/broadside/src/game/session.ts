import { createTreasures, CHAPTERS, type Treasure } from "./adventure";
import { distance, angleDiff, headingTo } from "../sim/math";
import { createBrain, thinkAi, type AiBrain } from "./ai";
import type { LevelDef } from "./levels";
import {
  IDLE_INTENT,
  repairShip,
  SHIP_SPECS,
  type Ship,
  type ShipIntent,
} from "../sim/ships";
import { SIM_DT, World, type SimEvent } from "../sim/world";

export type SessionState =
  | "intro"
  | "battle"
  | "between-waves"
  | "won"
  | "lost"
  | "exploring"
  | "reward";

export type GameEvent =
  | { type: "banner"; title: string; subtitle: string }
  | { type: "gold"; amount: number; x: number; z: number }
  | { type: "state"; state: SessionState }
  | { type: "treasure"; treasure: Treasure }
  | { type: "rescue" }
  | { type: "reward"; chapter: number };

/** Seconds before the first wave, and between waves. */
export const INTRO_TIME = 4;
export const WAVE_GAP = 5;

/**
 * One play-through of a level: the world, the enemy brains, wave progression,
 * score, and win/lose. Fully headless so it can be tested and soak-simulated.
 */
export class Session {
  world!: World;
  player!: Ship;
  state: SessionState = "intro";
  waveIndex = -1;
  gold = 0;
  readonly brains = new Map<number, AiBrain>();
  readonly bossIds = new Set<number>();
  /** Game-level events from the most recent step. */
  events: GameEvent[] = [];
  simEvents: SimEvent[] = [];
  treasures: Treasure[] = [];
  chapter = 0;
  rescues = 0;
  cruising = false;
  autoFire = true;
  sailColor = "#fff3d0";
  shield = 0;
  private timer = 0;
  private pending: GameEvent[] = [];

  constructor(
    readonly level: LevelDef,
    readonly options: { adventure?: boolean; junior?: boolean } = {},
  ) {
    this.restart();
  }

  restart(): void {
    const l = this.level;
    this.world = new World({
      seed: l.seed,
      wind: l.wind,
      bounds: l.bounds,
      islands: l.islands,
    });
    this.player = this.world.addShip(
      SHIP_SPECS[l.player.ship],
      "player",
      l.player.pos,
      l.player.heading,
    );
    this.brains.clear();
    this.bossIds.clear();
    this.state = this.options.adventure ? "exploring" : "intro";
    this.treasures = this.options.adventure ? createTreasures() : [];
    this.chapter = 0;
    this.rescues = 0;
    this.cruising = false;
    this.shield = 0;
    this.simEvents = [];
    if (this.options.adventure) {
      this.player.spec = {
        ...this.player.spec,
        turnRate: 1.05,
        maxSpeed: 15,
        acceleration: 5,
        reloadTime: 2.1,
        cannonRange: 85,
      };
      this.player.sail = 2;
    }
    this.waveIndex = -1;
    this.gold = 0;
    this.timer = 0;
    this.events = [];
    this.pending = [{ type: "banner", title: l.name, subtitle: l.intro }];
  }

  get enemies(): Ship[] {
    return this.world.ships.filter((s) => s.team === "pirates");
  }

  get wavesTotal(): number {
    return this.level.waves.length;
  }

  step(playerIntent: ShipIntent = IDLE_INTENT, dt: number = SIM_DT): void {
    this.events = this.pending;
    this.pending = [];
    this.timer += dt;
    this.shield = Math.max(0, this.shield - dt);
    if (this.options.adventure && this.state === "reward") return;
    if (this.options.adventure && this.autoFire && this.player.alive) {
      playerIntent = { ...playerIntent };
      for (const enemy of this.enemies) {
        if (
          !enemy.alive ||
          distance(this.player.pos, enemy.pos) > this.player.spec.cannonRange
        )
          continue;
        const angle = angleDiff(
          this.player.heading,
          headingTo(this.player.pos, enemy.pos),
        );
        if (Math.abs(Math.abs(angle) - Math.PI / 2) < 0.85) {
          if (angle > 0) playerIntent.fireStarboard = true;
          else playerIntent.firePort = true;
        }
      }
    }
    if (this.options.junior && this.shield > 0) {
      for (let i = this.world.balls.length - 1; i >= 0; i--) {
        const b = this.world.balls[i]!;
        if (
          b.team === "pirates" &&
          Math.hypot(b.pos.x - this.player.pos.x, b.pos.z - this.player.pos.z) <
            18
        )
          this.world.balls.splice(i, 1);
      }
    }

    if (this.player.alive) this.world.setIntent(this.player.id, playerIntent);
    for (const brain of this.brains.values()) {
      const ship = this.world.getShip(brain.shipId);
      if (!ship) {
        this.brains.delete(brain.shipId);
        continue;
      }
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

    this.simEvents = this.world.step(dt);
    if (this.options.junior && !this.player.alive) {
      this.player.alive = true;
      this.player.hull = this.player.spec.maxHull;
      this.player.sinkTime = 0;
      this.shield = 6;
      this.rescues++;
      this.simEvents = this.simEvents.filter(
        (e) => !(e.type === "sunk" && e.shipId === this.player.id),
      );
      this.events.push(
        { type: "rescue" },
        {
          type: "banner",
          title: "Pip to the rescue!",
          subtitle: "Your parrot patched the ship. Let's keep going!",
        },
      );
    }
    for (const e of this.simEvents) {
      if (e.type !== "sunk") continue;
      const ship = this.world.getShip(e.shipId);
      if (ship && ship.team === "pirates") {
        this.gold += ship.spec.bounty;
        this.events.push({
          type: "gold",
          amount: ship.spec.bounty,
          x: ship.pos.x,
          z: ship.pos.z,
        });
      }
    }
    if (this.options.adventure) this.advanceAdventure(dt);
    else this.advanceState();
  }

  get activeTreasures(): Treasure[] {
    return this.treasures.filter(
      (t) => (this.cruising || t.chapter === this.chapter) && !t.found,
    );
  }

  startCruise(): void {
    if (this.state !== "won") return;
    this.cruising = true;
    this.chapter = 0;
    this.world.ships.splice(0, this.world.ships.length, this.player);
    this.world.balls.splice(0);
    this.brains.clear();
    this.bossIds.clear();
    this.treasures = createTreasures();
    this.player.hull = this.player.spec.maxHull;
    this.player.sail = 2;
    this.setState("exploring");
    this.pending.push({
      type: "banner",
      title: "A treasure cruise!",
      subtitle: "All the islands are yours to explore. Happy sailing, Captain!",
    });
  }

  continueAdventure(): void {
    if (this.state !== "reward") return;
    this.chapter++;
    this.player.hull = this.player.spec.maxHull;
    this.player.spec = {
      ...this.player.spec,
      damage: this.player.spec.damage + 3,
      maxSpeed: this.player.spec.maxSpeed + 1,
    };
    this.player.sail = 2;
    this.pending.push({
      type: "banner",
      title: CHAPTERS[this.chapter]!.name,
      subtitle: CHAPTERS[this.chapter]!.subtitle,
    });
    this.setState("exploring");
  }

  private advanceAdventure(dt: number): void {
    if (this.state === "won" || this.state === "lost") return;
    if (!this.player.alive) {
      this.setState("lost");
      return;
    }
    if (this.state === "exploring") {
      for (const t of this.activeTreasures) {
        const near = distance(this.player.pos, t.pos) < 19;
        t.progress = near
          ? Math.min(1, t.progress + dt / 1.2)
          : Math.max(0, t.progress - dt);
        if (t.progress >= 1) {
          t.found = true;
          this.gold += 150;
          repairShip(this.player, this.player.spec.maxHull);
          this.events.push(
            { type: "treasure", treasure: t },
            { type: "gold", amount: 150, x: t.pos.x, z: t.pos.z },
          );
        }
      }
      if (this.activeTreasures.length === 0 && !this.cruising) {
        this.startWave(this.chapter);
      }
    } else if (this.state === "battle" && this.enemies.every((s) => !s.alive)) {
      repairShip(this.player, this.player.spec.maxHull);
      if (this.chapter === CHAPTERS.length - 1) {
        this.setState("won");
        this.events.push({
          type: "banner",
          title: "You're a pirate legend!",
          subtitle: "All six treasures are yours. The cove is safe!",
        });
      } else {
        this.setState("reward");
        this.events.push({ type: "reward", chapter: this.chapter });
      }
    }
  }

  private setState(state: SessionState): void {
    this.state = state;
    this.timer = 0;
    this.events.push({ type: "state", state });
  }

  private advanceState(): void {
    if (this.state === "won" || this.state === "lost") return;
    if (!this.player.alive) {
      this.events.push({
        type: "banner",
        title: "Abandon ship!",
        subtitle: "The cove has fallen. Press R to try again.",
      });
      this.setState("lost");
      return;
    }
    switch (this.state) {
      case "intro":
        if (this.timer >= INTRO_TIME) this.startWave(0);
        break;
      case "battle":
        if (this.enemies.every((s) => !s.alive)) {
          if (this.waveIndex >= this.level.waves.length - 1) {
            this.events.push({
              type: "banner",
              title: "Victory!",
              subtitle: "Sunset Cove is safe. The harbour cheers your name!",
            });
            this.setState("won");
          } else {
            repairShip(
              this.player,
              this.player.spec.maxHull * this.level.repairBetweenWaves,
            );
            this.events.push({
              type: "banner",
              title: "Wave cleared!",
              subtitle: "The carpenters patch the hull. More sails approach...",
            });
            this.setState("between-waves");
          }
        }
        break;
      case "between-waves":
        if (this.timer >= WAVE_GAP) this.startWave(this.waveIndex + 1);
        break;
    }
  }

  private startWave(index: number): void {
    const wave = this.level.waves[index];
    /* c8 ignore next */
    if (!wave) return;
    this.waveIndex = index;
    for (const e of wave.enemies) {
      const ship = this.world.addShip(
        SHIP_SPECS[e.ship],
        "pirates",
        e.pos,
        e.heading,
      );
      ship.sail = 2;
      if (this.options.adventure)
        ship.spec = {
          ...ship.spec,
          maxHull: ship.spec.maxHull * 0.7,
          damage: ship.spec.damage * (this.options.junior ? 0.5 : 0.9),
        };
      ship.hull = ship.spec.maxHull;
      this.brains.set(
        ship.id,
        createBrain(
          ship.id,
          e.patrol,
          e.boss ? { fleeAt: 0, telegraph: 1.4, detectRange: 160 } : {},
        ),
      );
      if (e.boss) this.bossIds.add(ship.id);
    }
    this.events.push({
      type: "banner",
      title: wave.title,
      subtitle: wave.subtitle,
    });
    this.setState("battle");
  }
}

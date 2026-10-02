import { describe, expect, it } from "vitest";
import { createBrain, thinkAi } from "./ai";
import { SUNSET_COVE, type LevelDef } from "./levels";
import { INTRO_TIME, Session, WAVE_GAP, type GameEvent } from "./session";
import { distance } from "../sim/math";
import { SHIP_SPECS } from "../sim/ships";
import { SIM_DT } from "../sim/world";

const tiny: LevelDef = {
  ...SUNSET_COVE,
  islands: [],
  waves: [
    { title: "One", subtitle: "", enemies: [{ ship: "sloop", pos: { x: 40, z: -110 }, heading: 0, patrol: [{ x: 40, z: 0 }] }] },
    { title: "Two", subtitle: "", enemies: [{ ship: "sloop", boss: true, pos: { x: 40, z: -110 }, heading: 0, patrol: [{ x: 40, z: 0 }] }] },
  ],
};

const runFor = (s: Session, seconds: number) => {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += SIM_DT) {
    s.step();
    events.push(...s.events);
  }
  return events;
};

const sinkAllEnemies = (s: Session) => {
  for (const e of s.enemies) e.hull = 0.01;
  for (const e of s.enemies) {
    e.hull = 0;
    e.alive = false;
  }
};

describe("Session", () => {
  it("opens with the level banner and an intro countdown", () => {
    const s = new Session(SUNSET_COVE);
    expect(s.state).toBe("intro");
    s.step();
    expect(s.events[0]).toMatchObject({ type: "banner", title: "Sunset Cove" });
    s.step();
    expect(s.events).toHaveLength(0);
    expect(s.wavesTotal).toBe(3);
  });

  it("launches wave 1 after the intro", () => {
    const s = new Session(SUNSET_COVE);
    const events = runFor(s, INTRO_TIME + 0.1);
    expect(s.state).toBe("battle");
    expect(s.waveIndex).toBe(0);
    expect(s.enemies).toHaveLength(2);
    expect(events.some((e) => e.type === "banner" && e.title === SUNSET_COVE.waves[0]!.title)).toBe(true);
  });

  it("repairs between waves, then wins after the last wave, awarding gold", () => {
    const s = new Session(tiny);
    runFor(s, INTRO_TIME + 0.1);
    s.player.hull = 100;
    const bounty = SHIP_SPECS.sloop.bounty;
    sinkAllEnemies(s);
    s.step();
    expect(s.state).toBe("between-waves");
    expect(s.player.hull).toBeGreaterThan(100);
    runFor(s, WAVE_GAP + 0.1);
    expect(s.state).toBe("battle");
    expect(s.bossIds.size).toBe(1);
    // Sink the boss with a real hit so gold is paid out.
    const boss = s.enemies[0]!;
    boss.hull = 1;
    s.world.balls.push({
      id: 999, ownerId: s.player.id, team: "player", alive: true, damage: 50,
      pos: { x: boss.pos.x, y: 1, z: boss.pos.z }, vel: { x: 0, y: 0, z: 0 },
    });
    s.step();
    expect(s.gold).toBe(bounty);
    expect(s.events.some((e) => e.type === "gold")).toBe(true);
    expect(s.state).toBe("won");
    s.step();
    expect(s.state).toBe("won");
  });

  it("is lost when the player sinks, and can restart", () => {
    const s = new Session(tiny);
    s.player.hull = 0;
    s.player.alive = false;
    s.step();
    expect(s.state).toBe("lost");
    expect(s.events.some((e) => e.type === "state" && e.state === "lost")).toBe(true);
    s.restart();
    expect(s.state).toBe("intro");
    expect(s.player.alive).toBe(true);
    expect(s.gold).toBe(0);
  });

  it("forgets brains for ships that have left the world", () => {
    const s = new Session(tiny);
    runFor(s, INTRO_TIME + 0.1);
    expect(s.brains.size).toBe(1);
    const enemy = s.enemies[0]!;
    s.world.ships.splice(s.world.ships.indexOf(enemy), 1);
    s.step();
    expect(s.brains.size).toBe(0);
  });

  it("a passive captain eventually gets sunk (the enemies are dangerous)", () => {
    const s = new Session(SUNSET_COVE);
    for (let t = 0; t < 600 && s.state !== "lost"; t += SIM_DT) s.step();
    expect(s.state).toBe("lost");
  }, 20_000);

  it("a competent captain usually wins Sunset Cove (balance soak test across seeds)", () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = new Session({ ...SUNSET_COVE, seed });
      // Drive the player with the enemy AI itself, minus the telegraph delay.
      const brain = createBrain(s.player.id, [{ x: 0, z: 0 }], { telegraph: 0, fleeAt: 0, detectRange: 600 });
      for (let t = 0; t < 900 && s.state !== "won" && s.state !== "lost"; t += SIM_DT) {
        const alive = s.enemies.filter((e) => e.alive);
        const target = alive.sort((a, b) => distance(a.pos, s.player.pos) - distance(b.pos, s.player.pos))[0];
        s.step(thinkAi(brain, s.player, target, s.world.islands, SIM_DT, s.world.bounds));
      }
      if (s.state === "won") {
        wins++;
        expect(s.gold).toBeGreaterThan(1000);
      }
    }
    // Level 1 should be winnable but not a walkover. Retune if this fails.
    expect(wins).toBeGreaterThanOrEqual(6);
  }, 60_000);
});

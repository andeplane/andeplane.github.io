// Every tunable in one place. Balancing happens here, not in scattered literals.

import type { TerrainShape } from './engine/map'

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
    /** Fraction of local fluid velocity a spore rides (1 = passive drifter). */
    carry: 1.0,
    /** Constant downstream swim bias (lattice units) — no spore stalls forever. */
    swim: 0.018,
    /**
     * Spores need current to breathe: below this flow speed they suffocate.
     * This is what makes SEALING an arm a real (and paying) defense — spores
     * spawned behind your seal die in still water instead of zombie-stalling
     * the wave, and dead eddies are lethal pockets.
     */
    stagnantU: 0.01,
    /** HP lost per tick while suffocating (hp 1 dies in ~1.4 s). */
    suffocate: 0.012,
    /** Random wander speed (lattice units) — swarms read as alive, not beads. */
    wander: 0.02,
    /** Per-tick velocity smoothing toward the flow (0..1). */
    steer: 0.3,
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
    kShear: 0.015,
    shearThreshold: 0.08,
    /**
     * Piping: pressure head above this erodes (scaled by porosity) AND blocks
     * self-healing. Set above stagnation heads from deflecting a jet (~0.02)
     * but below dam heads under surge (~0.05): routing walls are durable,
     * dams crack when the water hammers them.
     */
    kPipe: 1.6,
    pipeThreshold: 0.03,
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
    freshSolidity: 1.75,
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
  towers: {
    neutralizer: {
      cost: 40,
      radius: 16,
      /** Damage field rate at the centre (falls off to the rim). */
      rate: 0.09,
    },
    impeller: {
      cost: 30,
      radius: 11,
      /** Body force magnitude (lattice units) at the centre. */
      force: 0.0045,
    },
    /** Spins the water into a whirlpool (tangential + slight inward pull):
     *  spores caught in it circle instead of passing — park one on a kill
     *  ring and the ring gets many times the exposure. */
    vortex: {
      cost: 35,
      radius: 13,
      force: 0.005,
    },
  },
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
   * Levels are an arena (terrain, fractional coords, bedrock) + a wave table.
   * interval = ticks between spawns; arms = inlet segments (0 bottom, 1
   * middle, 2 top) the wave rides; surge waves slam the water hammer (faster
   * current, walls strain) while spores ride it.
   */
  levels: [
    {
      name: 'First Spores',
      description: 'Open water, three pillars. Learn the tools.',
      lives: 15,
      startingGold: 165,
      nominalFlux: 13.8,
      terrain: [
        { kind: 'disc', x: 0.32, y: 0.34, r: 13 },
        { kind: 'disc', x: 0.46, y: 0.68, r: 16 },
        { kind: 'disc', x: 0.62, y: 0.3, r: 11 },
      ] as readonly TerrainShape[],
      waves: [
        { count: 8, hp: 1, interval: 32, arms: [1] },
        { count: 12, hp: 1, interval: 26, arms: [1, 2] },
        { count: 16, hp: 1.6, interval: 22, arms: [0, 1, 2] },
        { count: 16, hp: 1.8, interval: 20, arms: [0, 1, 2], surge: true },
        { count: 20, hp: 2, interval: 16, arms: [0, 1, 2], surge: true },
      ],
    },
    {
      name: 'Crosscurrents',
      description: 'A serpentine canyon — the river snakes, and so must they.',
      lives: 12,
      startingGold: 150,
      nominalFlux: 4.2,
      // Alternating baffles force the whole flow into an S: three long jets
      // and three hairpin corners — every corner is a kill-zone opportunity.
      terrain: [
        { kind: 'bar', x0: 0.24, y0: 1, x1: 0.24, y1: 0.44, w: 8 },
        { kind: 'bar', x0: 0.47, y0: 0, x1: 0.47, y1: 0.56, w: 8 },
        { kind: 'bar', x0: 0.7, y0: 1, x1: 0.7, y1: 0.44, w: 8 },
        { kind: 'disc', x: 0.86, y: 0.6, r: 9 },
      ] as readonly TerrainShape[],
      waves: [
        { count: 10, hp: 1.2, interval: 26, arms: [0, 2] },
        { count: 14, hp: 1.6, interval: 22, arms: [0, 1, 2] },
        { count: 16, hp: 2.2, interval: 18, arms: [1], surge: true },
        { count: 20, hp: 2.6, interval: 16, arms: [0, 1, 2] },
        { count: 22, hp: 3.2, interval: 14, arms: [0, 2], surge: true },
        { count: 28, hp: 3.6, interval: 12, arms: [0, 1, 2], surge: true },
      ],
    },
    {
      name: 'Water Hammer',
      description: 'The narrows: everything funnels through one throat.',
      lives: 10,
      startingGold: 150,
      nominalFlux: 8.2,
      // Two huge lenses squeeze the whole river through a central throat —
      // surges through the narrows hammer like a burst pipe. Downstream
      // pillars split the exit jet into braided streams.
      terrain: [
        { kind: 'disc', x: 0.4, y: 1.08, r: 108 },
        { kind: 'disc', x: 0.4, y: -0.08, r: 108 },
        { kind: 'disc', x: 0.64, y: 0.5, r: 12 },
        { kind: 'disc', x: 0.8, y: 0.3, r: 10 },
        { kind: 'disc', x: 0.8, y: 0.7, r: 10 },
      ] as readonly TerrainShape[],
      waves: [
        { count: 12, hp: 1.6, interval: 22, arms: [0, 1, 2] },
        { count: 16, hp: 2.2, interval: 18, arms: [0, 1, 2], surge: true },
        { count: 20, hp: 2.8, interval: 15, arms: [1], surge: true },
        { count: 24, hp: 3.2, interval: 13, arms: [0, 1, 2] },
        { count: 26, hp: 3.8, interval: 12, arms: [0, 2], surge: true },
        { count: 30, hp: 4.2, interval: 10, arms: [0, 1, 2], surge: true },
        { count: 36, hp: 4.8, interval: 9, arms: [0, 1, 2], surge: true },
      ],
    },
  ],
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
} as const

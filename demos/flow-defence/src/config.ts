// Every tunable in one place. Balancing happens here, not in scattered literals.

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
    /** Extra density a full surge adds (the water-hammer spike). */
    surgeRho: 0.045,
    /** Extra velocity factor a full surge adds. */
    surgeU: 0.6,
  },
  biomass: {
    /** Inlet concentration (Dirichlet source) at release rate 1. */
    injectPerTick: 0.85,
  },
  erosion: {
    /** Integrity lost per tick per unit of shear speed above the threshold. */
    kShear: 0.012,
    shearThreshold: 0.065,
    /** Integrity lost per tick per unit of pressure head above the threshold, scaled by porosity. */
    kPipe: 0.45,
    pipeThreshold: 0.008,
    /** Minimum porosity of an intact wall — the seed leak that makes piping possible. */
    porosityEps: 0.02,
    /** Integrity regained per tick when stress is below cureStressMax (fresh
     *  walls harden; lightly-loaded walls slowly self-heal). */
    cureRate: 0.006,
    cureStressMax: 0.0008,
    /** Solidity a freshly painted wall starts at (soft placement: avoids the
     *  water-hammer shock of slamming a fully solid cell into moving fluid). */
    freshSolidity: 0.6,
  },
  build: {
    /** Brush radius (cells) for wall painting. */
    brushRadius: 1.6,
    /** Gold per wall cell. */
    wallCostPerCell: 0.12,
  },
  towers: {
    neutralizer: {
      cost: 45,
      radius: 14,
      /** Biomass decay rate per tick at the centre (falls off to the rim). */
      rate: 0.09,
    },
    impeller: {
      cost: 30,
      radius: 11,
      /** Body force magnitude (lattice units) at the centre. */
      force: 0.0045,
    },
  },
  attacker: {
    /** Reservoir → tank pump rate (biomass units per tick). */
    pumpRate: 9,
    /** Pressurized tank capacity (banked ammunition for surges). */
    tankCap: 5000,
    /** Ticks a surge lasts once triggered. */
    surgeTicks: 360,
  },
  match: {
    /** Defender leak budget: total biomass the outlet can absorb before loss. */
    leakBudget: 25000,
    /** Attacker's finite biomass reservoir for the match. */
    attackerReservoir: 140000,
    /** Defender starting gold. */
    startingGold: 160,
    /** Gold per unit of biomass neutralized by towers. */
    bountyPerBiomass: 0.012,
    /** Passive gold per second. */
    goldTrickle: 1.2,
    /** Commanded release is metered as conc × u × rows; reservoir debits this. */
    winDrainEpsilon: 400,
  },
  /**
   * Levels: difficulty = attacker resources × AI profile. requiredKill ≈
   * 1 − leakBudget/reservoir is the fraction of released biomass the defender
   * must stop; it should climb gently across levels.
   */
  levels: [
    {
      name: 'First Trickle',
      description: 'A lazy, steady seep. Learn the tools.',
      ai: 'steady',
      reservoir: 60000,
      leakBudget: 32000, // stop ~47%
      pumpRate: 6,
      tankCap: 3500,
      startingGold: 180,
    },
    {
      name: 'Probing Tides',
      description: 'The flow tests every arm, and commits.',
      ai: 'prober',
      reservoir: 110000,
      leakBudget: 30000, // stop ~73%
      pumpRate: 9,
      tankCap: 5000,
      startingGold: 160,
    },
    {
      name: 'Water Hammer',
      description: 'Banked pressure, brutal surges.',
      ai: 'burster',
      reservoir: 170000,
      leakBudget: 27000, // stop ~84%
      pumpRate: 12,
      tankCap: 6500,
      startingGold: 160,
    },
  ],
  /**
   * Carrier-dye tint per inlet segment. Deliberately quiet, single-family
   * water tones: dye shows the CURRENT, and must never compete with biomass
   * (hot pink), which is the only saturated threat color on screen.
   */
  segmentColors: [
    [0.3, 0.46, 0.58],
    [0.26, 0.42, 0.6],
    [0.32, 0.5, 0.56],
    [0.28, 0.44, 0.58],
    [0.3, 0.48, 0.6],
  ] as ReadonlyArray<readonly [number, number, number]>,
} as const

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
  },
  /** Dye hue per inlet segment (linear-ish RGB, HDR headroom applied in shader). */
  segmentColors: [
    [0.15, 0.75, 1.0],
    [0.5, 0.35, 1.0],
    [0.1, 1.0, 0.65],
    [1.0, 0.55, 0.2],
    [1.0, 0.3, 0.5],
  ] as ReadonlyArray<readonly [number, number, number]>,
} as const

/** Everything about the world the wall stands in, rather than the wall itself. */

export interface WorldOptions {
  gravity: number;
  /**
   * Ground contact frequency, rad/s. Expressing the penalty as a frequency rather than a
   * stiffness makes every node's contact spring cost the same critical time step
   * regardless of its mass, so adding a floor cannot silently destabilise the solver.
   */
  groundOmega: number;
  groundFriction: number;
  /** Multiplier on the CFL-critical time step. */
  safety: number;
}

export function defaultWorld(): WorldOptions {
  return { gravity: 9.81, groundOmega: 2e4, groundFriction: 0.6, safety: 0.7 };
}

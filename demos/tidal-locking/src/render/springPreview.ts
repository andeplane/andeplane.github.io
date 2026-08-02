import { sampleBall } from '../physics/sampling.ts';
import { buildSprings, type SpringNetwork } from '../physics/world.ts';
import type { SimParams } from '../physics/params.ts';

/**
 * Rebuild the spring topology on the render side.
 *
 * The worker owns the simulation and only ships particle positions, but the debug view
 * needs to know which pairs are bonded. Sampling is seeded and deterministic, so
 * running the same construction here reproduces the worker's network exactly, and no
 * connectivity has to cross the thread boundary.
 */
export function buildSpringNetworkPreview(params: SimParams): SpringNetwork {
  const points = sampleBall(params.particleCount, params.moonRadius, params.seed);
  return buildSprings(points, params.particleCount, params.moonRadius, params.neighborRadius);
}

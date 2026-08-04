import { Fn, uniform, float, min, max, abs, clamp } from 'three/tsl';

/**
 * Shared frame uniforms.
 *
 * `uTime` exists rather than TSL's built-in `time` because the CPU needs the
 * exact same value: boat buoyancy, the camera waterline test and spray
 * spawning all evaluate the Gerstner field in JS (world/waves.js). Two clocks
 * that drift apart would leave boats floating above the swell.
 */
export const uTime = uniform( 0 );

export function updateFrameUniforms( elapsed ) {

	uTime.value = elapsed;

}

/**
 * Fraction of the segment [ay → by] that lies below y = 0.
 *
 * Closed form covering all three cases without branching:
 *   both below → -min is large relative to |Δ| → clamps to 1
 *   both above → -min is negative               → clamps to 0
 *   straddling → |min| / |Δ| is the true fraction
 *
 * Lives here rather than in waterFog.js so both the fog node and the sky dome
 * can use it without a circular import (waterFog needs the sun from sky.js).
 */
export const submergedFraction = /*@__PURE__*/ Fn( ( [ ay, by ] ) => {

	const lo = min( ay, by );
	const span = max( abs( ay.sub( by ) ), float( 1e-4 ) );
	return clamp( lo.negate().div( span ), 0, 1 );

} ).setLayout( {
	name: 'submergedFraction',
	type: 'float',
	inputs: [ { name: 'ay', type: 'float' }, { name: 'by', type: 'float' } ],
} );

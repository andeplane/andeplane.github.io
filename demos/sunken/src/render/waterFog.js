import * as THREE from 'three/webgpu';
import {
	Fn, vec3, vec4, float, uniform, output, positionWorld, positionView,
	cameraPosition, exp, min, max, abs, clamp, mix, dot, normalize, pow, smoothstep,
} from 'three/tsl';

import { sunDirection, sunColor } from './sky.js';
import { submergedFraction } from './frame.js';

/**
 * Water volume — wavelength-dependent extinction (DESIGN §6.2).
 *
 * Assigned to `scene.fogNode`, so it applies to every material without any
 * per-material work.
 *
 * This is *the* effect that makes a scene read as underwater. `sigma` is a
 * vec3, so red is absorbed within a few metres while blue survives tens — a
 * single scalar fog physically cannot do that, and its absence is why most
 * "underwater" scenes just look like they have blue haze on them.
 *
 * The same node correctly does nothing when the player is above water looking
 * at the island, because the extinction distance is scaled by the fraction of
 * the camera→fragment ray that is actually below the surface.
 */

export const waterParams = {
	// Per-metre extinction, from clear tropical seawater: red ~2.5 m,
	// green ~13 m, blue ~60 m.
	//
	// The RATIO between green and blue is what sets the water's hue, and it is
	// easy to get wrong. An earlier pass used (0.34, 0.055, 0.036) — blue only
	// marginally longer-lived than green — so both survived to similar depths
	// and everything converged on a single flat teal. Real water absorbs green
	// roughly 4-5x faster than blue, which is why the ocean reads blue and not
	// teal.
	//
	// Magnitudes are deliberately ~half of physical. Real clear seawater kills
	// 88% of red by 5 m, which is accurate and looks dead: every coral in the
	// game is more than 5 m away most of the time, so a physically-correct
	// curve turns a reef into blue-grey lumps. Halving the coefficients while
	// keeping the RATIO intact preserves the blue cast and the sense of depth
	// but lets the reef keep its colour out to ~12 m.
	// Reduced again after looking at actual frames. Even at half-physical, an
	// orange coral 8 m away kept only 20% of its red and arrived pale mint —
	// the reef was "colourful" in the material and grey by the time it reached
	// the eye. The blue-dominant ratio is what sells water; the magnitude is a
	// dial, and it has to be turned down far enough for albedo to survive the
	// 5-15 m at which most of the reef is actually seen.
	sigma: uniform( new THREE.Vector3( 0.105, 0.030, 0.009 ) ),
	// Colour of the light scattered back toward the eye — the blue you see
	// looking into open water.
	tint: uniform( new THREE.Color( 0x2f7fd0 ) ),
	// How fast sunlight dims with depth.
	depthFalloff: uniform( 0.055 ),
	// Extra murk near the seabed where silt is stirred up.
	siltDepth: uniform( 0.0 ),
	// Aerial perspective for the above-water half of the ray.
	airColor: uniform( new THREE.Color( 0x9fc4de ) ),
	airDensity: uniform( 0.0016 ),
	// 0 = camera in air, 1 = camera submerged. Driven per-frame; post-processing
	// and audio read the same value so the whole game changes state together.
	submersion: uniform( 0 ),

	// How much sky the camera can see, 0..1, sampled from the same
	// `skyVisibilityAt` the mesher bakes.
	//
	// Without this, in-scattered light is a function of depth alone, so a cave
	// 20 m down glows exactly as brightly as open water 20 m down — the water
	// volume stays lit by a sun that cannot possibly reach it, and caves read as
	// hazy green rather than dark. One CPU sample per frame fixes it.
	skyExposure: uniform( 1 ),
};

export function createWaterFogNode() {

	return Fn( () => {

		const camY = cameraPosition.y;
		const fragY = positionWorld.y;

		const rayLength = positionView.length();
		const submerged = submergedFraction( camY, fragY );

		// ---- underwater single scattering --------------------------------
		const dWater = rayLength.mul( submerged );

		// Average depth of the submerged part of the ray.
		const avgDepth = min( camY, 0 ).add( min( fragY, 0 ) ).mul( - 0.5 );

		// Extra extinction close to the bottom (suspended silt).
		const sigma = waterParams.sigma.add(
			waterParams.siltDepth.mul( smoothstep( float( 10 ), float( 30 ), avgDepth ) )
		);

		const transmittance = exp( sigma.mul( dWater ).negate() );

		// Light reaching this depth, tinted by the sun's own colour.
		const sunAtten = exp( avgDepth.mul( waterParams.depthFalloff ).negate() );

		// Slight forward scattering: looking toward the sun brightens the water.
		const viewDir = normalize( positionWorld.sub( cameraPosition ) );
		const forward = pow( max( dot( viewDir, sunDirection.negate() ), 0 ), float( 3.0 ) ).mul( 0.35 ).add( 1 );

		const inscatter = vec3( waterParams.tint )
			.mul( sunColor )
			.mul( sunAtten )
			.mul( forward )
			.mul( 0.80 )
			// Ambient floor so a cave is dark, not black.
			.mul( waterParams.skyExposure.mul( 0.88 ).add( 0.12 ) );

		let colour = output.rgb.mul( transmittance ).add( inscatter.mul( transmittance.oneMinus() ) ).toVar();

		// ---- above-water aerial perspective ------------------------------
		const dAir = rayLength.mul( submerged.oneMinus() );
		const airT = exp( dAir.mul( waterParams.airDensity ).negate() );
		colour.assign( mix( vec3( waterParams.airColor ), colour, airT ) );

		return vec4( colour, output.a );

	} )();

}

/**
 * Keep `submersion` in sync with the camera each frame. Post-processing, the
 * audio low-pass and the HUD tint all read this one value, which is what makes
 * breaking the surface feel like a single event rather than three effects that
 * happen to change at once.
 */
export function updateCaveExposure( skyVisibility, dt ) {

	const current = waterParams.skyExposure.value;
	// Slow blend (~0.6 s): swimming past a cave mouth should feel like the light
	// closing in, not like a light switch.
	const k = 1 - Math.exp( - dt / 0.6 );
	waterParams.skyExposure.value = current + ( skyVisibility - current ) * k;
	return waterParams.skyExposure.value;

}

export function updateSubmersion( cameraY, surfaceY, dt ) {

	const target = cameraY < surfaceY ? 1 : 0;
	const current = waterParams.submersion.value;
	// ~0.15 s blend: fast enough to feel instant, slow enough not to strobe
	// when the waterline is chopping across the lens.
	const k = 1 - Math.exp( - dt / 0.15 );
	waterParams.submersion.value = current + ( target - current ) * k;
	return waterParams.submersion.value;

}

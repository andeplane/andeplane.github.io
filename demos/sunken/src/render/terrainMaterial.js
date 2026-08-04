import * as THREE from 'three/webgpu';
import {
	Fn, attribute, positionWorld, normalWorld, vec3, vec4, float, uniform,
	mx_noise_float, mx_fractal_noise_float, smoothstep, mix, clamp, max, abs, pow, dot,
} from 'three/tsl';

import { causticSample } from './caustics.js';

/**
 * Seabed / rock / island material.
 *
 * Everything is procedural — no texture downloads, and the detail scales with
 * world position so there is no visible tiling anywhere.
 *
 * The `sky` vertex attribute baked by the mesher (DESIGN §3.2) does a lot of
 * work here: it darkens cave interiors, keeps algae and coral colouring to
 * surfaces that actually see light, and later gates the caustics so they cannot
 * leak onto cave ceilings.
 */

export function createTerrainMaterial( { caustics = null } = {} ) {

	const material = new THREE.MeshStandardNodeMaterial( {
		roughness: 0.92,
		metalness: 0,
	} );

	const sky = attribute( 'sky', 'float' );

	const sandColor = uniform( new THREE.Color( 0xd9c9a3 ) );
	const sandDeep = uniform( new THREE.Color( 0x9fb0a6 ) );
	const rockColor = uniform( new THREE.Color( 0x5d6470 ) );
	const rockDark = uniform( new THREE.Color( 0x2f3a44 ) );
	// Algae is deliberately olive rather than grass-green, and applied weakly:
	// as a *broad* wash over most of the reef it was the single biggest source
	// of the overall green cast, competing with the corals it should be a
	// backdrop for.
	const algaeColor = uniform( new THREE.Color( 0x5a6b3a ) );
	const coralTintA = uniform( new THREE.Color( 0xc4553a ) );   // warm
	const coralTintB = uniform( new THREE.Color( 0x9a3f86 ) );   // cool
	const dryRock = uniform( new THREE.Color( 0x7d7566 ) );
	const beachColor = uniform( new THREE.Color( 0xe8d9b0 ) );

	// Exposed so phase 5 can plug caustics in without rewriting the material.
	material.userData.skyAttr = sky;

	material.colorNode = Fn( () => {

		const p = positionWorld;
		const n = normalWorld;
		const flatness = clamp( n.y, 0, 1 );

		// --- rock ---------------------------------------------------------
		const rockGrain = mx_fractal_noise_float( p.mul( 0.35 ), 4, 2, 0.5, 1 ).mul( 0.5 ).add( 0.5 );
		const strata = mx_noise_float( vec3( p.x.mul( 0.05 ), p.y.mul( 0.55 ), p.z.mul( 0.05 ) ), 1, 0 ).mul( 0.5 ).add( 0.5 );
		let rock = mix( rockDark, rockColor, rockGrain.mul( 0.6 ).add( strata.mul( 0.4 ) ) );

		// --- sand ---------------------------------------------------------
		// Ripples run along one axis, as wave-formed sand ripples do.
		const ripple = mx_noise_float( vec3( p.x.mul( 0.9 ), float( 0 ), p.z.mul( 0.22 ) ), 1, 0 );
		const grain = mx_fractal_noise_float( p.mul( 2.2 ), 3, 2, 0.5, 1 );
		const sandShade = ripple.mul( 0.12 ).add( grain.mul( 0.07 ) ).add( 0.5 );
		let sand = mix( sandDeep, sandColor, clamp( sandShade, 0, 1 ) );

		// Above the waterline the sand becomes dry beach.
		const dryness = smoothstep( float( - 1.2 ), float( 1.5 ), p.y );
		sand = mix( sand, beachColor, dryness );
		rock = mix( rock, dryRock, dryness.mul( 0.75 ) );

		// --- rock vs sand -------------------------------------------------
		// Sand settles on near-horizontal surfaces; the transition is broken up
		// by noise so it never reads as a hard contour line.
		const slopeNoise = mx_fractal_noise_float( p.mul( 0.12 ), 3, 2, 0.5, 1 ).mul( 0.18 );
		const sandiness = smoothstep( float( 0.62 ), float( 0.88 ), flatness.add( slopeNoise ) );
		let base = mix( rock, sand, sandiness );

		// --- living crust -------------------------------------------------
		// Algae and coral only where light reaches (sky) and mostly on rock.
		const lightExposure = clamp( sky, 0, 1 );
		const depthWarmth = smoothstep( float( - 26 ), float( - 6 ), p.y );

		const algaePatch = mx_fractal_noise_float( p.mul( 0.09 ).add( 17 ), 3, 2, 0.5, 1 ).mul( 0.5 ).add( 0.5 );
		const algaeMask = smoothstep( float( 0.45 ), float( 0.75 ), algaePatch )
			.mul( lightExposure )
			.mul( sandiness.oneMinus() )
			.mul( depthWarmth )
			.mul( dryness.oneMinus() );
		base = mix( base, algaeColor, algaeMask.mul( 0.26 ) );

		const coralPatch = mx_fractal_noise_float( p.mul( 0.23 ).sub( 61 ), 3, 2, 0.5, 1 ).mul( 0.5 ).add( 0.5 );
		const coralMask = smoothstep( float( 0.62 ), float( 0.86 ), coralPatch )
			.mul( lightExposure )
			.mul( sandiness.oneMinus() )
			.mul( smoothstep( float( - 22 ), float( - 4 ), p.y ) )
			.mul( dryness.oneMinus() );
		// Two coral hues, selected by an independent low-frequency noise, so the
		// encrusting colour drifts across the reef instead of tinting all of it
		// the same shade.
		const coralHue = mx_fractal_noise_float( p.mul( 0.045 ).add( 211 ), 2, 2, 0.5, 1 ).mul( 0.5 ).add( 0.5 );
		const coral = mix( coralTintA, coralTintB, smoothstep( float( 0.35 ), float( 0.65 ), coralHue ) );
		base = mix( base, coral, coralMask.mul( 0.7 ) );

		// --- ambient occlusion from the bake -------------------------------
		// Caves go genuinely dark; this is what makes the torch matter.
		const ao = clamp( sky.mul( 0.85 ).add( 0.15 ), 0, 1 );
		base = base.mul( mix( float( 0.10 ), float( 1.0 ), pow( ao, float( 0.85 ) ) ) );

		return vec4( base, 1 );

	} )();

	// Caustics are added as emissive rather than folded into albedo: they are
	// light arriving at the surface, so they must survive being in shadow of the
	// ambient term and must not be darkened by the surface's own colour.
	if ( caustics !== null ) {

		material.emissiveNode = Fn( () => {

			const amount = causticSample( caustics, positionWorld, normalWorld, sky );
			// Slightly blue-shifted white — caustic light has already been
			// filtered by a few metres of water on its way down.
			return vec3( 0.72, 0.95, 1.0 ).mul( amount ).mul( 0.7 );

		} )();

	}

	material.roughnessNode = Fn( () => {

		const wet = smoothstep( float( 1.5 ), float( - 1.2 ), positionWorld.y ); // wet below the waterline
		return clamp( float( 0.95 ).sub( wet.mul( 0.25 ) ), 0.35, 1 );

	} )();

	return material;

}

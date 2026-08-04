import * as THREE from 'three/webgpu';
import {
	Fn, attribute, positionLocal, positionWorld, normalWorld, vec2, vec3, vec4,
	float, uniform, sin, cos, clamp, mix, smoothstep, pow, max, min, abs, fract,
	mx_noise_float, instanceIndex,
} from 'three/tsl';

import { FLORA_BUILDERS } from '../geometry/flora.js';
import { scatterSpecies } from '../world/scatter.js';
import { uTime } from '../render/frame.js';
import { causticSample } from '../render/caustics.js';

/**
 * Instanced reef flora with vertex-shader sway (DESIGN §7.3).
 *
 * One InstancedMesh per species — ten draw calls for tens of thousands of
 * plants. The sway uses the `bend` attribute baked by the geometry builders,
 * squared so the base stays pinned and only the tip travels, plus a slow
 * large-scale gust so the whole bed breathes together instead of each plant
 * wobbling on its own private timer.
 */

/**
 * Placement rules per species (see world/scatter.js).
 *
 * Densities are deliberately restrained. An earlier pass packed the seabed so
 * tightly that props overlapped everywhere and the reef read as a scatter of
 * plastic toys rather than a landscape — the fix for "not enough life" is
 * bigger, better-shaped, better-coloured props, not simply more of them.
 *
 * Order matters only for readability. The first block is seabed *structure* —
 * rock and reef mass. The marching-cubes terrain is smooth at 0.6 m voxels, so
 * without these the ground has no readable scale; boulders and coral heads are
 * what turn a gradient into a seabed.
 */
export const FLORA_RULES = [
	{
		id: 'coralhead', density: 0.85, depth: [ - 24, - 4 ], minFlatness: 0.45,
		minSky: 0.35, maxSky: 1, scale: [ 0.5, 1.45 ], clearance: 4.0,
		hsv: [ 0.0536, 0.676, 0.812 ], hueRange: 0.4, saturate: 1.45, stiffness: 0.04,
	},
	{
		id: 'boulder', density: 0.2, depth: [ - 30, 3 ], minFlatness: 0.30,
		minSky: 0.0, maxSky: 1, scale: [ 0.4, 1.5 ], clearance: 8.0,
		hsv: [ 0.6333, 0.083, 0.471 ], hueRange: 0.05, stiffness: 0.0, alignToSlope: true,
	},
	{
		id: 'outcrop', density: 0.1, depth: [ - 30, 2 ], minFlatness: 0.25,
		minSky: 0.0, maxSky: 1, scale: [ 0.7, 2.0 ], clearance: 18.0,
		hsv: [ 0.5952, 0.127, 0.431 ], hueRange: 0.05, stiffness: 0.0, alignToSlope: true,
	},
	{
		id: 'rubble', density: 0.3, depth: [ - 30, - 2 ], minFlatness: 0.72,
		minSky: 0.0, maxSky: 1, scale: [ 0.6, 1.7 ], clearance: 2.6,
		hsv: [ 0.1167, 0.185, 0.847 ], hueRange: 0.06, stiffness: 0.0, alignToSlope: true,
	},
	{
		id: 'kelp', density: 0.30, depth: [ - 26, - 9 ], minFlatness: 0.55,
		minSky: 0.35, maxSky: 1, scale: [ 0.34, 0.62 ], clearance: 3.0,
		hsv: [ 0.2810, 0.574, 0.478 ], hueRange: 0.08, stiffness: 0.85,
	},
	{
		id: 'seagrass', density: 1.3, depth: [ - 24, - 4 ], minFlatness: 0.80,
		minSky: 0.45, maxSky: 1, scale: [ 0.5, 1.0 ], clearance: 1.1,
		hsv: [ 0.2704, 0.612, 0.627 ], hueRange: 0.08, stiffness: 1.0,
	},
	{
		id: 'staghorn', density: 0.85, depth: [ - 22, - 4 ], minFlatness: 0.35,
		minSky: 0.4, maxSky: 1, scale: [ 0.9, 2.0 ], clearance: 2.0,
		hsv: [ 0.0691, 0.622, 0.851 ], hueRange: 0.26, saturate: 1.45, stiffness: 0.12,
	},
	{
		id: 'seafan', density: 0.85, depth: [ - 28, - 8 ], minFlatness: 0.0,
		minSky: 0.25, maxSky: 1, scale: [ 1.0, 2.1 ], clearance: 2.2,
		hsv: [ 0.9578, 0.802, 0.831 ], hueRange: 0.2, saturate: 1.45, stiffness: 0.7, alignToSlope: true,
	},
	{
		id: 'brain', density: 0.55, depth: [ - 24, - 5 ], minFlatness: 0.6,
		minSky: 0.4, maxSky: 1, scale: [ 0.6, 1.5 ], clearance: 2.2,
		hsv: [ 0.1278, 0.556, 0.847 ], hueRange: 0.14, saturate: 1.45, stiffness: 0.05,
	},
	{
		id: 'sponge', density: 0.3, depth: [ - 28, - 8 ], minFlatness: 0.55,
		minSky: 0.15, maxSky: 1, scale: [ 0.6, 1.6 ], clearance: 3.0,
		hsv: [ 0.0391, 0.703, 0.831 ], hueRange: 0.24, saturate: 1.45, stiffness: 0.1,
	},
	{
		id: 'anemone', density: 0.65, depth: [ - 24, - 4 ], minFlatness: 0.5,
		minSky: 0.3, maxSky: 1, scale: [ 0.7, 1.5 ], clearance: 1.4,
		hsv: [ 0.0597, 0.598, 0.878 ], hueRange: 0.3, saturate: 1.45, stiffness: 1.0,
	},
	{
		id: 'urchin', density: 0.22, depth: [ - 28, - 4 ], minFlatness: 0.45,
		minSky: 0.0, maxSky: 1, scale: [ 0.6, 1.3 ], clearance: 1.2,
		hsv: [ 0.7976, 0.438, 0.251 ], hueRange: 0.1, saturate: 1.45, stiffness: 0.0,
	},
	{
		id: 'starfish', density: 0.22, depth: [ - 28, - 4 ], minFlatness: 0.75,
		minSky: 0.1, maxSky: 1, scale: [ 0.7, 1.4 ], clearance: 1.6,
		hsv: [ 0.0523, 0.768, 0.878 ], hueRange: 0.24, saturate: 1.45, stiffness: 0.0, alignToSlope: true,
	},
	{
		id: 'shell', density: 0.3, depth: [ - 28, - 3 ], minFlatness: 0.8,
		minSky: 0.0, maxSky: 1, scale: [ 0.7, 1.6 ], clearance: 1.0,
		hsv: [ 0.1083, 0.167, 0.941 ], hueRange: 0.1, stiffness: 0.0, alignToSlope: true,
	},
];

/**
 * HSV → RGB (the standard branchless form).
 *
 * Colour variety is driven in HSV rather than by lerping between two RGB
 * endpoints, because a lerp between, say, crimson and gold passes through
 * muddy brown. Rotating hue keeps every instance fully saturated, which is
 * what a real reef looks like: hundreds of vivid, *different* colours rather
 * than one colour at hundreds of brightnesses.
 */
const hsv2rgb = ( h, sat, val ) => {

	const p = abs( fract( vec3( h, h.add( 2 / 3 ), h.add( 1 / 3 ) ) ).mul( 6 ).sub( 3 ) );
	return val.mul( mix( vec3( 1 ), clamp( p.sub( 1 ), 0, 1 ), sat ) );

};

function createFloraMaterial( rule, caustics ) {

	const material = new THREE.MeshStandardNodeMaterial( {
		roughness: 0.85,
		metalness: 0,
		side: THREE.DoubleSide,
	} );

	const bend = attribute( 'bend', 'float' );
	const iPhase = attribute( 'iPhase', 'float' );
	const iTint = attribute( 'iTint', 'float' );
	const iSky = attribute( 'iSky', 'float' );

	// Base colour expressed in HSV so instances can be spread around the hue
	// wheel (see hsv2rgb above).
	const uHue = uniform( rule.hsv[ 0 ] );
	const uSat = uniform( rule.hsv[ 1 ] );
	const uVal = uniform( rule.hsv[ 2 ] );
	// Warm-biased: the spread is skewed toward red/orange/magenta rather than
	// centred. Hues in the cyan-blue band (~0.40-0.68) are nearly invisible
	// against blue water — a "blue coral" is just a hole in the reef — so the
	// palette deliberately never goes there.
	const uHueRange = float( rule.hueRange ?? 0.05 );
	const stiffness = float( rule.stiffness ?? 0.6 );

	material.positionNode = Fn( () => {

		const p = positionLocal.toVar();

		// Squaring the bend factor pins the base and lets the tip travel — the
		// standard foliage trick, and the reason kelp reads as heavy and
		// seagrass as light from the same shader.
		const amount = pow( clamp( bend, 0, 1 ), float( 2 ) ).mul( stiffness );

		// Local surge, plus a slow large-scale gust so the whole bed moves
		// together rather than each plant wobbling independently.
		const t = uTime;
		const surge = sin( t.mul( 1.35 ).add( iPhase ) ).mul( 0.55 )
			.add( sin( t.mul( 2.6 ).add( iPhase.mul( 1.7 ) ) ).mul( 0.22 ) );

		const gust = mx_noise_float( vec3(
			positionWorld.x.mul( 0.035 ),
			t.mul( 0.16 ),
			positionWorld.z.mul( 0.035 ),
		), 1, 0 );

		const sway = surge.add( gust.mul( 0.9 ) ).mul( amount ).mul( 0.32 );

		p.x = p.x.add( sway );
		p.z = p.z.add( sway.mul( 0.55 ) );
		// Shorten slightly as it leans, so the plant does not stretch.
		p.y = p.y.mul( float( 1 ).sub( amount.mul( 0.05 ) ) );

		return p;

	} )();

	material.colorNode = Fn( () => {

		// Spread this instance around the hue wheel, with a little saturation
		// and value jitter so a bed does not read as flat vector art.
		const t = clamp( iTint, 0, 1 );
		const hue = fract( uHue.add( t.sub( 0.5 ).mul( uHueRange ) ).add( 1 ) );
		const sat = clamp( uSat.mul( t.mul( 0.22 ).add( 0.95 ) ), 0, 1 );
		const val = clamp( uVal.mul( t.mul( 0.26 ).add( 0.94 ) ), 0, 1 );

		const base = hsv2rgb( hue, sat, val ).toVar();

		// Darken toward the base: less light reaches down there, and it also
		// grounds the plant visually instead of leaving it looking pasted on.
		base.mulAssign( mix( float( 0.45 ), float( 1.0 ), clamp( bend, 0, 1 ).add( 0.25 ) ) );

		// Instances in caves are dark, matching the terrain's baked AO.
		base.mulAssign( mix( float( 0.12 ), float( 1.0 ), clamp( iSky, 0, 1 ) ) );

		// Push saturation back up. Water extinction desaturates everything on
		// the way to the eye; corals that start merely colourful arrive grey.
		const luma = base.r.mul( 0.299 ).add( base.g.mul( 0.587 ) ).add( base.b.mul( 0.114 ) );
		base.assign( mix( vec3( luma ), base, float( rule.saturate ?? 1.0 ) ) );

		return vec4( base, 1 );

	} )();

	if ( caustics !== null && caustics !== undefined ) {

		material.emissiveNode = Fn( () => {

			const amount = causticSample( caustics, positionWorld, normalWorld, iSky );
			// Kept low. Caustics land on every up-facing surface, and a coral
			// head is mostly up-facing — at full strength they bleach the very
			// props that are supposed to carry the reef's colour.
			return vec3( 0.7, 0.94, 1.0 ).mul( amount ).mul( 0.4 );

		} )();

	}

	return material;

}

export class Flora {

	constructor( scene, { budget = 40000, caustics = null } = {} ) {

		this.scene = scene;
		this.group = new THREE.Group();
		this.group.name = 'flora';
		scene.add( this.group );

		this.meshes = [];
		this.total = 0;
		this.budget = budget;
		this.caustics = caustics;

	}

	build( onProgress ) {

		const totalDensity = FLORA_RULES.reduce( ( s, r ) => s + r.density, 0 );

		const up = new THREE.Vector3( 0, 1, 0 );
		const normal = new THREE.Vector3();
		const quat = new THREE.Quaternion();
		const slopeQuat = new THREE.Quaternion();
		const yawQuat = new THREE.Quaternion();
		const scaleV = new THREE.Vector3();
		const posV = new THREE.Vector3();
		const matrix = new THREE.Matrix4();

		FLORA_RULES.forEach( ( rule, ruleIndex ) => {

			const count = Math.round( this.budget * ( rule.density / totalDensity ) );
			const placements = scatterSpecies( rule, count );
			if ( placements.length === 0 ) return;

			const geometry = FLORA_BUILDERS[ rule.id ]();
			const material = createFloraMaterial( rule, this.caustics );

			const mesh = new THREE.InstancedMesh( geometry, material, placements.length );
			mesh.castShadow = false;      // thousands of tiny shadow casters is not worth it
			mesh.receiveShadow = true;
			mesh.frustumCulled = false;   // instances span the world; per-mesh culling is useless
			mesh.name = `flora:${rule.id}`;

			const phases = new Float32Array( placements.length );
			const tints = new Float32Array( placements.length );
			const skies = new Float32Array( placements.length );

			for ( let i = 0; i < placements.length; i ++ ) {

				const p = placements[ i ];

				// Plants that hug the substrate follow the slope; upright ones
				// stay upright regardless, because kelp growing sideways out of
				// a wall reads as a bug even when it is technically correct.
				if ( rule.alignToSlope ) {

					normal.set( p.nx, p.ny, p.nz ).normalize();
					slopeQuat.setFromUnitVectors( up, normal );

				} else {

					normal.set( p.nx, p.ny, p.nz ).normalize();
					slopeQuat.setFromUnitVectors( up, normal );
					// Blend most of the way back to vertical.
					slopeQuat.slerp( new THREE.Quaternion(), 0.75 );

				}

				yawQuat.setFromAxisAngle( up, p.rotation );
				quat.copy( slopeQuat ).multiply( yawQuat );

				posV.set( p.x, p.y, p.z );
				scaleV.setScalar( p.scale );
				matrix.compose( posV, quat, scaleV );
				mesh.setMatrixAt( i, matrix );

				phases[ i ] = p.phase;
				tints[ i ] = p.tint;
				skies[ i ] = p.sky;

			}

			mesh.instanceMatrix.needsUpdate = true;
			geometry.setAttribute( 'iPhase', new THREE.InstancedBufferAttribute( phases, 1 ) );
			geometry.setAttribute( 'iTint', new THREE.InstancedBufferAttribute( tints, 1 ) );
			geometry.setAttribute( 'iSky', new THREE.InstancedBufferAttribute( skies, 1 ) );

			this.group.add( mesh );
			this.meshes.push( mesh );
			this.total += placements.length;

			onProgress?.( ruleIndex + 1, FLORA_RULES.length, rule.id, placements.length );

		} );

		return this.total;

	}

}

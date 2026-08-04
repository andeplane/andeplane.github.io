import * as THREE from 'three/webgpu';
import {
	Fn, attribute, positionLocal, positionWorld, normalWorld, vec2, vec3, vec4,
	float, uniform, sin, cos, clamp, mix, smoothstep, pow, max, min, abs, fract,
	mx_noise_float, instanceIndex,
} from 'three/tsl';

import { FLORA_BUILDERS } from '../geometry/flora.js';
import { scatterInBox } from '../world/scatter.js';
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

/**
 * Streaming flora.
 *
 * One InstancedMesh per species, sized once, with a free list of instance
 * slots. A chunk that loads claims slots and writes matrices into them; a chunk
 * that unloads returns them and the matrices are zeroed.
 *
 * The alternative — an InstancedMesh per chunk per species — would mean
 * fourteen species times a hundred-odd resident chunks, so well over a thousand
 * draw calls for the plants alone. Pooling keeps it at fourteen however far you
 * swim.
 */
export class Flora {

	constructor( scene, { budget = 40000, caustics = null, residentChunks = 120 } = {} ) {

		this.scene = scene;
		this.group = new THREE.Group();
		this.group.name = 'flora';
		scene.add( this.group );

		this.caustics = caustics;
		this.species = new Map();
		this.chunkAllocations = new Map();
		this.total = 0;
		this.meshes = [];

		const totalDensity = FLORA_RULES.reduce( ( sum, r ) => sum + r.density, 0 );

		for ( const rule of FLORA_RULES ) {

			// Capacity is the steady-state count plus headroom: chunk yields
			// vary a lot with terrain, and running out of slots means props
			// silently stop appearing.
			const capacity = Math.max( 64, Math.ceil( budget * ( rule.density / totalDensity ) * 1.7 ) );

			const geometry = FLORA_BUILDERS[ rule.id ]();
			const material = createFloraMaterial( rule, this.caustics );

			const mesh = new THREE.InstancedMesh( geometry, material, capacity );
			mesh.castShadow = false;
			mesh.receiveShadow = true;
			mesh.frustumCulled = false;
			mesh.name = `flora:${rule.id}`;
			mesh.count = capacity;
			mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );

			const phases = new Float32Array( capacity );
			const tints = new Float32Array( capacity );
			const skies = new Float32Array( capacity );

			const attrPhase = new THREE.InstancedBufferAttribute( phases, 1 );
			const attrTint = new THREE.InstancedBufferAttribute( tints, 1 );
			const attrSky = new THREE.InstancedBufferAttribute( skies, 1 );
			for ( const a of [ attrPhase, attrTint, attrSky ] ) a.setUsage( THREE.DynamicDrawUsage );

			geometry.setAttribute( 'iPhase', attrPhase );
			geometry.setAttribute( 'iTint', attrTint );
			geometry.setAttribute( 'iSky', attrSky );

			// Everything starts collapsed to nothing, so unused slots draw
			// degenerate triangles rather than a pile of props at the origin.
			const zero = new THREE.Matrix4().makeScale( 0, 0, 0 );
			for ( let i = 0; i < capacity; i ++ ) mesh.setMatrixAt( i, zero );
			mesh.instanceMatrix.needsUpdate = true;

			const free = new Array( capacity );
			for ( let i = 0; i < capacity; i ++ ) free[ i ] = capacity - 1 - i;

			this.group.add( mesh );
			this.meshes.push( mesh );
			this.species.set( rule.id, {
				rule, mesh, free, capacity,
				perChunk: ( budget * ( rule.density / totalDensity ) ) / residentChunks,
				attrPhase, attrTint, attrSky,
			} );

		}

		this._matrix = new THREE.Matrix4();
		this._quat = new THREE.Quaternion();
		this._slope = new THREE.Quaternion();
		this._yaw = new THREE.Quaternion();
		this._scale = new THREE.Vector3();
		this._pos = new THREE.Vector3();
		this._normal = new THREE.Vector3();
		this._up = new THREE.Vector3( 0, 1, 0 );
		this._zero = new THREE.Matrix4().makeScale( 0, 0, 0 );

	}

	/** Populate a chunk footprint. Called when terrain finishes meshing. */
	loadChunk( cx, cz, size ) {

		const key = `${cx},${cz}`;
		if ( this.chunkAllocations.has( key ) ) return;

		const box = { minX: cx * size, minZ: cz * size, size };
		const allocation = [];

		for ( const entry of this.species.values() ) {

			// Poisson-ish variation around the expected per-chunk count, so
			// beds are patchy rather than uniformly sprinkled.
			const want = Math.max( 0, Math.round( entry.perChunk * ( 0.55 + Math.random() * 0.9 ) ) );
			if ( want === 0 ) continue;

			const placements = scatterInBox( entry.rule, box, want, key );

			for ( const p of placements ) {

				const slot = entry.free.pop();
				if ( slot === undefined ) break;   // pool exhausted; skip quietly

				this._write( entry, slot, p );
				allocation.push( { id: entry.rule.id, slot } );
				this.total ++;

			}

			entry.mesh.instanceMatrix.needsUpdate = true;
			entry.attrPhase.needsUpdate = true;
			entry.attrTint.needsUpdate = true;
			entry.attrSky.needsUpdate = true;

		}

		this.chunkAllocations.set( key, allocation );

	}

	/** Return a chunk's slots to their pools. */
	unloadChunk( cx, cz ) {

		const key = `${cx},${cz}`;
		const allocation = this.chunkAllocations.get( key );
		if ( allocation === undefined ) return;

		for ( const { id, slot } of allocation ) {

			const entry = this.species.get( id );
			entry.mesh.setMatrixAt( slot, this._zero );
			entry.free.push( slot );
			entry.mesh.instanceMatrix.needsUpdate = true;
			this.total --;

		}

		this.chunkAllocations.delete( key );

	}

	_write( entry, slot, p ) {

		const rule = entry.rule;

		this._normal.set( p.nx, p.ny, p.nz ).normalize();
		this._slope.setFromUnitVectors( this._up, this._normal );

		// Plants that hug the substrate follow the slope; upright ones stay
		// upright, because kelp growing sideways out of a wall reads as a bug
		// even when it is technically correct.
		if ( ! rule.alignToSlope ) this._slope.slerp( new THREE.Quaternion(), 0.75 );

		this._yaw.setFromAxisAngle( this._up, p.rotation );
		this._quat.copy( this._slope ).multiply( this._yaw );

		this._pos.set( p.x, p.y, p.z );
		this._scale.setScalar( p.scale );
		this._matrix.compose( this._pos, this._quat, this._scale );
		entry.mesh.setMatrixAt( slot, this._matrix );

		entry.attrPhase.array[ slot ] = p.phase;
		entry.attrTint.array[ slot ] = p.tint;
		entry.attrSky.array[ slot ] = p.sky;

	}

}

import * as THREE from 'three/webgpu';
import {
	Fn, attribute, positionLocal, vec2, vec3, vec4, float, uniform, instanceIndex,
	sin, cos, fract, floor, mod, clamp, mix, smoothstep, pow, length,
	cameraPosition, normalize, cross,
} from 'three/tsl';

import { uTime } from '../render/frame.js';
import { waterParams } from '../render/waterFog.js';

/**
 * Ambient particles: marine snow and bubbles (DESIGN §7.4).
 *
 * Both are computed entirely in the vertex shader from `instanceIndex` — no
 * compute pass, no CPU integration, no per-frame buffer upload. Each particle
 * derives a fixed pseudo-random slot from its index, drifts, and *wraps* with
 * `mod` inside a box that follows the player.
 *
 * Wrapping is what makes this cheap and correct: density is constant, the count
 * is bounded, and particles are always where the player is, so none of the
 * budget is spent simulating motes 200 m away that nobody can see.
 */

/** Cheap per-index hash, 0..1. */
const hash = ( n ) => fract( sin( n.mul( 12.9898 ) ).mul( 43758.5453 ) );

/**
 * Camera-facing basis for a billboard at `world`.
 * The standard construction: right is perpendicular to both world-up and the
 * view ray, and up completes the frame.
 */
function billboardBasis( world ) {

	const toCam = normalize( cameraPosition.sub( world ).add( vec3( 0.0001, 0, 0 ) ) );
	const right = normalize( cross( vec3( 0, 1, 0 ), toCam ).add( vec3( 0.0001, 0, 0 ) ) );
	const up = cross( toCam, right );
	return { right, up };

}

/**
 * Marine snow — the slow fall of organic detritus. Subtle, but its absence is
 * why still water reads as empty air.
 */
export function createMarineSnow( scene, { count = 4000, box = new THREE.Vector3( 34, 22, 34 ) } = {} ) {

	const origin = uniform( new THREE.Vector3() );
	const uBox = uniform( box.clone() );

	const material = new THREE.MeshBasicNodeMaterial( {
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		fog: true,
	} );

	const vFade = { value: null };

	material.positionNode = Fn( () => {

		const id = float( instanceIndex );

		// Three decorrelated hashes give the particle its slot in the box.
		const h1 = hash( id.add( 0.13 ) );
		const h2 = hash( id.add( 7.71 ) );
		const h3 = hash( id.add( 19.37 ) );

		// Fall speed varies per particle, so the field never looks like a sheet.
		const fall = h3.mul( 0.055 ).add( 0.018 );

		const drift = vec3(
			sin( uTime.mul( 0.21 ).add( h1.mul( 40 ) ) ).mul( 0.55 ),
			uTime.mul( fall ).negate(),
			cos( uTime.mul( 0.17 ).add( h2.mul( 40 ) ) ).mul( 0.55 ),
		);

		const raw = vec3( h1, h2, h3 ).mul( uBox ).add( drift );
		// Wrap into the box, then centre it on the player.
		const wrapped = mod( mod( raw, uBox ).add( uBox ), uBox ).sub( uBox.mul( 0.5 ) );

		const world = wrapped.add( origin );

		// Billboard: face the camera, sized by a per-particle scale.
		const size = h2.mul( 0.028 ).add( 0.012 );
		const { right, up } = billboardBasis( world );

		return world
			.add( right.mul( positionLocal.x.mul( size ) ) )
			.add( up.mul( positionLocal.y.mul( size ) ) );

	} )();

	material.colorNode = Fn( () => {

		const id = float( instanceIndex );
		const h = hash( id.add( 3.3 ) );

		// Round-ish falloff from the quad centre.
		const d = length( positionLocal.xy ).mul( 2 );
		const alpha = smoothstep( float( 1.0 ), float( 0.1 ), d )
			.mul( h.mul( 0.35 ).add( 0.25 ) )
			// Only underwater — snow in mid-air looks like dust on the lens.
			.mul( waterParams.submersion );

		return vec4( vec3( 0.82, 0.90, 0.88 ), alpha );

	} )();

	const quad = new THREE.PlaneGeometry( 1, 1 );
	const mesh = new THREE.InstancedMesh( quad, material, count );
	mesh.frustumCulled = false;
	mesh.renderOrder = 600;
	mesh.name = 'marineSnow';

	const identity = new THREE.Matrix4();
	for ( let i = 0; i < count; i ++ ) mesh.setMatrixAt( i, identity );
	mesh.instanceMatrix.needsUpdate = true;

	scene.add( mesh );

	return {
		mesh,
		follow( x, y, z ) {

			origin.value.set( x, y, z );

		},
	};

}

/**
 * Bubble columns rising from seabed vents, plus the player's own trail.
 * Same wrap trick, but rising and confined to narrow columns.
 */
export function createBubbles( scene, vents, { perVent = 34 } = {} ) {

	const count = Math.max( 1, vents.length * perVent );

	// Vent positions packed into an attribute, one entry per instance.
	const ventPos = new Float32Array( count * 3 );
	for ( let i = 0; i < count; i ++ ) {

		const v = vents[ Math.floor( i / perVent ) % Math.max( 1, vents.length ) ];
		ventPos[ i * 3 + 0 ] = v.x;
		ventPos[ i * 3 + 1 ] = v.y;
		ventPos[ i * 3 + 2 ] = v.z;

	}

	const material = new THREE.MeshBasicNodeMaterial( {
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
	} );

	const aVent = attribute( 'iVent', 'vec3' );

	material.positionNode = Fn( () => {

		const id = float( instanceIndex );
		const h1 = hash( id.add( 2.7 ) );
		const h2 = hash( id.add( 11.1 ) );

		// Rise height wraps, so each bubble restarts at the vent.
		const RISE = float( 16 );
		const speed = h1.mul( 0.55 ).add( 0.55 );
		const y = mod( uTime.mul( speed ).add( h2.mul( 16 ) ), RISE );

		// Bubbles wobble more as they rise and expand.
		const wobble = y.mul( 0.35 );
		const offset = vec3(
			sin( uTime.mul( 2.1 ).add( h1.mul( 30 ) ) ).mul( 0.09 ).mul( wobble ),
			y,
			cos( uTime.mul( 1.7 ).add( h2.mul( 30 ) ) ).mul( 0.09 ).mul( wobble ),
		);

		const world = aVent.add( offset );

		// Expand with height as pressure drops — a real and free detail.
		const size = h2.mul( 0.020 ).add( 0.012 ).mul( y.mul( 0.045 ).add( 1 ) );

		const { right, up } = billboardBasis( world );

		return world
			.add( right.mul( positionLocal.x.mul( size ) ) )
			.add( up.mul( positionLocal.y.mul( size ) ) );

	} )();

	material.colorNode = Fn( () => {

		const d = length( positionLocal.xy ).mul( 2 );
		// A bright rim and a hollow centre — that is what makes a sphere of gas
		// in water read as a bubble rather than a white dot.
		const rim = smoothstep( float( 0.55 ), float( 0.95 ), d ).mul( smoothstep( float( 1.05 ), float( 0.95 ), d ) );
		const body = smoothstep( float( 1.0 ), float( 0.2 ), d ).mul( 0.18 );

		return vec4( vec3( 0.88, 0.96, 1.0 ), rim.mul( 0.85 ).add( body ).mul( waterParams.submersion ) );

	} )();

	const quad = new THREE.PlaneGeometry( 1, 1 );
	quad.setAttribute( 'iVent', new THREE.InstancedBufferAttribute( ventPos, 3 ) );

	const mesh = new THREE.InstancedMesh( quad, material, count );
	mesh.frustumCulled = false;
	mesh.renderOrder = 601;
	mesh.name = 'bubbles';

	const identity = new THREE.Matrix4();
	for ( let i = 0; i < count; i ++ ) mesh.setMatrixAt( i, identity );
	mesh.instanceMatrix.needsUpdate = true;

	scene.add( mesh );
	return { mesh, count };

}

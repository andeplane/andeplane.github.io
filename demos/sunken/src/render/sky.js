import * as THREE from 'three/webgpu';
import {
	Fn, vec3, vec4, float, uniform, positionWorld, normalize, cameraPosition,
	dot, max, pow, mix, smoothstep, exp, clamp,
} from 'three/tsl';

import { submergedFraction } from './frame.js';

/**
 * Sky and sun.
 *
 * An analytic sky rather than three's SkyMesh/PMREM path, because the ocean
 * shader needs to *sample the sky along an arbitrary ray* — once for the
 * above-water reflection and again for the refracted ray inside Snell's window
 * — and an analytic function can be evaluated in either place for free, with no
 * render target, no PMREM pass and no sampling seams at the horizon.
 */

export const SUN = {
	elevation: 34,     // degrees above the horizon — late golden hour
	azimuth: 152,      // degrees
	direction: new THREE.Vector3(),
	color: new THREE.Color( 0xfff1d6 ),
	intensity: 3.0,
};

export function updateSunDirection() {

	const phi = THREE.MathUtils.degToRad( 90 - SUN.elevation );
	const theta = THREE.MathUtils.degToRad( SUN.azimuth );
	SUN.direction.setFromSphericalCoords( 1, phi, theta ).normalize();
	return SUN.direction;

}

updateSunDirection();

export const sunDirection = uniform( SUN.direction.clone() );
export const sunColor = uniform( SUN.color.clone() );

/**
 * Sky radiance along a direction (must be normalised). Returns HDR values —
 * the sun disc is deliberately far above 1 so it blooms.
 *
 * IMPORTANT: this is a *pure* function. The sun direction and colour are
 * explicit parameters and the gradient colours are literals, with `setLayout`
 * declaring the signature so it compiles to one standalone WGSL function.
 *
 * An earlier version captured module-scope uniforms instead. That works in the
 * first material it is built into and then silently miscompiles in the next
 * one: uniform slot indices (`nodeUniform0`, `nodeUniform1`, …) are assigned
 * per material, but the shared node's generated code reuses the indices from
 * whichever material built it first. In the ocean material those slots happen
 * to be a vec2 and a float, so the sky gradient became
 * `mix(vec2, f32, f32)` — a WGSL type error, not a wrong picture. Shared TSL
 * helpers must not capture uniforms.
 */
export const skyRadiance = /*@__PURE__*/ Fn( ( [ dir, sunDir, sunCol ] ) => {

	const up = clamp( dir.y, - 1, 1 );

	// A real tropical sky is deep blue overhead and only pales in the last few
	// degrees above the horizon. The previous values were far too bright and
	// too desaturated at the horizon, and the exponent spread that pale band
	// across most of the visible sky — so from the surface the whole upper half
	// of the frame washed out to near-white.
	const ZENITH = vec3( 0.035, 0.145, 0.46 );
	const HORIZON = vec3( 0.42, 0.58, 0.76 );
	const GROUND = vec3( 0.045, 0.065, 0.085 );

	// A much larger exponent keeps the pale horizon band narrow.
	const t = pow( clamp( up, 0, 1 ), float( 0.28 ) );
	const col = mix( HORIZON, ZENITH, t ).toVar();

	// Below the horizon (only visible in reflections) fade to a dark sea.
	col.assign( mix( GROUND, col, smoothstep( float( - 0.12 ), float( 0.02 ), up ) ) );

	const cosSun = dot( dir, sunDir );

	// SMALL and bright, not large and blown.
	//
	// The disc used to span several degrees at 30x. That does not read as the
	// sun — it reads as a hole burned through the sky, and above water it
	// swallowed the horizon and washed the whole upper half of the frame to
	// white. A real sun is about half a degree across: tight angular size with
	// a high peak is what makes it look like a sun rather than an overexposure.
	//
	// It is also pushed toward neutral white. `sunCol` is warm (0xfff1d6), so at
	// disc brightness red saturates before green before blue, and the edge of
	// the clipped region shows a band where red has clipped but blue has not.
	// Making the brightest part of the image achromatic makes all three channels
	// clip together. The warmth lives in the halo below, which never clips.
	const disc = smoothstep( float( 0.99965 ), float( 0.99992 ), cosSun );
	col.addAssign( mix( sunCol, vec3( 1 ), float( 0.9 ) ).mul( disc ).mul( 60 ) );

	// Tight forward-scattered halo, then a much weaker wide one.
	col.addAssign( sunCol.mul( pow( max( cosSun, 0 ), float( 90 ) ) ).mul( 2.2 ) );
	col.addAssign( sunCol.mul( pow( max( cosSun, 0 ), float( 14 ) ) ).mul( 0.22 ) );

	// Broad aureole, strongest near the horizon — kept subtle.
	const aureole = pow( max( cosSun, 0 ), float( 3.5 ) ).mul( smoothstep( float( 0.55 ), float( 0 ), up ) );
	col.addAssign( sunCol.mul( aureole ).mul( 0.10 ) );

	return col;

} ).setLayout( {
	name: 'skyRadiance',
	type: 'vec3',
	inputs: [
		{ name: 'dir', type: 'vec3' },
		{ name: 'sunDir', type: 'vec3' },
		{ name: 'sunCol', type: 'vec3' },
	],
} );

/** Convenience wrapper binding the scene's sun. Plain JS — no node caching. */
export const sky = ( dir ) => skyRadiance( dir, sunDirection, sunColor );

/**
 * The sky dome. Rendered as a big inverted sphere with no depth write, so it
 * sits behind everything without needing a separate pass.
 *
 * `deepColor` is the water's asymptotic colour. The dome must fade to it when
 * the view ray is underwater: the ocean surface mesh only spans a few hundred
 * metres, so past its edge a shallow underwater ray reaches the dome directly
 * and — with `fog: false` — painted a bright band of sky along the horizon
 * *underwater*. Blending by the ray's submerged fraction is both the fix and
 * what you physically see: water going featureless blue at distance.
 */
export function createSkyDome( deepColor = new THREE.Color( 0x0a2f3d ) ) {

	const material = new THREE.MeshBasicNodeMaterial( {
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
	} );

	const deep = uniform( deepColor );

	material.colorNode = Fn( () => {

		const dir = normalize( positionWorld.sub( cameraPosition ) );
		const submerged = submergedFraction( cameraPosition.y, positionWorld.y );
		return vec4( mix( sky( dir ), vec3( deep ), submerged ), 1 );

	} )();

	const mesh = new THREE.Mesh( new THREE.SphereGeometry( 1, 48, 32 ), material );
	mesh.scale.setScalar( 6000 );   // must enclose the 2.5 km ocean disc
	mesh.renderOrder = - 1000;
	mesh.frustumCulled = false;
	mesh.name = 'sky';

	return mesh;

}

/** The scene's directional sun light, matched to the analytic sky. */
export function createSunLight( shadowMapSize = 2048 ) {

	const light = new THREE.DirectionalLight( SUN.color, SUN.intensity );
	light.position.copy( SUN.direction ).multiplyScalar( 220 );
	light.castShadow = true;
	light.shadow.mapSize.set( shadowMapSize, shadowMapSize );
	light.shadow.camera.near = 1;
	light.shadow.camera.far = 460;
	light.shadow.bias = - 0.0006;
	light.shadow.normalBias = 0.08;
	light.name = 'sun';

	return light;

}

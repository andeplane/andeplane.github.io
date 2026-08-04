import * as THREE from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, attribute, varying, positionLocal,
	cameraPosition, normalize, dot, cross, reflect, refract, length, sin, cos,
	max, min, abs, pow, exp, clamp, mix, smoothstep, step, sqrt,
	mx_fractal_noise_float, mx_noise_float,
} from 'three/tsl';

import { WAVES } from '../world/waves.js';
import { uTime } from './frame.js';
import { sky, sunDirection, sunColor } from './sky.js';
import { waterParams } from './waterFog.js';

/**
 * The sea surface (DESIGN §6.1).
 *
 * One mesh, one material, `DoubleSide`, branching per-pixel on which side of
 * the surface the view ray arrives from:
 *
 *   above  →  sky reflection, sharp sun glint, Fresnel to deep water, foam
 *   below  →  SNELL'S WINDOW: a ~96° cone of refracted sky, ringed by total
 *             internal reflection
 *
 * Branching per-pixel rather than on the camera's height is deliberate. With a
 * displaced surface the waterline is a ragged curve across the lens, and a
 * camera-height test flips the *entire* surface at once — a hard pop during the
 * game's signature shot. The per-pixel test is correct everywhere, including
 * the moment the lens is half in and half out of the water.
 *
 * The material also sets `fog: false`: `scene.fogNode` would otherwise apply
 * water extinction on top of the shading here, attenuating the window twice
 * (REVIEW §C3).
 */

const IOR_WATER = 1.333;
const ETA_UP = IOR_WATER;  // water → air

// Radial disc parameters. See buildOceanDisc().
const RINGS = 180;
const SECTORS = 256;
const INNER_SPACING = 1.0;   // metres between the innermost rings
const RING_GROWTH = 1.023;   // → ~2.5 km outer radius

/**
 * A radially-graded disc, not a square grid.
 *
 * A square grid has to choose between resolution and reach. At 460 m across it
 * ran out before the horizon, and underwater — where the surface is the *only*
 * thing hiding the sky dome — a shallow upward ray sailed past its edge and
 * painted a band of bright sky along the horizon, 20 m down.
 *
 * Rings spaced geometrically give both: ~1 m spacing under the player (finer
 * than the old grid) out to ~2.5 km at the rim, for fewer triangles overall,
 * and the mesh is centred on the player so the resolution follows them.
 */
function buildOceanDisc() {

	const radii = [ 0 ];
	let r = 0, step = INNER_SPACING;
	for ( let i = 0; i < RINGS; i ++ ) {

		r += step;
		step *= RING_GROWTH;
		radii.push( r );

	}

	const ringCount = radii.length;
	const vertexCount = 1 + ( ringCount - 1 ) * SECTORS;   // centre + rings
	const positions = new Float32Array( vertexCount * 3 );

	// Centre vertex is index 0; ring j (1-based) occupies
	// [1 + (j-1)*SECTORS, 1 + j*SECTORS).
	let p = 3;
	for ( let j = 1; j < ringCount; j ++ ) {

		const rad = radii[ j ];
		for ( let s = 0; s < SECTORS; s ++ ) {

			const a = ( s / SECTORS ) * Math.PI * 2;
			positions[ p ++ ] = Math.cos( a ) * rad;
			positions[ p ++ ] = 0;
			positions[ p ++ ] = Math.sin( a ) * rad;

		}

	}

	const indices = [];

	// Centre fan.
	for ( let s = 0; s < SECTORS; s ++ ) {

		const a = 1 + s;
		const b = 1 + ( ( s + 1 ) % SECTORS );
		indices.push( 0, b, a );

	}

	// Ring quads.
	for ( let j = 1; j < ringCount - 1; j ++ ) {

		const inner = 1 + ( j - 1 ) * SECTORS;
		const outer = 1 + j * SECTORS;
		for ( let s = 0; s < SECTORS; s ++ ) {

			const s1 = ( s + 1 ) % SECTORS;
			const i0 = inner + s, i1 = inner + s1;
			const o0 = outer + s, o1 = outer + s1;
			indices.push( i0, o1, o0 );
			indices.push( i0, i1, o1 );

		}

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	// setIndex() only wraps plain Arrays; a bare typed array is assigned
	// straight through and then blows up later on `index.array.byteLength`.
	const indexArray = vertexCount > 65535 ? new Uint32Array( indices ) : new Uint16Array( indices );
	geometry.setIndex( new THREE.BufferAttribute( indexArray, 1 ) );
	// Never cull: it is always around the camera.
	geometry.boundingSphere = new THREE.Sphere( new THREE.Vector3(), radii[ ringCount - 1 ] * 1.2 );

	return { geometry, outerRadius: radii[ ringCount - 1 ], triangles: indices.length / 3 };

}

/** Build the Gerstner displacement + normal as TSL, from the shared table. */
function gerstner( xz, t ) {

	const disp = vec3( 0, 0, 0 ).toVar();
	const nrm = vec3( 0, 0, 0 ).toVar();   // accumulates (dx, q-term, dz)

	for ( let i = 0; i < WAVES.length; i ++ ) {

		const w = WAVES[ i ];
		const dir = vec2( w.dx, w.dz );
		const phase = xz.dot( dir ).mul( w.k ).sub( t.mul( w.omega ) );
		const s = sin( phase );
		const c = cos( phase );

		disp.addAssign( vec3(
			c.mul( w.q * w.amp * w.dx ),
			s.mul( w.amp ),
			c.mul( w.q * w.amp * w.dz ),
		) );

		const ak = w.amp * w.k;
		nrm.addAssign( vec3(
			c.mul( ak * w.dx ),
			s.mul( w.q * ak ),
			c.mul( ak * w.dz ),
		) );

	}

	return { disp, normal: normalize( vec3( nrm.x.negate(), nrm.y.oneMinus(), nrm.z.negate() ) ) };

}

export function createOcean() {

	// Mesh offset, so the grid can follow the player without the shader needing
	// the model matrix (the mesh is translation-only).
	const originXZ = uniform( new THREE.Vector2( 0, 0 ) );

	const material = new THREE.MeshBasicNodeMaterial( {
		side: THREE.DoubleSide,
		transparent: true,
		depthWrite: true,
		fog: false,        // see header — the surface owns its own attenuation
	} );

	const vWorld = varying( vec3(), 'vOceanWorld' );
	const vNormal = varying( vec3(), 'vOceanNormal' );

	material.positionNode = Fn( () => {

		const xz = positionLocal.xz.add( originXZ );
		const { disp, normal } = gerstner( xz, uTime );

		vNormal.assign( normal );
		vWorld.assign( vec3( xz.x.add( disp.x ), disp.y, xz.y.add( disp.z ) ) );

		// Geometry is already in the XZ plane and the mesh is translation-only,
		// so a world-space displacement can be added directly in local space.
		return positionLocal.add( disp );

	} )();

	material.colorNode = Fn( () => {

		const N = normalize( vNormal ).toVar();

		// Fine ripple detail the vertex grid cannot resolve. Two scrolling
		// octaves perturb the normal; without this the surface reads as glass.
		const rippleUV = vWorld.xz.mul( 0.55 ).add( vec2( uTime.mul( 0.32 ), uTime.mul( 0.21 ) ) );
		const rippleUV2 = vWorld.xz.mul( 1.7 ).sub( vec2( uTime.mul( 0.19 ), uTime.mul( - 0.27 ) ) );
		const e = float( 0.35 );

		const rn = ( uv ) => mx_noise_float( vec3( uv.x, uv.y, float( 0 ) ), 1, 0 );
		const dx = rn( rippleUV.add( vec2( e, 0 ) ) ).sub( rn( rippleUV.sub( vec2( e, 0 ) ) ) )
			.add( rn( rippleUV2.add( vec2( e, 0 ) ) ).sub( rn( rippleUV2.sub( vec2( e, 0 ) ) ) ).mul( 0.5 ) );
		const dz = rn( rippleUV.add( vec2( 0, e ) ) ).sub( rn( rippleUV.sub( vec2( 0, e ) ) ) )
			.add( rn( rippleUV2.add( vec2( 0, e ) ) ).sub( rn( rippleUV2.sub( vec2( 0, e ) ) ) ).mul( 0.5 ) );

		// Fade the ripple normals out with distance. At grazing angles a whole
		// wavelength lands inside one pixel, and the high-frequency normal
		// aliases into crawling white speckle across the far water — the
		// standard fix is to LOD the normal detail away rather than to
		// supersample it.
		const camDist = length( vWorld.sub( cameraPosition ) );
		const rippleFade = smoothstep( float( 90 ), float( 12 ), camDist );

		N.assign( normalize( N.add( vec3( dx.mul( - 0.22 ), 0, dz.mul( - 0.22 ) ).mul( rippleFade ) ) ) );

		// Beyond the ripple fade, flatten the *wave* normal toward vertical too.
		// Seen from below at grazing angles, individual crests dip in and out of
		// the critical angle from pixel to pixel and the Snell window strobes
		// through them as white speckle. Distant water has to become a mirror —
		// this is specular aliasing, and the only real cure is normal LOD.
		const flatten = smoothstep( float( 60 ), float( 420 ), camDist );
		N.assign( normalize( mix( N, vec3( 0, 1, 0 ), flatten ) ) );

		// View ray, from the eye toward this point on the surface.
		const I = normalize( vWorld.sub( cameraPosition ) ).toVar();

		// Which side are we seeing?
		//
		// Purely positional: this surface point is above the eye, so we are
		// underneath it. Per-pixel, so the ragged waterline across the lens is
		// handled correctly — half in, half out of the water is exactly right.
		//
		// Two rejected alternatives:
		//  • `frontFacing` — depends on triangle winding and on how the geometry
		//    happened to be oriented.
		//  • `dot(I, N)` — uses the *perturbed* normal, so at grazing angles
		//    individual wave facets tip past the threshold and flip to the
		//    above-water branch, whose grazing Fresnel is ~1. That painted the
		//    far water with bright white speckle: a physically-correct value
		//    computed for the wrong side of the surface.
		// A hairline smoothstep rather than a hard step: exactly at eye level the
		// two branches meet, and a binary test leaves a 1-pixel seam along the
		// horizon.
		const below = smoothstep( float( -0.05 ), float( 0.05 ), vWorld.y.sub( cameraPosition.y ) );

		const result = vec3( 0 ).toVar();
		const alpha = float( 1 ).toVar();

		/* ---------------- seen from above ---------------- */
		{
			const cosI = clamp( dot( I.negate(), N ), 0, 1 );

			// Schlick, F0 for air→water.
			const fresnel = float( 0.02 ).add( float( 0.98 ).mul( pow( cosI.oneMinus(), float( 5 ) ) ) );

			const R = reflect( I, N );
			const skyCol = sky( normalize( vec3( R.x, max( R.y, 0.005 ), R.z ) ) );

			// Sharp sun glint on the water.
			const glint = pow( max( dot( R, sunDirection ), 0 ), float( 900 ) ).mul( 26 );

			// Transmitted colour: the deep water below.
			const deep = vec3( 0.012, 0.075, 0.10 );

			// Foam on the crests, broken up by noise so it is not a contour band.
			const crest = smoothstep( float( 0.20 ), float( 0.55 ), vWorld.y );
			const foamNoise = mx_fractal_noise_float(
				vec3( vWorld.x.mul( 0.9 ), vWorld.z.mul( 0.9 ), uTime.mul( 0.6 ) ), 3, 2, 0.5, 1
			).mul( 0.5 ).add( 0.5 );
			const foam = clamp( crest.mul( foamNoise.mul( 1.5 ) ), 0, 1 );

			const c = mix( deep, skyCol, fresnel ).add( sunColor.mul( glint ) ).toVar();
			c.assign( mix( c, vec3( 0.90, 0.96, 1.0 ), foam.mul( 0.8 ) ) );

			result.assign( c );
			// Nearly opaque at grazing angles, more transparent looking straight
			// down — which is what lets you see the reef from the surface.
			alpha.assign( clamp( fresnel.add( foam ).add( 0.26 ), 0, 1 ) );

		}

		/* ---------------- seen from below ---------------- */
		{
			// Normal must face the incoming ray (we are under the surface).
			const Nb = N.negate();
			const cosI = clamp( dot( I.negate(), Nb ), 0, 1 );
			const sinI = sqrt( max( cosI.mul( cosI ).oneMinus(), 0 ) );

			// Total internal reflection beyond the critical angle (~48.6°),
			// which is exactly what bounds the ~96°-wide window.
			const critical = float( 1 / IOR_WATER );
			const ratio = sinI.div( critical );
			// Soft edge rather than a hard `step`: the surface is displaced and
			// a binary cutoff aliases badly along the rim.
			// A wide transition. The window boundary separates bright sky from
			// dark total internal reflection, so a tight smoothstep puts a
			// high-contrast edge right where the aliasing shows most.
			const tir = smoothstep( float( 0.90 ), float( 1.06 ), ratio );

			// --- inside the window: refracted sky ---
			const R = refract( I, Nb, ETA_UP );
			// `refract` returns a zero vector on TIR; guard before normalising.
			const Rsafe = normalize( mix( R, vec3( 0, 1, 0 ), tir ) );
			const skyCol = sky( normalize( vec3( Rsafe.x, max( Rsafe.y, 0.002 ), Rsafe.z ) ) );

			// Rim tint at the edge of the window.
			//
			// This used to sample the sky three times at slightly offset angles
			// for a real dispersion fringe. That is correct optics and it looked
			// catastrophic: the sky contains a sun disc that steps ~30x in
			// brightness over a couple of degrees, so three samples a fraction
			// of a degree apart straddle that step and land on wildly different
			// values — producing saturated cyan/magenta/orange banding along the
			// entire window boundary. Widening the disc and shrinking the offset
			// only reduced it, because the ratio is what matters, not the gap.
			//
			// A tint applied to a SINGLE sample gets the warm-outside/cool-inside
			// read without ever comparing two different points of a step
			// function — and it costs two fewer sky evaluations per pixel.
			const rim = smoothstep( float( 0.78 ), float( 1.0 ), ratio ).mul( rippleFade );

			// Soften the rim's radiance.
			//
			// Refraction is singular at the critical angle: as `ratio` -> 1 the
			// refracted ray swings toward the horizon, so neighbouring pixels
			// sample the sky at very different angles. Rolling the rim toward
			// its own luminance and capping it reduces that high-frequency,
			// high-contrast sampling, and the sun genuinely smears out at
			// grazing incidence — so this is cheap and closer to the truth.
			//
			// KNOWN ISSUE, not fixed by this: a thin coloured fringe still
			// traces the window boundary. Ruled out by bisection (`?post=N`):
			// it is not the post chain's chromatic aberration (disabled), not
			// bloom (fringe survives `?post=1`), and not the old three-sample
			// dispersion that used to live here (removed). It is therefore
			// somewhere in the surface shading or the transparent blend against
			// the sky dome, and needs a proper diagnosis rather than another
			// guess.
			const skyLum = dot( skyCol, vec3( 0.299, 0.587, 0.114 ) );
			const tamed = mix( skyCol, vec3( min( skyLum, float( 1.6 ) ) ), rim.mul( 0.9 ) );

			const windowCol = tamed.mul(
				vec3( 1 ).add( vec3( 0.10, 0.0, - 0.07 ).mul( rim ) )
			);

			// --- outside the window: mirror of the water below ---
			const mirror = reflect( I, Nb );
			// No reflection probe, so approximate what is down there: darker
			// with depth, tinted by the water, brighter toward the sun.
			const depthBelow = clamp( cameraPosition.y.negate(), 0, 30 );
			const belowCol = vec3( waterParams.tint )
				.mul( exp( depthBelow.mul( - 0.035 ) ) )
				.mul( float( 0.30 ).add( pow( max( dot( mirror, sunDirection.negate() ), 0 ), float( 6 ) ).mul( 0.35 ) ) );

			const c = mix( windowCol, belowCol, tir ).toVar();

			// Shimmer concentrated at the window's edge.
			const shimmer = mx_noise_float(
				vec3( vWorld.x.mul( 1.4 ), vWorld.z.mul( 1.4 ), uTime.mul( 1.1 ) ), 1, 0
			).mul( 0.5 ).add( 0.5 );
			c.addAssign( sunColor.mul( rim.mul( tir.oneMinus() ).mul( shimmer ).mul( 0.30 ) ) );

			result.assign( mix( result, c, below ) );
			alpha.assign( mix( alpha, float( 1 ), below ) );

		}

		return vec4( result, alpha );

	} )();

	const { geometry, outerRadius, triangles } = buildOceanDisc();

	const mesh = new THREE.Mesh( geometry, material );
	mesh.frustumCulled = false;
	mesh.renderOrder = 500;      // after opaque, before particles
	mesh.name = 'ocean';

	mesh.userData.originXZ = originXZ;
	mesh.userData.outerRadius = outerRadius;
	mesh.userData.triangles = triangles;

	/**
	 * Follow the player. The disc is radially graded, so unlike a uniform grid
	 * it cannot be snapped to a cell without visible stepping — it simply
	 * tracks the camera, and the wave field stays world-locked because the
	 * shader evaluates it from world XZ.
	 */
	mesh.userData.follow = ( x, z ) => {

		mesh.position.set( x, 0, z );
		originXZ.value.set( x, z );

	};

	return mesh;

}

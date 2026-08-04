import * as THREE from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, varying, positionLocal, attribute,
	normalize, refract, dot, cross, length, max, min, abs, clamp, pow, exp,
	smoothstep, mix, sin, cos, dFdx, dFdy, texture, uv,
} from 'three/tsl';

import { WAVES } from '../world/waves.js';
import { uTime } from './frame.js';
import { sunDirection } from './sky.js';

/**
 * Projected caustics (DESIGN §6.3).
 *
 * Adapted from jeantimex/webgpu-water (MIT), itself a WebGPU port of Evan
 * Wallace's classic WebGL water demo. The method is physical rather than
 * decorative:
 *
 *   1. refract each sunbeam through the wave surface,
 *   2. march it down to a reference depth,
 *   3. render the *displaced* landing point, and derive brightness from how
 *      much the beam's footprint shrank — measured with screen-space
 *      derivatives.
 *
 * Where neighbouring rays converge the area collapses and the caustic goes
 * bright, which is what produces the real, wave-shaped web of light instead of
 * the tiling voronoi blobs most games use.
 *
 * The map is rendered top-down in world XZ, so receivers sample it by world
 * position with nothing more than a scale and offset — no light matrix.
 */

const IOR_AIR = 1.0;
const IOR_WATER = 1.333;
const ETA_DOWN = IOR_AIR / IOR_WATER;   // air → water

const GRID = 384;

export class Caustics {

	/**
	 * @param {number} size  texture resolution
	 * @param {number} extent  half-width of the world region covered, in metres
	 * @param {number} referenceDepth  y of the plane rays are projected onto
	 */
	/**
	 * `extent` is the half-width of the world region the map covers. Smaller is
	 * sharper: at 80 m a 1024² map is only 6.4 texels per metre, which reads as
	 * visible blocks once it is projected onto terrain a couple of metres from
	 * the camera. 48 m nearly doubles that.
	 */
	constructor( renderer, { size = 1024, extent = 48, referenceDepth = - 18 } = {} ) {

		this.renderer = renderer;
		this.extent = extent;
		this.referenceDepth = referenceDepth;

		this.target = new THREE.RenderTarget( size, size, {
			type: THREE.HalfFloatType,          // caustic peaks go well above 1
			format: THREE.RGBAFormat,
			depthBuffer: false,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			generateMipmaps: false,
		} );
		this.target.texture.wrapS = THREE.ClampToEdgeWrapping;
		this.target.texture.wrapT = THREE.ClampToEdgeWrapping;

		this.originXZ = uniform( new THREE.Vector2( 0, 0 ) );
		this.uExtent = uniform( extent );
		this.uRefDepth = uniform( referenceDepth );

		this.scene = new THREE.Scene();
		this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, - 1, 1 );

		this.scene.add( this._buildMesh() );

		this._prevTarget = null;

	}

	_buildMesh() {

		const material = new THREE.MeshBasicNodeMaterial( {
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide,
			fog: false,
			toneMapped: false,
		} );

		// Undeformed and refracted landing positions, both in world XZ metres.
		const vOld = varying( vec2(), 'vCausticOld' );
		const vNew = varying( vec2(), 'vCausticNew' );

		material.vertexNode = Fn( () => {

			// positionLocal spans [-extent, extent] on X and Z.
			const worldXZ = positionLocal.xz.add( this.originXZ );

			// --- Gerstner surface, same table as render/ocean.js -------------
			const disp = vec3( 0, 0, 0 ).toVar();
			const nrm = vec3( 0, 0, 0 ).toVar();

			for ( let i = 0; i < WAVES.length; i ++ ) {

				const w = WAVES[ i ];
				const phase = worldXZ.dot( vec2( w.dx, w.dz ) ).mul( w.k ).sub( uTime.mul( w.omega ) );
				const s = sin( phase ), c = cos( phase );

				disp.addAssign( vec3(
					c.mul( w.q * w.amp * w.dx ),
					s.mul( w.amp ),
					c.mul( w.q * w.amp * w.dz ),
				) );

				const ak = w.amp * w.k;
				nrm.addAssign( vec3( c.mul( ak * w.dx ), s.mul( w.q * ak ), c.mul( ak * w.dz ) ) );

			}

			const N = normalize( vec3( nrm.x.negate(), nrm.y.oneMinus(), nrm.z.negate() ) );

			const surface = vec3( worldXZ.x.add( disp.x ), disp.y, worldXZ.y.add( disp.z ) );

			// --- refract the sunbeam into the water --------------------------
			// Light travels *from* the sun, so the incident direction is the
			// negated sun direction; N points up, out of the water, toward the
			// side the light arrives from — which is what refract() expects.
			const I = sunDirection.negate();
			const R = normalize( refract( I, N, float( ETA_DOWN ) ) );

			// March to the reference plane. Guard the denominator: a ray that is
			// nearly horizontal would otherwise fly off to infinity.
			const denom = min( R.y, float( - 0.05 ) );
			const t = surface.y.sub( this.uRefDepth ).div( denom.negate() );
			const hit = surface.add( R.mul( t ) );

			vOld.assign( worldXZ );
			vNew.assign( hit.xz );

			// Draw the vertex at where its beam LANDS, not where it started.
			// That displacement is the entire effect.
			const ndc = hit.xz.sub( this.originXZ ).div( this.uExtent );
			return vec4( ndc.x, ndc.y.negate(), 0, 1 );

		} )();

		material.colorNode = Fn( () => {

			// Area of this fragment's beam footprint before and after
			// refraction. Ratio > 1 means the beam converged → bright.
			const oldArea = length( dFdx( vOld ) ).mul( length( dFdy( vOld ) ) );
			const newArea = length( dFdx( vNew ) ).mul( length( dFdy( vNew ) ) );

			const gain = oldArea.div( max( newArea, float( 1e-7 ) ) );

			// Clamp hard. At a perfect focus the area ratio is unbounded, and a
			// handful of pixels pinning to white is what turns caustics from a
			// shimmering web into hard blobs with aliased edges — which the
			// post chain's chromatic aberration then fringes in blue and green.
			// The soft knee keeps the bright cores bright without letting them
			// clip.
			const raw = clamp( gain, 0, 9 );
			const intensity = raw.div( raw.add( 2.2 ) ).mul( 0.95 );

			return vec4( vec3( intensity ), 1 );

		} )();

		// A flat grid in the XZ plane spanning [-extent, extent].
		const geometry = new THREE.PlaneGeometry( 2 * this.extent, 2 * this.extent, GRID, GRID );
		geometry.rotateX( - Math.PI / 2 );
		geometry.deleteAttribute( 'normal' );
		geometry.deleteAttribute( 'uv' );

		const mesh = new THREE.Mesh( geometry, material );
		mesh.frustumCulled = false;
		mesh.name = 'causticEmitter';
		return mesh;

	}

	/** Re-centre on the player, snapped so the pattern does not crawl. */
	follow( x, z ) {

		const snap = ( 2 * this.extent ) / GRID;
		this.originXZ.value.set( Math.round( x / snap ) * snap, Math.round( z / snap ) * snap );

	}

	render() {

		const renderer = this.renderer;
		const prev = renderer.getRenderTarget();

		renderer.setRenderTarget( this.target );
		renderer.setClearColor( 0x000000, 1 );
		renderer.clear();
		renderer.render( this.scene, this.camera );

		renderer.setRenderTarget( prev );

	}

	dispose() {

		this.target.dispose();

	}

}

/**
 * TSL helper for receivers: how much caustic light lands on a surface.
 *
 * `skyVis` is the mesher's baked sky-visibility attribute. Multiplying by it is
 * what stops caustics leaking onto cave ceilings, which is the most immediately
 * wrong-looking artefact this effect has (DESIGN §6.3).
 */
export function causticSample( caustics, worldPos, worldNormal, skyVis ) {

	// Parallax: the map was projected onto a single reference plane, so a
	// receiver above or below it must shift its lookup along the refracted
	// direction by the depth difference.
	const R = normalize( refract( sunDirection.negate(), vec3( 0, 1, 0 ), float( ETA_DOWN ) ) );
	const dy = worldPos.y.sub( caustics.uRefDepth );
	const shifted = worldPos.xz.sub( R.xz.mul( dy.div( max( R.y.negate(), float( 0.05 ) ) ) ) );

	const uvw = shifted.sub( caustics.originXZ ).div( caustics.uExtent ).mul( 0.5 ).add( 0.5 );

	// Fade out at the edge of the map rather than clamping, so its border is
	// never a visible square.
	const edge = smoothstep( float( 0.0 ), float( 0.06 ), uvw.x )
		.mul( smoothstep( float( 1.0 ), float( 0.94 ), uvw.x ) )
		.mul( smoothstep( float( 0.0 ), float( 0.06 ), uvw.y ) )
		.mul( smoothstep( float( 1.0 ), float( 0.94 ), uvw.y ) );

	const c = texture( caustics.target.texture, uvw ).r;

	// Up-facing surfaces catch the light; depth dims it; caves get none.
	const facing = clamp( worldNormal.y, 0, 1 );
	const depthFade = exp( clamp( worldPos.y.negate(), 0, 40 ).mul( - 0.045 ) );
	const aboveWater = smoothstep( float( 0.4 ), float( - 0.6 ), worldPos.y );

	return c.mul( edge ).mul( facing ).mul( depthFade ).mul( clamp( skyVis, 0, 1 ) ).mul( aboveWater );

}

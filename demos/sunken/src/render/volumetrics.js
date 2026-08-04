import * as THREE from 'three/webgpu';
import {
	Fn, vec2, vec3, float, uniform, clamp, smoothstep, exp, max, min, mix,
	normalize, refract, texture, screenCoordinate, mx_fractal_noise_float,
} from 'three/tsl';
import { bayer16 } from 'three/addons/tsl/math/Bayer.js';

import { uTime } from './frame.js';
import { sunDirection } from './sky.js';

/**
 * Volumetric light shafts (DESIGN §6.4).
 *
 * A `VolumeNodeMaterial` box on a dedicated layer, raymarched in a quarter-res
 * pass that only renders that layer, blurred, then added to the scene. Because
 * the material's `depthNode` is fed the main pass's depth buffer, terrain
 * *occludes* the shafts — which is what produces beams through cave mouths and
 * around reef structures rather than a uniform glow.
 *
 * The interesting part is the density function. A plain noise field gives soft
 * fog; real underwater shafts are shaped by the *waves*, because the surface
 * focuses sunlight into sheets before it ever reaches the water below. So the
 * scattering density is modulated by the same projected caustics map the seabed
 * is lit with — the shafts and the pattern they cast on the sand come from one
 * source and therefore actually line up.
 */

export const LAYER_VOLUMETRIC = 10;

const IOR_AIR = 1.0;
const IOR_WATER = 1.333;
const ETA_DOWN = IOR_AIR / IOR_WATER;

export class Volumetrics {

	/**
	 * @param {Caustics|null} caustics  used to shape the shafts (see header)
	 */
	constructor( { steps = 8, caustics = null, size = new THREE.Vector3( 260, 60, 260 ) } = {} ) {

		this.caustics = caustics;
		// Tuned low on purpose. The raymarch accumulates the sun's full radiance
		// along every ray, so at 1.0 the whole scene turns into white haze and
		// the shafts stop reading as shafts. What sells the effect is contrast
		// between lit and occluded volume, not overall brightness.
		this.intensity = uniform( 0.55 );
		this.density = uniform( 1.0 );

		const material = new THREE.VolumeNodeMaterial();
		material.steps = steps;
		// Dither the ray start, or the low step count bands visibly.
		material.offsetNode = bayer16( screenCoordinate );

		material.scatteringNode = Fn( ( { positionRay } ) => {

			const p = positionRay;

			// No scattering above the waterline — the shafts are a property of
			// the water, and letting them bleed into the sky ruins the surface.
			const submerged = smoothstep( float( 0.5 ), float( - 1.5 ), p.y );

			// Denser near the surface where the light is strongest, thinning
			// with depth.
			const depthProfile = exp( clamp( p.y.negate(), 0, 40 ).mul( - 0.055 ) );

			// Drifting particulate.
			const drift = vec3( uTime.mul( 0.06 ), uTime.mul( - 0.03 ), uTime.mul( 0.045 ) );
			const motes = mx_fractal_noise_float( p.mul( 0.055 ).add( drift ), 3, 2, 0.5, 1 )
				.mul( 0.5 ).add( 0.75 );

			const base = submerged.mul( depthProfile ).mul( motes ).toVar();

			// Shape the shafts with the caustics map, projected the same way the
			// seabed samples it. This is what makes the beams wave-shaped and
			// keeps them registered with the pattern on the sand.
			if ( this.caustics !== null ) {

				const R = normalize( refract( sunDirection.negate(), vec3( 0, 1, 0 ), float( ETA_DOWN ) ) );
				const dy = p.y.sub( this.caustics.uRefDepth );
				const shifted = p.xz.sub( R.xz.mul( dy.div( max( R.y.negate(), float( 0.05 ) ) ) ) );
				const uvw = shifted.sub( this.caustics.originXZ ).div( this.caustics.uExtent ).mul( 0.5 ).add( 0.5 );

				const inside = smoothstep( float( 0 ), float( 0.05 ), uvw.x )
					.mul( smoothstep( float( 1 ), float( 0.95 ), uvw.x ) )
					.mul( smoothstep( float( 0 ), float( 0.05 ), uvw.y ) )
					.mul( smoothstep( float( 1 ), float( 0.95 ), uvw.y ) );

				const c = texture( this.caustics.target.texture, uvw ).r.mul( inside );
				// Strong modulation on purpose: the contrast between lit and unlit
				// volume is the entire effect. A gentle multiplier gives even
				// haze, which is worse than no volumetrics at all.
				base.mulAssign( float( 0.45 ).add( c.mul( 4.5 ) ) );

			}

			return base.mul( this.density );

		} );

		this.material = material;

		this.mesh = new THREE.Mesh( new THREE.BoxGeometry( size.x, size.y, size.z ), material );
		this.mesh.name = 'volumetrics';
		this.mesh.frustumCulled = false;
		// Only the volumetric pass renders it.
		this.mesh.layers.disableAll();
		this.mesh.layers.enable( LAYER_VOLUMETRIC );

		this.size = size;

		this.layer = new THREE.Layers();
		this.layer.disableAll();
		this.layer.enable( LAYER_VOLUMETRIC );

	}

	/**
	 * Lights must opt in to the volumetric layer or the raymarch sees nothing.
	 * Easy to forget, and the failure mode is a silent black pass.
	 */
	registerLight( light ) {

		light.layers.enable( LAYER_VOLUMETRIC );
		return light;

	}

	/** Keep the box centred on the player, sitting under the waterline. */
	follow( x, z ) {

		this.mesh.position.set( x, - this.size.y / 2 + 2, z );

	}

}

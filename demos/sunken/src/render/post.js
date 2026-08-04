import * as THREE from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, screenUV, length, clamp, mix,
	smoothstep, sin, cos,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

import { uTime } from './frame.js';
import { waterParams } from './waterFog.js';

/**
 * Post-processing chain (DESIGN §4).
 *
 *   scenePass texture ──► warp + chromatic aberration (3 shared taps)
 *                    └──► bloom
 *   + volumetric pass
 *   ──► grade + vignette ──► out
 *
 * ## Why it is built this way
 *
 * Everything that samples the image more than once binds to the **scene pass's
 * own texture**, never to a computed node. Two failures got us here, both
 * measured rather than guessed:
 *
 *  1. Handing a computed node (scene + volumetrics) to `bloom()` or `fxaa()`
 *     makes each of their many taps re-run that entire upstream graph:
 *     947–1080 ms/frame, against 16.7 ms for everything else combined.
 *  2. The obvious fix — `convertToTexture()` on the composite — renders
 *     **black**, because the composite contains `pass()` nodes that the RTT
 *     does not drive. It is cheap *and* empty, which is the worst kind of
 *     wrong: the frame timer says the problem is solved.
 *
 * So multi-tap effects read `scenePass.getTextureNode()`, and everything merges
 * afterwards with single-sample maths. Chromatic aberration is written inline
 * rather than pulled from the addon, because sharing the warp's three taps
 * makes it free instead of another full pass.
 *
 * Every underwater-only effect is scaled by the shared `submersion` uniform, so
 * breaking the surface reads as one event rather than four coincidences.
 */

export function createPostChain( scenePass, volumetricNode, quality ) {

	const params = {
		bloomStrength: uniform( 0.45 ),
		bloomRadius: uniform( 0.65 ),
		bloomThreshold: uniform( 0.75 ),
		warpAmount: uniform( 0.0026 ),
		// Small. Aberration is a rim effect; at any strength where it is
		// obviously visible it is reading as a rendering fault rather than as a
		// lens, especially across blown highlights.
		aberration: uniform( 0.0008 ),
		vignette: uniform( 0.4 ),
	};

	// `'output'` is required, not optional: the no-argument form does not bind
	// the pass's colour attachment and every sample comes back black — a silent
	// failure that costs nothing on the frame timer.
	const sceneColor = scenePass.getTextureNode( 'output' );

	// ---- warp (+ optional chromatic aberration, sharing the same taps) ----
	//
	// Aberration is OFF in every preset. Underwater the brightest thing in
	// frame is the Snell window, which clips to flat white against much darker
	// water — a razor edge. Splitting R and B across that edge produces a
	// saturated cyan/magenta rim that reads as a rendering fault, and it is
	// worst at the top of the screen where the radial term peaks. The effect it
	// buys is subtle; the artefact is not. Kept behind `quality.chromatic` so
	// it can be re-enabled if the highlight handling ever changes.
	const warped = Fn( () => {

		const p = screenUV;

		// Refraction wobble. Very small: above ~0.004 it stops reading as water
		// and starts reading as a broken display.
		const wobble = vec2(
			sin( p.y.mul( 26 ).add( uTime.mul( 1.6 ) ) )
				.add( sin( p.y.mul( 9.3 ).sub( uTime.mul( 0.9 ) ) ).mul( 0.6 ) ),
			cos( p.x.mul( 22 ).sub( uTime.mul( 1.3 ) ) )
				.add( cos( p.x.mul( 7.7 ).add( uTime.mul( 1.1 ) ) ).mul( 0.6 ) ),
		).mul( params.warpAmount ).mul( waterParams.submersion );

		const base = p.add( wobble );

		if ( quality.chromatic ) {

			// Aberration grows toward the edges — real lenses are sharp in the
			// middle and disperse at the rim.
			const radial = base.sub( vec2( 0.5 ) );
			const spread = radial.mul( params.aberration ).mul( length( radial ).mul( 2 ) );

			return vec4(
				sceneColor.sample( base.add( spread ) ).r,
				sceneColor.sample( base ).g,
				sceneColor.sample( base.sub( spread ) ).b,
				1,
			);

		}

		return sceneColor.sample( base );

	} )();

	// ---- bloom, bound directly to the scene texture ----------------------
	let node = warped;

	if ( quality.bloom ) {

		const bloomPass = bloom( sceneColor, params.bloomStrength, params.bloomRadius, params.bloomThreshold );
		node = node.add( bloomPass );
		params.bloomPass = bloomPass;

	}

	// ---- volumetric shafts ------------------------------------------------
	if ( volumetricNode !== null && volumetricNode !== undefined ) {

		node = node.add( volumetricNode );

	}

	// ---- grade + vignette -------------------------------------------------
	const graded = Fn( () => {

		const colour = node.rgb.toVar();
		const sub = waterParams.submersion;

		// Underwater grade: pull red down, lift blue slightly.
		colour.assign( vec3(
			colour.r.mul( mix( float( 1.0 ), float( 0.94 ), sub ) ),
			colour.g.mul( mix( float( 1.0 ), float( 1.01 ), sub ) ),
			colour.b.mul( mix( float( 1.0 ), float( 1.05 ), sub ) ),
		) );

		// Gentle S-curve for contrast.
		colour.assign( mix( colour, colour.mul( colour ).mul( float( 3 ).sub( colour.mul( 2 ) ) ), 0.18 ) );

		// Vignette, stronger underwater — the mask closing in.
		const d = length( screenUV.sub( vec2( 0.5 ) ) ).mul( 1.414 );
		const vig = smoothstep( float( 1.1 ), float( 0.32 ), d );
		const strength = params.vignette.mul( mix( float( 0.5 ), float( 1.0 ), sub ) );

		colour.mulAssign( mix( float( 1 ), vig, strength ) );

		return vec4( colour, 1 );

	} )();

	return { node: graded, params };

}

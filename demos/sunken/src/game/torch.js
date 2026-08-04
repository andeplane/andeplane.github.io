import * as THREE from 'three/webgpu';

/**
 * The dive torch (PRD §3.2, `F`).
 *
 * Caves are genuinely dark — the mesher bakes sky visibility precisely so they
 * can be — which makes the torch the thing that lets you explore them. The
 * warm cone against the blue-green water is also the strongest colour contrast
 * in the game, so it earns its cost.
 */

export class Torch {

	constructor( scene, camera ) {

		this.camera = camera;
		this.on = false;

		// Intensity is in candela — three's lighting is physically correct, with
		// no legacy-lights escape hatch. A value like 26 that looks reasonable
		// next to a DirectionalLight's 3 produces essentially nothing from a
		// SpotLight with inverse-square decay; useful throw needs hundreds.
		this.light = new THREE.SpotLight( 0xffe6b8, 0, 44, Math.PI / 6.5, 0.6, 2 );
		this.light.castShadow = false;   // a second shadow map is not worth 1 ms

		// Kept permanently `visible` even when off, with intensity driven to 0.
		// Toggling visibility adds/removes a light from every material's shader
		// permutation, which recompiles ~380 pipelines mid-game — a ~175 ms
		// stall on the exact keypress the player is watching. One always-present
		// unshadowed spotlight is far cheaper than that.
		this.light.visible = true;

		// Parented to the camera so it tracks head movement exactly, with no
		// one-frame lag between where you look and where the beam points.
		this.target = new THREE.Object3D();
		this.target.position.set( 0, 0, - 1 );
		camera.add( this.target );
		camera.add( this.light );
		this.light.position.set( 0.18, - 0.12, 0 );   // slightly off-axis, handheld
		this.light.target = this.target;

		scene.add( camera );

		this._intensity = 0;
		this.maxIntensity = 430;

		// Slow handheld drift, so the beam is never perfectly rigid.
		this._t = 0;

	}

	toggle() {

		this.on = ! this.on;
		return this.on;

	}

	update( dt ) {

		const target = this.on ? this.maxIntensity : 0;

		// Asymmetric ramp: switching on has a fast filament flare, switching off
		// decays a little more slowly. Instant on/off reads as a UI toggle
		// rather than a physical lamp.
		const rate = this.on ? 12 : 7;
		this._intensity += ( target - this._intensity ) * Math.min( 1, dt * rate );

		this._t += dt;
		const flicker = 1 + Math.sin( this._t * 11.3 ) * 0.012 + Math.sin( this._t * 4.1 ) * 0.02;

		this.light.intensity = this._intensity * flicker;
		if ( ! this.on && this._intensity < 0.5 ) this.light.intensity = 0;

		// Handheld sway.
		this.light.position.x = 0.18 + Math.sin( this._t * 0.9 ) * 0.03;
		this.light.position.y = - 0.12 + Math.sin( this._t * 1.3 ) * 0.02;

	}

}

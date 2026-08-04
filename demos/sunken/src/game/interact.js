import * as THREE from 'three/webgpu';
import { emit } from '../core/events.js';

/**
 * Interaction registry (DESIGN §8).
 *
 * Objects register a position, a radius and a prompt; each frame the closest
 * eligible one within the player's view cone wins and its prompt is shown. `E`
 * fires it.
 *
 * A view-cone test rather than a strict raycast: underwater the player is
 * drifting and the camera is bobbing, so a pixel-accurate ray makes small
 * objects frustrating to hit. Distance plus "roughly looking at it" is what
 * players actually expect.
 *
 * Everything interactive in the game — the chest, the clam, the geode, the
 * bottle — is just a registration, which is what keeps missions data-only.
 */

export class Interactions {

	constructor( camera, hud ) {

		this.camera = camera;
		this.hud = hud;
		this.entries = new Map();
		this.current = null;

		this._forward = new THREE.Vector3();
		this._toTarget = new THREE.Vector3();

	}

	/**
	 * @param {object} entry
	 * @param {string} entry.id
	 * @param {THREE.Vector3} entry.position   may be mutated by the owner
	 * @param {number} [entry.radius]          how close you must be
	 * @param {string} entry.prompt            e.g. "Open the chest"
	 * @param {Function} entry.onInteract
	 * @param {Function} [entry.enabled]       predicate; false hides the prompt
	 */
	register( entry ) {

		this.entries.set( entry.id, { radius: 3.4, ...entry } );
		return () => this.entries.delete( entry.id );

	}

	unregister( id ) {

		this.entries.delete( id );

	}

	update( playerPosition ) {

		this.camera.getWorldDirection( this._forward );

		let best = null;
		let bestScore = - Infinity;

		for ( const entry of this.entries.values() ) {

			if ( entry.enabled !== undefined && entry.enabled() === false ) continue;

			this._toTarget.copy( entry.position ).sub( playerPosition );
			const distance = this._toTarget.length();
			if ( distance > entry.radius ) continue;

			this._toTarget.divideScalar( Math.max( distance, 0.0001 ) );
			const facing = this._toTarget.dot( this._forward );
			// ~75° half-angle. Generous on purpose (see header).
			if ( facing < 0.25 ) continue;

			// Prefer what you are looking most directly at, then what is closest.
			const score = facing * 2 - distance / entry.radius;
			if ( score > bestScore ) { bestScore = score; best = entry; }

		}

		if ( best !== this.current ) {

			this.current = best;
			this.hud.setPrompt( best ? `<kbd>E</kbd> ${best.prompt}` : null );

		}

	}

	/** Fire the highlighted interactable. Returns true if something happened. */
	trigger() {

		const entry = this.current;
		if ( entry === null || entry === undefined ) return false;

		entry.onInteract( entry );
		emit( 'interact', { id: entry.id } );

		// Most interactions change the prompt (or remove it); force a refresh.
		this.current = null;
		this.hud.setPrompt( null );
		return true;

	}

}

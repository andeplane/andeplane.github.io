import { field, fieldGradient, WORLD } from './field.js';

/**
 * Player collision against the analytic density field (DESIGN §3.3).
 *
 * No collider meshes exist — we resolve directly against the same `field()`
 * that generated the terrain, so the two cannot drift apart. The player is
 * treated as a sphere; penetration is resolved along the field gradient and the
 * remaining velocity is projected onto the surface tangent so you *slide* along
 * cave walls instead of sticking to them.
 */

export class FieldCollider {

	constructor() {

		this.grounded = false;
		this.lastNormal = { x: 0, y: 1, z: 0 };

	}

	/**
	 * @param {Vector3} position  mutated in place
	 * @param {Vector3} velocity  mutated in place
	 * @param {number}  radius
	 */
	resolve( position, velocity, radius ) {

		// Keep the diver inside the world box.
		if ( position.y < WORLD.yMin + 1 ) {

			position.y = WORLD.yMin + 1;
			if ( velocity.y < 0 ) velocity.y = 0;

		}

		if ( position.y > WORLD.yMax + 40 ) {

			position.y = WORLD.yMax + 40;
			if ( velocity.y > 0 ) velocity.y = 0;

		}

		this.grounded = false;
		this.lastNormal = { x: 0, y: 1, z: 0 };

	}

	/**
	 * @param {Vector3} position  mutated in place
	 * @param {Vector3} velocity  mutated in place
	 * @param {number}  radius
	 */
	resolve( position, velocity, radius ) {

		// Keep the diver inside the world box.
		if ( position.y < WORLD.yMin + 1 ) {

			position.y = WORLD.yMin + 1;
			if ( velocity.y < 0 ) velocity.y = 0;

		}

		if ( position.y > WORLD.yMax + 40 ) {

			position.y = WORLD.yMax + 40;
			if ( velocity.y > 0 ) velocity.y = 0;

		}

		// No horizontal bounds at all: the world streams forever in X and Z.
		// Only the vertical extent is clamped, above.

		this.grounded = false;

		// Two relaxation iterations: one push rarely resolves a corner where
		// two surfaces meet, and three is wasted work.
		for ( let iter = 0; iter < 2; iter ++ ) {

			const f = field( position.x, position.y, position.z );

			// `field` is not a true distance function (it is a density), so
			// treat its value as an approximate signed distance and step out
			// conservatively rather than trusting the magnitude.
			if ( f < - radius ) break;

			const g = fieldGradient( position.x, position.y, position.z );

			// Outward = away from rock = -gradient.
			const nx = - g.x, ny = - g.y, nz = - g.z;

			// Push out by a fixed fraction; iterating converges quickly and
			// avoids the overshoot a raw density value would cause.
			const penetration = Math.min( f + radius, radius * 2 );
			if ( penetration <= 0 ) break;

			const step = Math.min( penetration * 0.6, 0.35 );
			position.x += nx * step;
			position.y += ny * step;
			position.z += nz * step;

			// Cancel the velocity component going into the surface, keep the
			// tangential part → slide.
			const vn = velocity.x * nx + velocity.y * ny + velocity.z * nz;
			if ( vn < 0 ) {

				velocity.x -= nx * vn;
				velocity.y -= ny * vn;
				velocity.z -= nz * vn;
				// A little friction so you don't skate frictionlessly on sand.
				velocity.x *= 0.94;
				velocity.z *= 0.94;

			}

			this.lastNormal.x = nx; this.lastNormal.y = ny; this.lastNormal.z = nz;
			if ( ny > 0.5 ) this.grounded = true;

		}

	}

}

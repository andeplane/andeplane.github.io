import * as THREE from 'three/webgpu';

/**
 * The diver.
 *
 * PRD §3.2: momentum is heavily damped and buoyancy pulls gently upward when
 * neutral. That damping is what makes this feel like water rather than a flying
 * camera, so the tuning constants here are gameplay, not physics trivia.
 *
 * Collision is resolved against the analytic density field (DESIGN §3.3) — the
 * same function that generated the terrain mesh, so the two can never disagree.
 * `collider` is injected and may be null before the world exists.
 */

const UP = new THREE.Vector3( 0, 1, 0 );

export class Player {

	constructor( camera, input ) {

		this.camera = camera;
		this.input = input;
		this.collider = null;

		this.position = new THREE.Vector3( 0, - 14, 40 );
		this.velocity = new THREE.Vector3();

		this.yaw = 0;
		this.pitch = 0;

		this.radius = 0.45;

		// Tuning (metres, seconds).
		this.swimAccel = 26;
		this.sprintMultiplier = 2.15;
		this.verticalAccel = 20;
		this.dragUnderwater = 2.9;     // heavy — water
		this.dragAir = 0.45;           // light — ballistic when breaching
		this.buoyancy = 1.35;          // gentle rise when neutral underwater
		this.gravity = 18;             // when out of the water
		this.maxSpeed = 9;

		this.submerged = true;
		this.depth = 0;

		// Camera feel.
		this._bob = 0;
		this._sprintBlend = 0;
		this.baseFov = 62;

		this._fwd = new THREE.Vector3();
		this._right = new THREE.Vector3();
		this._wish = new THREE.Vector3();
		this._step = new THREE.Vector3();

	}

	get headPosition() {

		return this.position;

	}

	setCollider( collider ) {

		this.collider = collider;

	}

	/** Water surface height at the player (overridden once waves exist). */
	surfaceHeightAt( /* x, z */ ) {

		return 0;

	}

	update( dt ) {

		if ( this.frozen === true ) {

			this._look();
			this._applyCamera( dt );
			return;

		}

		this._look();
		this._accelerate( dt );
		this._integrate( dt );
		this._applyCamera( dt );

	}

	_look() {

		const { x, y } = this.input.takeLook();
		this.yaw -= x;
		this.pitch -= y;

		const limit = Math.PI / 2 - 0.02;
		this.pitch = Math.max( - limit, Math.min( limit, this.pitch ) );

	}

	_accelerate( dt ) {

		const input = this.input;

		// Basis from yaw/pitch. Forward includes pitch so you swim where you look.
		const cp = Math.cos( this.pitch ), sp = Math.sin( this.pitch );
		const cy = Math.cos( this.yaw ), sy = Math.sin( this.yaw );
		this._fwd.set( - sy * cp, sp, - cy * cp );
		this._right.set( cy, 0, - sy );

		const fwdAxis = input.axis( 'back', 'forward' );
		const strafeAxis = input.axis( 'left', 'right' );
		const vertAxis = input.axis( 'down', 'up' );

		this._wish.set( 0, 0, 0 );
		this._wish.addScaledVector( this._fwd, fwdAxis );
		this._wish.addScaledVector( this._right, strafeAxis );
		if ( this._wish.lengthSq() > 0 ) this._wish.normalize();

		const sprinting = input.is( 'sprint' ) && fwdAxis > 0;
		const target = sprinting ? 1 : 0;
		this._sprintBlend += ( target - this._sprintBlend ) * Math.min( 1, dt * 4 );

		const accel = this.swimAccel * ( sprinting ? this.sprintMultiplier : 1 );
		this.velocity.addScaledVector( this._wish, accel * dt );
		this.velocity.y += vertAxis * this.verticalAccel * dt;

		this.sprinting = sprinting;

	}

	_integrate( dt ) {

		const surfaceY = this.surfaceHeightAt( this.position.x, this.position.z );
		this.submerged = this.position.y < surfaceY;
		this.depth = Math.max( 0, surfaceY - this.position.y );

		if ( this.submerged ) {

			// Buoyancy tapers to zero right at the surface so you can float
			// stably at the waterline instead of being launched out of it.
			const nearSurface = Math.min( 1, this.depth / 1.5 );
			this.velocity.y += this.buoyancy * nearSurface * dt;

			const drag = Math.exp( - this.dragUnderwater * dt );
			this.velocity.multiplyScalar( drag );

		} else {

			this.velocity.y -= this.gravity * dt;
			this.velocity.multiplyScalar( Math.exp( - this.dragAir * dt ) );

		}

		const speed = this.velocity.length();
		if ( speed > this.maxSpeed ) this.velocity.multiplyScalar( this.maxSpeed / speed );

		// DESIGN §3.3: substep so we can never tunnel through a cave wall at
		// sprint speed (PRD S10).
		const travel = speed * dt;
		const steps = Math.max( 1, Math.min( 8, Math.ceil( travel / 0.25 ) ) );
		const sub = dt / steps;

		for ( let i = 0; i < steps; i ++ ) {

			this._step.copy( this.velocity ).multiplyScalar( sub );
			this.position.add( this._step );

			if ( this.collider !== null ) {

				this.collider.resolve( this.position, this.velocity, this.radius );

			}

		}

	}

	_applyCamera( dt ) {

		// Slow breathing bob; almost subliminal, but its absence reads as "flying".
		this._bob += dt * ( this.submerged ? 0.9 : 1.6 );
		const bobAmount = this.submerged ? 0.055 : 0.02;
		const bobY = Math.sin( this._bob ) * bobAmount;
		const bobRoll = Math.sin( this._bob * 0.5 ) * 0.006;

		this.camera.position.copy( this.position );
		this.camera.position.y += bobY;

		this.camera.rotation.set( 0, 0, 0 );
		this.camera.rotateY( this.yaw );
		this.camera.rotateX( this.pitch );
		this.camera.rotateZ( bobRoll + this._sprintBlend * 0.012 );

		const fov = this.baseFov + this._sprintBlend * 8;
		if ( Math.abs( this.camera.fov - fov ) > 0.01 ) {

			this.camera.fov = fov;
			this.camera.updateProjectionMatrix();

		}

	}

	get heading() {

		return this.yaw;

	}

}

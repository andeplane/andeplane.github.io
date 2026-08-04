import * as THREE from 'three/webgpu';
import {
	Fn, attribute, positionLocal, normalWorld, positionWorld, vec3, vec4, float,
	uniform, sin, cos, clamp, mix, smoothstep, pow,
} from 'three/tsl';

import { buildCrab } from '../geometry/creatures.js';
import { field, heightAt, surfaceBelow, fieldGradient, skyVisibilityAt, WORLD } from '../world/field.js';
import { stream } from '../core/rng.js';
import { uTime } from '../render/frame.js';
import { causticSample } from '../render/caustics.js';

/**
 * Crabs (DESIGN §7.2).
 *
 * CPU agents, not a GPU flock: they *walk on a surface*, which means every
 * update needs the terrain height and gradient beneath them — the one thing the
 * shader cannot cheaply ask for. There are only ~120 of them, so the cost is
 * trivial.
 *
 * All of them render in a single instanced draw call. Legs are animated
 * procedurally in the vertex shader from the `legIndex` and `limbT` attributes
 * baked into the geometry plus a per-instance gait phase — no bones, no
 * skinning, no per-crab draw.
 */

const STATE = { IDLE: 0, WANDER: 1, SCUTTLE: 2 };

export class Crabs {

	constructor( scene, { count = 120, caustics = null } = {} ) {

		this.count = count;
		this.agents = [];

		const rnd = stream( 'crabs' );

		// ---- placement ----------------------------------------------------
		let placed = 0;
		for ( let attempt = 0; attempt < count * 40 && placed < count; attempt ++ ) {

			const a = rnd() * Math.PI * 2;
			const r = Math.sqrt( rnd() ) * ( WORLD.edgeRadius - 12 );
			const x = Math.cos( a ) * r, z = Math.sin( a ) * r;

			const h = heightAt( x, z );
			if ( h < - 28 || h > - 1.5 ) continue;

			const y = surfaceBelow( x, Math.min( h + 6, WORLD.yMax ), z );
			if ( y === null ) continue;

			const g = fieldGradient( x, y + 0.05, z );
			if ( - g.y < 0.62 ) continue;   // too steep to stand on

			this.agents.push( {
				x, y, z,
				heading: rnd() * Math.PI * 2,
				state: STATE.IDLE,
				timer: rnd() * 3,
				speed: 0,
				gait: rnd() * Math.PI * 2,
				scale: 0.75 + rnd() * 0.6,
				tint: rnd(),
				sky: skyVisibilityAt( x, y + 0.2, z, h ),
				nx: - g.x, ny: - g.y, nz: - g.z,
			} );
			placed ++;

		}

		this.count = this.agents.length;

		// ---- mesh ---------------------------------------------------------
		const geometry = buildCrab( { size: 0.24 } );
		const material = this._material( caustics );

		this.mesh = new THREE.InstancedMesh( geometry, material, Math.max( 1, this.count ) );
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = true;
		this.mesh.name = 'crabs';

		const gaits = new Float32Array( this.count );
		const tints = new Float32Array( this.count );
		const skies = new Float32Array( this.count );
		const moving = new Float32Array( this.count );

		for ( let i = 0; i < this.count; i ++ ) {

			gaits[ i ] = this.agents[ i ].gait;
			tints[ i ] = this.agents[ i ].tint;
			skies[ i ] = this.agents[ i ].sky;

		}

		geometry.setAttribute( 'iGait', new THREE.InstancedBufferAttribute( gaits, 1 ) );
		geometry.setAttribute( 'iTint', new THREE.InstancedBufferAttribute( tints, 1 ) );
		geometry.setAttribute( 'iSky', new THREE.InstancedBufferAttribute( skies, 1 ) );
		this.movingAttr = new THREE.InstancedBufferAttribute( moving, 1 );
		this.movingAttr.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'iMoving', this.movingAttr );

		this._matrix = new THREE.Matrix4();
		this._quat = new THREE.Quaternion();
		this._slope = new THREE.Quaternion();
		this._yaw = new THREE.Quaternion();
		this._pos = new THREE.Vector3();
		this._scale = new THREE.Vector3();
		this._up = new THREE.Vector3( 0, 1, 0 );
		this._normal = new THREE.Vector3();

		this._writeMatrices();
		scene.add( this.mesh );

	}

	_material( caustics ) {

		const material = new THREE.MeshStandardNodeMaterial( { roughness: 0.7, metalness: 0.05 } );

		const legIndex = attribute( 'legIndex', 'float' );
		const limbT = attribute( 'limbT', 'float' );
		const iGait = attribute( 'iGait', 'float' );
		const iTint = attribute( 'iTint', 'float' );
		const iSky = attribute( 'iSky', 'float' );
		const iMoving = attribute( 'iMoving', 'float' );

		const shellA = uniform( new THREE.Color( 0xa4462f ) );
		const shellB = uniform( new THREE.Color( 0xd88a4a ) );

		material.positionNode = Fn( () => {

			const p = positionLocal.toVar();

			// legIndex 0 is the body; 1..8 the walking legs; 9/10 the claws.
			const isLeg = smoothstep( float( 0.5 ), float( 1.5 ), legIndex )
				.mul( smoothstep( float( 9.5 ), float( 8.5 ), legIndex ) );

			// Alternating tripod gait: neighbouring legs move in antiphase, so
			// the crab never lifts everything at once.
			const legPhase = iGait.add( uTime.mul( 9.0 ) ).add( legIndex.mul( 3.14159 ) );
			const lift = sin( legPhase ).mul( 0.5 ).add( 0.5 ).mul( limbT ).mul( isLeg ).mul( iMoving );
			const swing = cos( legPhase ).mul( limbT ).mul( isLeg ).mul( iMoving );

			p.y = p.y.add( lift.mul( 0.055 ) );
			p.z = p.z.add( swing.mul( 0.05 ) );

			// Claws wave slowly even at rest — a completely still crab reads as
			// a rock.
			const isClaw = smoothstep( float( 8.5 ), float( 9.5 ), legIndex );
			p.y = p.y.add( sin( uTime.mul( 2.1 ).add( iGait ) ).mul( 0.02 ).mul( limbT ).mul( isClaw ) );

			return p;

		} )();

		material.colorNode = Fn( () => {

			const base = mix( shellA, shellB, clamp( iTint, 0, 1 ) ).toVar();
			// Mottling so a hundred crabs are not a hundred identical crabs.
			const mottle = sin( positionLocal.x.mul( 34 ) ).mul( sin( positionLocal.z.mul( 29 ) ) ).mul( 0.10 ).add( 0.95 );
			base.mulAssign( mottle );
			base.mulAssign( mix( float( 0.15 ), float( 1.0 ), clamp( iSky, 0, 1 ) ) );
			return vec4( base, 1 );

		} )();

		if ( caustics !== null ) {

			material.emissiveNode = Fn( () => {

				return vec3( 0.7, 0.94, 1.0 )
					.mul( causticSample( caustics, positionWorld, normalWorld, iSky ) )
					.mul( 0.8 );

			} )();

		}

		return material;

	}

	_writeMatrices() {

		for ( let i = 0; i < this.count; i ++ ) {

			const a = this.agents[ i ];

			this._normal.set( a.nx, a.ny, a.nz ).normalize();
			this._slope.setFromUnitVectors( this._up, this._normal );
			this._yaw.setFromAxisAngle( this._up, a.heading );
			this._quat.copy( this._slope ).multiply( this._yaw );

			this._pos.set( a.x, a.y, a.z );
			this._scale.setScalar( a.scale );
			this._matrix.compose( this._pos, this._quat, this._scale );
			this.mesh.setMatrixAt( i, this._matrix );

		}

		this.mesh.instanceMatrix.needsUpdate = true;

	}

	update( dt, playerPosition ) {

		const moving = this.movingAttr.array;

		for ( let i = 0; i < this.count; i ++ ) {

			const a = this.agents[ i ];

			// Flee the player — sideways, as crabs do.
			const dx = a.x - playerPosition.x;
			const dz = a.z - playerPosition.z;
			const dy = a.y - playerPosition.y;
			const distSq = dx * dx + dy * dy + dz * dz;

			if ( distSq < 36 ) {

				a.state = STATE.SCUTTLE;
				a.timer = 1.6;
				// Run away from the player, offset 90° so the motion is a
				// sidestep rather than a retreat.
				a.heading = Math.atan2( dx, dz ) + Math.PI * 0.5;

			}

			a.timer -= dt;

			if ( a.timer <= 0 ) {

				if ( a.state === STATE.SCUTTLE || Math.random() < 0.5 ) {

					a.state = STATE.IDLE;
					a.timer = 1.5 + Math.random() * 4;

				} else {

					a.state = STATE.WANDER;
					a.timer = 1.5 + Math.random() * 3;
					a.heading += ( Math.random() - 0.5 ) * 2.4;

				}

			}

			const targetSpeed = a.state === STATE.SCUTTLE ? 2.4 : a.state === STATE.WANDER ? 0.55 : 0;
			a.speed += ( targetSpeed - a.speed ) * Math.min( 1, dt * 7 );

			if ( a.speed > 0.01 ) {

				// Crabs travel sideways relative to their facing.
				const nx = a.x + Math.cos( a.heading ) * a.speed * dt;
				const nz = a.z + Math.sin( a.heading ) * a.speed * dt;

				if ( Math.hypot( nx, nz ) < WORLD.edgeRadius - 8 ) {

					// Re-ground against the field so they crawl over rocks
					// instead of walking through them.
					const h = heightAt( nx, nz );
					const ny = surfaceBelow( nx, Math.min( h + 3, WORLD.yMax ), nz, 8, 0.3 );

					if ( ny !== null && Math.abs( ny - a.y ) < 1.2 ) {

						a.x = nx; a.z = nz; a.y = ny;
						const g = fieldGradient( nx, ny + 0.05, nz );
						a.nx = - g.x; a.ny = - g.y; a.nz = - g.z;

					} else {

						// Blocked — turn rather than clip through.
						a.heading += 1.8;

					}

				} else {

					a.heading += Math.PI;

				}

			}

			moving[ i ] = Math.min( 1, a.speed / 0.5 );

		}

		this.movingAttr.needsUpdate = true;
		this._writeMatrices();

	}

}

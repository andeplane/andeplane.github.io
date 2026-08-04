import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	Fn, attribute, positionLocal, vec3, vec4, float, uniform, sin, clamp, mix,
	smoothstep, pow, max,
} from 'three/tsl';

import { uTime } from '../render/frame.js';
import { stream } from '../core/rng.js';

/**
 * The treasure chest — the hero easter egg (PRD §6.1).
 *
 * Explicitly requested, so it gets more polish than any other single object:
 * the lid swings on a hinge, a warm light floods out, and hundreds of gold
 * coins and cut diamonds spill and settle with ballistic motion. It stays open
 * and glowing forever afterwards, so it becomes a landmark rather than a
 * one-shot animation.
 *
 * The treasure is two InstancedMeshes (coins, gems) integrated on the CPU —
 * a few hundred bodies for a few seconds is nothing, and CPU integration means
 * they can settle against the actual seabed height.
 */

const COIN_COUNT = 260;
const GEM_COUNT = 70;

function strip( g ) {

	for ( const name of Object.keys( g.attributes ) ) {

		if ( name !== 'position' && name !== 'normal' ) g.deleteAttribute( name );

	}

	if ( g.getIndex() === null ) g.setIndex( [ ...Array( g.getAttribute( 'position' ).count ).keys() ] );
	return g;

}

/** Chest body and lid, built separately so the lid can hinge. */
function buildChestParts() {

	const W = 1.15, H = 0.62, D = 0.78;

	// ---- body ----
	const bodyParts = [];
	const shell = new THREE.BoxGeometry( W, H, D );
	shell.translate( 0, H / 2, 0 );
	bodyParts.push( shell );

	// Iron bands.
	for ( const x of [ - W * 0.32, W * 0.32 ] ) {

		const band = new THREE.BoxGeometry( 0.075, H + 0.02, D + 0.02 );
		band.translate( x, H / 2, 0 );
		bodyParts.push( band );

	}

	// Corner feet.
	for ( const sx of [ - 1, 1 ] ) {

		for ( const sz of [ - 1, 1 ] ) {

			const foot = new THREE.BoxGeometry( 0.13, 0.10, 0.13 );
			foot.translate( sx * ( W / 2 - 0.07 ), 0.04, sz * ( D / 2 - 0.07 ) );
			bodyParts.push( foot );

		}

	}

	// Lock plate.
	const lock = new THREE.BoxGeometry( 0.18, 0.20, 0.05 );
	lock.translate( 0, H * 0.72, D / 2 + 0.01 );
	bodyParts.push( lock );

	// ---- lid ----
	// Barrel top: a half cylinder, hinged along the back edge.
	const lidParts = [];
	const barrel = new THREE.CylinderGeometry( D / 2, D / 2, W, 14, 1, false, 0, Math.PI );
	barrel.rotateZ( Math.PI / 2 );
	lidParts.push( barrel );

	for ( const x of [ - W * 0.32, W * 0.32 ] ) {

		const band = new THREE.CylinderGeometry( D / 2 + 0.012, D / 2 + 0.012, 0.075, 14, 1, false, 0, Math.PI );
		band.rotateZ( Math.PI / 2 );
		band.translate( x, 0, 0 );
		lidParts.push( band );

	}

	const body = mergeGeometries( bodyParts.map( strip ) );
	const lid = mergeGeometries( lidParts.map( strip ) );

	// The lid pivots about its back edge, so shift geometry to put the hinge at
	// the origin — rotating a lid about its centre makes it sink into the box.
	lid.translate( 0, 0, - D / 2 );

	return { body, lid, W, H, D };

}

function woodMaterial() {

	const material = new THREE.MeshStandardNodeMaterial( { roughness: 0.78, metalness: 0.15 } );

	material.colorNode = Fn( () => {

		const p = positionLocal;
		// Plank grain along X, with darker iron banding picked out by position.
		const grain = sin( p.z.mul( 44 ).add( sin( p.x.mul( 7 ) ).mul( 2 ) ) ).mul( 0.5 ).add( 0.5 );
		const wood = mix( vec3( 0.16, 0.095, 0.055 ), vec3( 0.30, 0.19, 0.11 ), grain );

		// Iron where the bands are.
		const band = smoothstep( float( 0.30 ), float( 0.40 ), p.x.abs() )
			.mul( smoothstep( float( 0.42 ), float( 0.32 ), p.x.abs() ) );
		const iron = vec3( 0.14, 0.13, 0.13 );

		// Barnacle / algae crust on the upper surfaces.
		const crust = smoothstep( float( 0.1 ), float( 0.5 ), p.y ).mul( 0.35 );

		return vec4( mix( mix( wood, iron, band ), vec3( 0.26, 0.32, 0.24 ), crust ), 1 );

	} )();

	return material;

}

function treasureMaterial( { color, emissive, sparkle } ) {

	const material = new THREE.MeshStandardNodeMaterial( {
		roughness: 0.18,
		metalness: 0.95,
	} );

	const iPhase = attribute( 'iPhase', 'float' );
	const uColor = uniform( new THREE.Color( color ) );
	const uEmissive = uniform( new THREE.Color( emissive ) );

	material.colorNode = vec4( uColor, 1 );

	// A per-instance twinkle, offset by phase. Cheap stand-in for the specular
	// glints that real faceted gems throw as they tumble.
	material.emissiveNode = Fn( () => {

		const tw = sin( uTime.mul( 3.1 ).add( iPhase.mul( 6.28 ) ) ).mul( 0.5 ).add( 0.5 );
		return uEmissive.mul( pow( tw, float( 3 ) ).mul( sparkle ).add( 0.25 ) );

	} )();

	return material;

}

export class TreasureChest {

	/**
	 * @param {THREE.Vector3} position  where the chest sits
	 * @param {number} facing           yaw in radians
	 */
	constructor( scene, position, facing = 0, { groundYAt = null } = {} ) {

		this.scene = scene;
		this.position = position.clone();
		this.opened = false;
		this.openT = 0;
		this.groundYAt = groundYAt;

		const { body, lid, H, D } = buildChestParts();
		const material = woodMaterial();

		this.group = new THREE.Group();
		this.group.position.copy( position );
		this.group.rotation.y = facing;
		this.group.name = 'treasureChest';

		this.bodyMesh = new THREE.Mesh( body, material );
		this.bodyMesh.castShadow = true;
		this.bodyMesh.receiveShadow = true;
		this.group.add( this.bodyMesh );

		// Hinge pivot at the back top edge of the body.
		this.hinge = new THREE.Group();
		this.hinge.position.set( 0, H, - D / 2 );
		this.lidMesh = new THREE.Mesh( lid, material );
		this.lidMesh.castShadow = true;
		this.hinge.add( this.lidMesh );
		this.group.add( this.hinge );

		// The glow inside. Off until opened.
		this.light = new THREE.PointLight( 0xffc247, 0, 22, 2 );
		this.light.position.set( 0, H * 0.6, 0 );
		this.group.add( this.light );

		this._buildTreasure();

		scene.add( this.group );

	}

	_buildTreasure() {

		const rnd = stream( 'treasure' );

		// Coins: flat cylinders. Gems: octahedra — the classic cut-stone read.
		const coinGeo = new THREE.CylinderGeometry( 0.055, 0.055, 0.012, 10 );
		const gemGeo = new THREE.OctahedronGeometry( 0.06, 0 );
		gemGeo.scale( 1, 1.35, 1 );

		const coinMat = treasureMaterial( { color: 0xffc03a, emissive: 0xffdb7a, sparkle: 1.4 } );
		const gemMat = treasureMaterial( { color: 0xbfeaff, emissive: 0xeaf9ff, sparkle: 3.2 } );

		this.coins = new THREE.InstancedMesh( coinGeo, coinMat, COIN_COUNT );
		this.gems = new THREE.InstancedMesh( gemGeo, gemMat, GEM_COUNT );

		for ( const m of [ this.coins, this.gems ] ) {

			m.frustumCulled = false;
			m.castShadow = false;
			m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
			this.scene.add( m );

		}

		const phaseCoins = new Float32Array( COIN_COUNT );
		const phaseGems = new Float32Array( GEM_COUNT );
		for ( let i = 0; i < COIN_COUNT; i ++ ) phaseCoins[ i ] = rnd();
		for ( let i = 0; i < GEM_COUNT; i ++ ) phaseGems[ i ] = rnd();
		coinGeo.setAttribute( 'iPhase', new THREE.InstancedBufferAttribute( phaseCoins, 1 ) );
		gemGeo.setAttribute( 'iPhase', new THREE.InstancedBufferAttribute( phaseGems, 1 ) );

		// Bodies start inside the chest, hidden by being scaled to nothing.
		this.bodies = [];
		const make = ( count, kind ) => {

			for ( let i = 0; i < count; i ++ ) {

				this.bodies.push( {
					kind,
					index: i,
					x: 0, y: 0, z: 0,
					vx: 0, vy: 0, vz: 0,
					rx: rnd() * 6.28, ry: rnd() * 6.28, rz: rnd() * 6.28,
					wx: 0, wy: 0, wz: 0,
					scale: 0,
					settled: false,
					restY: 0,
				} );

			}

		};

		make( COIN_COUNT, 'coin' );
		make( GEM_COUNT, 'gem' );

		this._matrix = new THREE.Matrix4();
		this._quat = new THREE.Quaternion();
		this._euler = new THREE.Euler();
		this._pos = new THREE.Vector3();
		this._scl = new THREE.Vector3();

		this._writeInstances();

	}

	/** World-space position of the chest's mouth, where treasure erupts from. */
	_mouth() {

		return new THREE.Vector3( this.position.x, this.position.y + 0.45, this.position.z );

	}

	open() {

		if ( this.opened ) return false;
		this.opened = true;

		const rnd = stream( 'treasure-burst' );
		const mouth = this._mouth();

		for ( const b of this.bodies ) {

			b.x = mouth.x + ( rnd() - 0.5 ) * 0.5;
			b.y = mouth.y + rnd() * 0.2;
			b.z = mouth.z + ( rnd() - 0.5 ) * 0.35;

			// Burst upward and outward. Underwater, so this is a slow fountain
			// rather than an explosion — that slowness is most of the charm.
			const a = rnd() * Math.PI * 2;
			const speed = 0.8 + rnd() * 1.9;
			b.vx = Math.cos( a ) * speed * 0.55;
			b.vz = Math.sin( a ) * speed * 0.55;
			b.vy = 1.6 + rnd() * 2.6;

			b.wx = ( rnd() - 0.5 ) * 7;
			b.wy = ( rnd() - 0.5 ) * 7;
			b.wz = ( rnd() - 0.5 ) * 7;

			b.scale = 1;
			b.settled = false;
			b.restY = this.groundYAt !== null ? this.groundYAt( b.x, b.z ) : this.position.y;

		}

		return true;

	}

	update( dt ) {

		// ---- lid ----------------------------------------------------------
		if ( this.opened && this.openT < 1 ) {

			this.openT = Math.min( 1, this.openT + dt * 0.85 );

		}

		// Ease-out with a slight overshoot, so the lid falls back a touch —
		// heavy hinged things do not stop dead.
		const e = 1 - Math.pow( 1 - this.openT, 3 );
		const overshoot = Math.sin( this.openT * Math.PI ) * 0.09;
		this.hinge.rotation.x = - ( e * 1.95 + overshoot );

		// ---- glow ---------------------------------------------------------
		const targetIntensity = this.opened ? 78 : 0;
		this.light.intensity += ( targetIntensity * ( 0.85 + Math.sin( performance.now() * 0.002 ) * 0.15 ) - this.light.intensity ) * Math.min( 1, dt * 2.2 );

		// ---- treasure bodies ----------------------------------------------
		if ( ! this.opened ) return;

		for ( const b of this.bodies ) {

			if ( b.settled ) continue;

			// Buoyant-ish gravity and heavy drag: gold sinks, but through water.
			b.vy -= 5.2 * dt;
			const drag = Math.exp( - 1.9 * dt );
			b.vx *= drag; b.vy *= drag; b.vz *= drag;

			b.x += b.vx * dt;
			b.y += b.vy * dt;
			b.z += b.vz * dt;

			b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
			b.wx *= drag; b.wy *= drag; b.wz *= drag;

			const floor = b.restY + 0.02;
			if ( b.y <= floor ) {

				b.y = floor;
				if ( Math.abs( b.vy ) < 0.35 ) {

					b.settled = true;
					// Lie flat on the bottom.
					b.rx = Math.PI / 2 + ( Math.random() - 0.5 ) * 0.5;
					b.vx = b.vy = b.vz = 0;

				} else {

					b.vy = - b.vy * 0.28;
					b.vx *= 0.6; b.vz *= 0.6;

				}

			}

		}

		this._writeInstances();

	}

	_writeInstances() {

		let coinIdx = 0, gemIdx = 0;

		for ( const b of this.bodies ) {

			this._pos.set( b.x, b.y, b.z );
			this._euler.set( b.rx, b.ry, b.rz );
			this._quat.setFromEuler( this._euler );
			this._scl.setScalar( b.scale );
			this._matrix.compose( this._pos, this._quat, this._scl );

			if ( b.kind === 'coin' ) this.coins.setMatrixAt( coinIdx ++, this._matrix );
			else this.gems.setMatrixAt( gemIdx ++, this._matrix );

		}

		this.coins.instanceMatrix.needsUpdate = true;
		this.gems.instanceMatrix.needsUpdate = true;

	}

}

import * as THREE from 'three/webgpu';
import {
	Fn, If, Loop, Continue, uint, float, vec3, vec4, uniform, instancedArray,
	instanceIndex, attribute, positionLocal, normalize, length, dot, cross, sin,
	cos, max, min, abs, clamp, mix, smoothstep, pow, sqrt, transformNormalToView,
} from 'three/tsl';

import { uTime } from '../render/frame.js';

/**
 * GPU flocking (DESIGN §7.1).
 *
 * Adapted from three's `webgpu_compute_birds`: `instancedArray` storage for
 * position / velocity / phase, a velocity pass implementing separation,
 * alignment and cohesion, a position integrator, and an `InstancedMesh` whose
 * shader reads those buffers back in the vertex stage.
 *
 * Two deliberate departures from the reference:
 *
 *  1. **One flock per school, not one global flock.** The reference loops all
 *     8192 birds against each other — O(N²) = 67 M iterations per frame. Six
 *     schools of ~500 interacting only within themselves is 1.5 M, a ~45x
 *     reduction, and it hands us per-species parameters for free.
 *  2. **Lit, fogged and shadowed.** The reference drives `vertexNode` directly,
 *     which bypasses three's lighting. We use `positionNode` + `normalNode`
 *     with identity instance matrices instead, so fish get the scene's water
 *     extinction and lighting like everything else.
 *
 * Animation is a travelling sine down the body (`bodyT`), amplitude growing
 * toward the tail — actual undulation rather than the reference's two-vertex
 * wing flap.
 */

export class Flock {

	/**
	 * @param {object} opts
	 * @param {number} opts.count
	 * @param {THREE.BufferGeometry} opts.geometry  must carry a `bodyT` attribute
	 * @param {THREE.Vector3} opts.home             centre of the school's territory
	 * @param {THREE.Vector3} opts.extent           half-size of that territory
	 */
	constructor( {
		count = 400,
		geometry,
		home = new THREE.Vector3( 0, - 14, 0 ),
		extent = new THREE.Vector3( 26, 5, 26 ),
		speed = 2.2,
		separation = 0.85,
		alignment = 2.4,
		cohesion = 3.6,
		neighbourRadius = 4.0,
		colorA = 0x3f7fa8,
		colorB = 0xa8d8e8,
		bellyColor = 0xf0f4f2,
		scale = 1,
		scaleVariance = 0.3,
		undulation = 1.0,
		fleeRadius = 6.0,
		name = 'school',
	} = {} ) {

		this.count = count;
		this.name = name;

		// ---- storage ------------------------------------------------------
		const positions = new Float32Array( count * 3 );
		const velocities = new Float32Array( count * 3 );
		const phases = new Float32Array( count );
		const scales = new Float32Array( count );

		for ( let i = 0; i < count; i ++ ) {

			positions[ i * 3 + 0 ] = home.x + ( Math.random() - 0.5 ) * extent.x;
			positions[ i * 3 + 1 ] = home.y + ( Math.random() - 0.5 ) * extent.y;
			positions[ i * 3 + 2 ] = home.z + ( Math.random() - 0.5 ) * extent.z;

			const a = Math.random() * Math.PI * 2;
			velocities[ i * 3 + 0 ] = Math.cos( a ) * speed;
			velocities[ i * 3 + 1 ] = ( Math.random() - 0.5 ) * 0.3;
			velocities[ i * 3 + 2 ] = Math.sin( a ) * speed;

			phases[ i ] = Math.random() * Math.PI * 2;
			scales[ i ] = scale * ( 1 + ( Math.random() - 0.5 ) * scaleVariance );

		}

		this.positionStorage = instancedArray( positions, 'vec3' ).setName( `${name}Position` );
		this.velocityStorage = instancedArray( velocities, 'vec3' ).setName( `${name}Velocity` );
		this.phaseStorage = instancedArray( phases, 'float' ).setName( `${name}Phase` );

		// ---- uniforms -----------------------------------------------------
		this.u = {
			deltaTime: uniform( 0 ),
			home: uniform( home.clone() ),
			extent: uniform( extent.clone() ),
			playerPos: uniform( new THREE.Vector3() ),
			separation: uniform( separation ),
			alignment: uniform( alignment ),
			cohesion: uniform( cohesion ),
			neighbourRadius: uniform( neighbourRadius ),
			speed: uniform( speed ),
			fleeRadius: uniform( fleeRadius ),
		};

		this._buildCompute();
		this._buildMesh( geometry, scales, { colorA, colorB, bellyColor, undulation } );

	}

	_buildCompute() {

		const { positionStorage, velocityStorage, phaseStorage, u, count } = this;

		this.computeVelocity = Fn( () => {

			const self = instanceIndex.toConst( 'selfIndex' );
			const pos = positionStorage.element( self ).toVar();
			const vel = velocityStorage.element( self ).toVar();

			const radius = u.neighbourRadius;
			const radiusSq = radius.mul( radius ).toConst();

			const sep = vec3( 0 ).toVar();
			const ali = vec3( 0 ).toVar();
			const coh = vec3( 0 ).toVar();
			const neighbours = float( 0 ).toVar();

			Loop( { start: uint( 0 ), end: uint( count ), type: 'uint', condition: '<' }, ( { i } ) => {

				If( i.equal( self ), () => { Continue(); } );

				const other = positionStorage.element( i );
				const delta = other.sub( pos );
				const distSq = dot( delta, delta );

				If( distSq.greaterThan( radiusSq ).or( distSq.lessThan( 0.0001 ) ), () => { Continue(); } );

				const dist = sqrt( distSq );

				// Separation weighted by 1/d², floored so a near-coincident pair
				// cannot contribute an unbounded term.
				sep.subAssign( delta.div( max( distSq, float( 0.25 ) ) ) );
				ali.addAssign( velocityStorage.element( i ) );
				coh.addAssign( other );
				neighbours.addAssign( 1 );

			} );

			// ---- steering, not forces ------------------------------------
			//
			// An earlier version accumulated raw forces into the velocity. That
			// is the classic unstable boids formulation: the territory spring
			// grows with distance, so one fish that strays gets a huge impulse,
			// overshoots further, and the whole school detonates — measured
			// spread was ±77 m from a 9 m home box, in every axis.
			//
			// Instead every rule contributes a *direction*, they are summed and
			// normalised, and the result is a desired velocity capped at cruise
			// speed which the fish turns toward. Bounded by construction: no
			// combination of inputs can produce a velocity above cruise speed,
			// so it cannot diverge no matter how the weights are tuned.
			const desired = vec3( 0 ).toVar();

			If( neighbours.greaterThan( 0 ), () => {

				// Separation: away from the crowded side.
				//
				// Scaled by how crowded it actually is, not just direction.
				// Normalising every rule made the weights directly comparable,
				// and a constant-magnitude separation simply loses to cohesion —
				// the school collapsed to a single point (all 420 fish at the
				// same coordinate). `sep` already grows as 1/d², so keeping a
				// clamped version of its magnitude restores "push harder when
				// crowded" while staying bounded.
				const crowding = clamp( length( sep ), 0, 4 );
				desired.addAssign( normalize( sep.add( vec3( 0.0001, 0, 0 ) ) ).mul( u.separation ).mul( crowding ) );
				// Alignment: swim with the neighbours.
				desired.addAssign( normalize( ali.div( neighbours ).add( vec3( 0.0001, 0, 0 ) ) ).mul( u.alignment ) );
				// Cohesion: toward the local centre of mass.
				desired.addAssign( normalize( coh.div( neighbours ).sub( pos ).add( vec3( 0.0001, 0, 0 ) ) ).mul( u.cohesion ) );

			} );

			// Return to the school's territory. Strength saturates at 1, so a
			// fish 200 m away pulls no harder than one 20 m away — it simply
			// keeps pulling until it is home.
			const offset = pos.sub( u.home ).div( u.extent );
			const outside = clamp( length( offset ).sub( 0.5 ), 0, 1 );
			desired.subAssign( normalize( offset.add( vec3( 0.0001, 0, 0 ) ) ).mul( outside ).mul( 9 ) );

			// Flee the player (PRD P4 — fish must part around you).
			const toPlayer = u.playerPos.sub( pos );
			const playerDist = length( toPlayer ).max( 0.001 );
			const flee = clamp( u.fleeRadius.sub( playerDist ).div( u.fleeRadius.max( 0.001 ) ), 0, 1 );
			desired.subAssign( toPlayer.div( playerDist ).mul( flee ).mul( 14 ) );

			// Keep clear of the surface and of the deep floor.
			desired.y.subAssign( smoothstep( float( - 2.5 ), float( - 0.5 ), pos.y ).mul( 6 ) );

			// Normalise to cruise speed and turn toward it. `mix` with a clamped
			// factor is what bounds the whole system.
			const target = normalize( desired.add( vec3( 0.0001, 0.0001, 0.0001 ) ) ).mul( u.speed );
			vel.assign( mix( vel, target, clamp( u.deltaTime.mul( 3.0 ), 0, 1 ) ) );

			// Belt and braces: hard-clamp speed so a pathological frame cannot
			// translate into a teleport.
			const sp = length( vel ).max( 0.0001 );
			vel.assign( vel.div( sp ).mul( min( sp, u.speed.mul( 1.6 ) ) ) );

			velocityStorage.element( self ).assign( vel );

		} )().compute( count ).setName( `${this.name}Velocity` );

		this.computePosition = Fn( () => {

			const vel = velocityStorage.element( instanceIndex );
			positionStorage.element( instanceIndex ).addAssign( vel.mul( u.deltaTime ) );

			// Tail beat scales with speed — faster fish beat faster.
			const beat = length( vel ).mul( u.deltaTime ).mul( 3.2 ).add( u.deltaTime.mul( 2.0 ) );
			phaseStorage.element( instanceIndex ).assign(
				phaseStorage.element( instanceIndex ).add( beat ).mod( 6.2831853 )
			);

		} )().compute( count ).setName( `${this.name}Position` );

	}

	_buildMesh( geometry, scales, { colorA, colorB, bellyColor, undulation } ) {

		const { positionStorage, velocityStorage, phaseStorage } = this;

		const material = new THREE.MeshStandardNodeMaterial( {
			roughness: 0.55,
			metalness: 0.05,
			side: THREE.DoubleSide,
		} );

		const bodyT = attribute( 'bodyT', 'float' );
		const iScale = attribute( 'iScale', 'float' );
		const iTint = attribute( 'iTint', 'float' );

		const uColorA = uniform( new THREE.Color( colorA ) );
		const uColorB = uniform( new THREE.Color( colorB ) );
		const uBelly = uniform( new THREE.Color( bellyColor ) );
		const uUndulation = float( undulation );

		/** Orthonormal basis from the swim direction. */
		const basis = () => {

			const vel = velocityStorage.element( instanceIndex );
			const fwd = normalize( vel.add( vec3( 0.0001, 0, 0.0001 ) ) ).toVar();
			// Guard the degenerate case where the fish swims straight up.
			const ref = vec3( 0, 1, 0 );
			const right = normalize( cross( ref, fwd ).add( vec3( 0.0001, 0, 0 ) ) ).toVar();
			const up = cross( fwd, right ).toVar();
			return { fwd, right, up };

		};

		material.positionNode = Fn( () => {

			const p = positionLocal.mul( iScale ).toVar();
			const phase = phaseStorage.element( instanceIndex );

			// Travelling sine down the body; amplitude grows toward the tail.
			const t = clamp( bodyT, 0, 1 );
			const wave = sin( phase.sub( t.mul( 4.6 ) ) ).mul( t ).mul( t ).mul( uUndulation ).mul( 0.10 );
			p.x = p.x.add( wave.mul( iScale ) );

			const { fwd, right, up } = basis();
			const rotated = right.mul( p.x ).add( up.mul( p.y ) ).add( fwd.mul( p.z ) );

			return rotated.add( positionStorage.element( instanceIndex ) );

		} )();

		material.normalNode = Fn( () => {

			const n = normalize( positionLocal ).toVar();   // adequate for convex bodies
			const { fwd, right, up } = basis();
			const world = right.mul( n.x ).add( up.mul( n.y ) ).add( fwd.mul( n.z ) );
			return transformNormalToView( normalize( world ) );

		} )();

		material.colorNode = Fn( () => {

			// Countershading: dark back, pale belly. Every reef fish has it and
			// its absence is what makes cheap fish look like toys.
			const belly = smoothstep( float( 0.0 ), float( - 0.35 ), normalize( positionLocal ).y );
			const base = mix( uColorA, uColorB, clamp( iTint, 0, 1 ) );
			const shaded = mix( base, uBelly, belly.mul( 0.75 ) );

			// Faint banding along the body.
			const band = sin( bodyT.mul( 22 ) ).mul( 0.5 ).add( 0.5 ).mul( 0.12 ).add( 0.94 );

			return vec4( shaded.mul( band ), 1 );

		} )();

		// An emissive floor so fish read as coloured, not as silhouettes.
		//
		// Sunlight arrives from above and fish are seen mostly side-on, so pure
		// diffuse shading leaves a yellow tang looking like a dark brown flake.
		// Real fish are also strongly counter-lit by light scattered up off the
		// sand. A fraction of albedo as emissive is the cheap stand-in, and it
		// is what makes a school read as colour rather than as debris.
		material.emissiveNode = Fn( () => {

			const belly = smoothstep( float( 0.0 ), float( - 0.35 ), normalize( positionLocal ).y );
			const base = mix( uColorA, uColorB, clamp( iTint, 0, 1 ) );
			return mix( base, uBelly, belly.mul( 0.75 ) ).mul( 0.42 );

		} )();

		const mesh = new THREE.InstancedMesh( geometry, material, this.count );
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		mesh.name = `flock:${this.name}`;

		// Identity instance matrices: placement comes entirely from the storage
		// buffers in the vertex shader.
		const identity = new THREE.Matrix4();
		for ( let i = 0; i < this.count; i ++ ) mesh.setMatrixAt( i, identity );
		mesh.instanceMatrix.needsUpdate = true;

		const tints = new Float32Array( this.count );
		for ( let i = 0; i < this.count; i ++ ) tints[ i ] = Math.random();
		geometry.setAttribute( 'iScale', new THREE.InstancedBufferAttribute( scales, 1 ) );
		geometry.setAttribute( 'iTint', new THREE.InstancedBufferAttribute( tints, 1 ) );

		this.mesh = mesh;
		this.material = material;

	}

	update( renderer, dt, playerPosition ) {

		// Cap the step: a tab-switch delta would fling the whole school out of
		// its territory in one frame.
		this.u.deltaTime.value = Math.min( dt, 0.05 );
		this.u.playerPos.value.copy( playerPosition );

		renderer.compute( this.computeVelocity );
		renderer.compute( this.computePosition );

	}

}

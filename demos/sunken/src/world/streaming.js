import * as THREE from 'three/webgpu';
import { WORLD } from './field.js';
import { MesherPool } from './workerPool.js';

/**
 * Streaming terrain.
 *
 * The world is infinite in X and Z, so chunks are meshed on demand around the
 * player and disposed once they fall out of range — the Minecraft model.
 *
 * Two things make this behave rather than thrash:
 *
 *  1. **Hysteresis.** Chunks load at `radius` and are only disposed past
 *     `radius + 2`. Without a gap, standing exactly on a boundary makes the
 *     ring of chunks at that distance load and unload forever.
 *  2. **Nearest first, with a cap on work in flight.** The queue is re-sorted
 *     by distance to the player every update, so walking in a new direction
 *     re-prioritises immediately instead of finishing a stale queue first.
 *
 * Vertical extent is fixed: an ocean world has a seabed and a sky, and neither
 * moves, so only XZ streams.
 */

const CHUNK_VOXELS = 40;

export class StreamingTerrain {

	constructor( scene, material, {
		voxel = 0.6,
		radius = 6,
		onLoad = null,
		onUnload = null,
	} = {} ) {

		this.scene = scene;
		this.material = material;
		this.voxel = voxel;
		this.chunkSize = CHUNK_VOXELS * voxel;
		this.radius = radius;
		this.disposeRadius = radius + 2;
		this.onLoad = onLoad;
		this.onUnload = onUnload;

		this.group = new THREE.Group();
		this.group.name = 'terrain';
		scene.add( this.group );

		this.layers = Math.ceil( ( WORLD.yMax - WORLD.yMin ) / this.chunkSize );

		this.chunks = new Map();      // key -> { meshes: [], loading: bool }
		this.queue = [];
		this.inFlight = 0;
		this.maxInFlight = 0;         // set once the pool exists

		// Fewer workers than boot-time meshing would use: during play the main
		// thread is rendering at 60 fps, and 12 meshing workers competing for
		// cores dropped frame rate to 46 while crossing into new terrain.
		// Latency matters less than smoothness once the game is running —
		// chunks arrive at the edge of visibility anyway.
		this.pool = new MesherPool( 4 );
		this.maxInFlight = Math.max( 2, this.pool.size );

		this.stats = { loaded: 0, queued: 0, triangles: 0, vertices: 0, built: 0, empty: 0 };

		this._lastCx = null;
		this._lastCz = null;

	}

	_key( cx, cz ) {

		return `${cx},${cz}`;

	}

	/** Column of chunks (all vertical layers) at chunk coords cx, cz. */
	_specsFor( cx, cz ) {

		const s = this.chunkSize;
		const specs = [];
		for ( let iy = 0; iy < this.layers; iy ++ ) {

			specs.push( {
				ox: cx * s,
				oy: WORLD.yMin + iy * s,
				oz: cz * s,
				dims: CHUNK_VOXELS,
				voxel: this.voxel,
			} );

		}

		return specs;

	}

	/**
	 * Bring the loaded set in line with the player's position.
	 * Cheap to call every frame: it early-outs unless the player changed chunk.
	 */
	update( playerX, playerZ, { force = false } = {} ) {

		const s = this.chunkSize;
		const cx = Math.floor( playerX / s );
		const cz = Math.floor( playerZ / s );

		if ( ! force && cx === this._lastCx && cz === this._lastCz ) {

			this._drain();
			return;

		}

		this._lastCx = cx;
		this._lastCz = cz;

		// ---- enqueue anything newly in range -----------------------------
		const wanted = [];
		for ( let dx = - this.radius; dx <= this.radius; dx ++ ) {

			for ( let dz = - this.radius; dz <= this.radius; dz ++ ) {

				const d2 = dx * dx + dz * dz;
				if ( d2 > this.radius * this.radius ) continue;   // circular, not square
				wanted.push( { cx: cx + dx, cz: cz + dz, d2 } );

			}

		}

		for ( const w of wanted ) {

			const key = this._key( w.cx, w.cz );
			if ( this.chunks.has( key ) ) continue;
			this.chunks.set( key, { meshes: [], loading: true, cx: w.cx, cz: w.cz } );
			this.queue.push( w );

		}

		// ---- drop anything far away --------------------------------------
		for ( const [ key, entry ] of this.chunks ) {

			const dx = entry.cx - cx, dz = entry.cz - cz;
			if ( dx * dx + dz * dz <= this.disposeRadius * this.disposeRadius ) continue;
			this._dispose( key, entry );

		}

		// Re-prioritise: turning around should not wait out a stale queue.
		this.queue.sort( ( a, b ) => {

			const da = ( a.cx - cx ) ** 2 + ( a.cz - cz ) ** 2;
			const db = ( b.cx - cx ) ** 2 + ( b.cz - cz ) ** 2;
			return da - db;

		} );

		this._drain();

	}

	_drain() {

		while ( this.inFlight < this.maxInFlight && this.queue.length > 0 ) {

			const job = this.queue.shift();
			const key = this._key( job.cx, job.cz );
			const entry = this.chunks.get( key );
			// It may have been disposed while queued.
			if ( entry === undefined ) continue;

			this.inFlight ++;
			this._build( key, entry, job );

		}

		this.stats.queued = this.queue.length;

	}

	async _build( key, entry, job ) {

		const specs = this._specsFor( job.cx, job.cz );

		try {

			const results = await Promise.all( specs.map( ( spec ) => this.pool.mesh( spec ) ) );

			// Disposed while we were meshing — throw the work away rather than
			// adding orphaned meshes to the scene.
			if ( ! this.chunks.has( key ) ) return;

			for ( let i = 0; i < results.length; i ++ ) {

				const result = results[ i ];
				if ( result === null ) { this.stats.empty ++; continue; }
				entry.meshes.push( this._mesh( specs[ i ], result ) );

			}

			entry.loading = false;
			this.stats.loaded ++;
			this.stats.built ++;

			this.onLoad?.( job.cx, job.cz, this.chunkSize, entry );

		} catch ( err ) {

			console.error( '[terrain] chunk failed', key, err );
			this.chunks.delete( key );

		} finally {

			this.inFlight --;
			this._drain();

		}

	}

	_mesh( spec, result ) {

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( result.positions, 3 ) );
		geometry.setAttribute( 'normal', new THREE.BufferAttribute( result.normals, 3 ) );
		geometry.setAttribute( 'sky', new THREE.BufferAttribute( result.sky, 1 ) );
		geometry.setIndex( new THREE.BufferAttribute( result.indices, 1 ) );

		const s = this.chunkSize;
		geometry.boundingBox = new THREE.Box3(
			new THREE.Vector3( spec.ox, spec.oy, spec.oz ),
			new THREE.Vector3( spec.ox + s, spec.oy + s, spec.oz + s ),
		);
		geometry.boundingSphere = new THREE.Sphere(
			new THREE.Vector3( spec.ox + s / 2, spec.oy + s / 2, spec.oz + s / 2 ),
			s * 0.87,
		);

		const mesh = new THREE.Mesh( geometry, this.material );
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.matrixAutoUpdate = false;
		mesh.updateMatrix();

		this.group.add( mesh );

		this.stats.vertices += result.vertexCount;
		this.stats.triangles += result.triangleCount;

		return mesh;

	}

	_dispose( key, entry ) {

		for ( const mesh of entry.meshes ) {

			this.group.remove( mesh );
			this.stats.vertices -= mesh.geometry.getAttribute( 'position' ).count;
			this.stats.triangles -= mesh.geometry.getIndex().count / 3;
			mesh.geometry.dispose();

		}

		this.chunks.delete( key );
		if ( ! entry.loading ) this.stats.loaded --;
		this.onUnload?.( entry.cx, entry.cz, entry );

	}

	/** Wait until every chunk currently in range has finished meshing. */
	async settle() {

		while ( this.inFlight > 0 || this.queue.length > 0 ) {

			await new Promise( ( r ) => setTimeout( r, 30 ) );

		}

	}

	dispose() {

		this.pool.dispose();

	}

}

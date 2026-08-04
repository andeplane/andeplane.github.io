import * as THREE from 'three/webgpu';
import { WORLD } from './field.js';
import { MesherPool } from './workerPool.js';

/**
 * Chunked terrain build (DESIGN §3.2).
 *
 * 40³-voxel chunks over the whole volume, meshed in parallel, each becoming one
 * frustum-cullable Mesh. Empty chunks are rejected inside the worker before any
 * 3D noise is touched.
 */

const CHUNK_VOXELS = 40;

export class Terrain {

	constructor( scene, material, voxel = 0.6 ) {

		this.scene = scene;
		this.material = material;
		this.voxel = voxel;
		this.chunkSize = CHUNK_VOXELS * voxel;
		this.group = new THREE.Group();
		this.group.name = 'terrain';
		scene.add( this.group );

		this.meshes = [];
		this.stats = { chunks: 0, meshed: 0, empty: 0, vertices: 0, triangles: 0 };

	}

	_specs() {

		const s = this.chunkSize;
		const specs = [];

		const nx = Math.ceil( ( WORLD.half * 2 ) / s );
		const nz = Math.ceil( ( WORLD.half * 2 ) / s );
		const ny = Math.ceil( ( WORLD.yMax - WORLD.yMin ) / s );

		for ( let iy = 0; iy < ny; iy ++ ) {

			for ( let iz = 0; iz < nz; iz ++ ) {

				for ( let ix = 0; ix < nx; ix ++ ) {

					specs.push( {
						ox: - WORLD.half + ix * s,
						oy: WORLD.yMin + iy * s,
						oz: - WORLD.half + iz * s,
						dims: CHUNK_VOXELS,
						voxel: this.voxel,
					} );

				}

			}

		}

		return specs;

	}

	/** Build the whole world. `onProgress(done, total)` drives the loading bar. */
	async build( onProgress ) {

		const pool = new MesherPool();
		const specs = this._specs();
		this.stats.chunks = specs.length;

		let done = 0;

		// Order chunks so the ones near the player's spawn finish first; the
		// loading bar then correlates with what you will actually see.
		specs.sort( ( a, b ) => ( a.ox * a.ox + a.oz * a.oz ) - ( b.ox * b.ox + b.oz * b.oz ) );

		await Promise.all( specs.map( ( spec ) =>
			pool.mesh( spec ).then( ( result ) => {

				done ++;
				onProgress?.( done, specs.length );

				if ( result === null ) {

					this.stats.empty ++;
					return;

				}

				this._addChunk( spec, result );

			} ).catch( ( err ) => {

				done ++;
				console.error( '[terrain] chunk failed', spec, err );

			} )
		) );

		pool.dispose();
		return this.stats;

	}

	_addChunk( spec, result ) {

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
		this.meshes.push( mesh );

		this.stats.meshed ++;
		this.stats.vertices += result.vertexCount;
		this.stats.triangles += result.triangleCount;

	}

}

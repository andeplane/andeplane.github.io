/**
 * Marching cubes over the density field (DESIGN §3.2).
 *
 * Uniform 0.6 m voxels, no LOD — LOD stitching across an MC volume is a classic
 * source of cracks and at 300 m we do not need it. Chunks sample the field at
 * globally-aligned grid positions, so two neighbouring chunks compute bitwise
 * identical vertices on their shared face and the world is watertight without
 * any cross-chunk welding.
 *
 * Two optimisations here are load-bearing, both found by profiling
 * (`npm run world -- --mesh`) rather than guessed:
 *
 *  1. The density grid is sampled with a one-voxel border so vertex normals can
 *     come from central differences on data we already have. Calling
 *     `fieldGradient` per vertex instead costs 4.6 µs each — about 7 s of the
 *     world build.
 *  2. The sky-visibility ray is vertical, so the column height is constant
 *     along it. Passing it in turns ~29 full field evaluations per vertex into
 *     ~29 early-outs; `heightAt` alone is 586 ns and was ~26 s of the build.
 */

import { edgeTable, triTable } from './mcTables.js';
import { field, heightAt, skyVisibilityAt, WORLD } from './field.js';

// Paul Bourke's cube corner ordering (the tables assume exactly this).
const CORNER = [
	[ 0, 0, 0 ], [ 1, 0, 0 ], [ 1, 0, 1 ], [ 0, 0, 1 ],
	[ 0, 1, 0 ], [ 1, 1, 0 ], [ 1, 1, 1 ], [ 0, 1, 1 ],
];

const EDGE_A = [ 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3 ];
const EDGE_B = [ 1, 2, 3, 0, 5, 6, 7, 4, 4, 5, 6, 7 ];

// Which grid corner "owns" each MC edge, and along which axis it runs.
// axis 0 = +X, 1 = +Y, 2 = +Z
const EDGE_OWNER = [
	[ 0, 0, 0, 0 ], [ 1, 0, 0, 2 ], [ 0, 0, 1, 0 ], [ 0, 0, 0, 2 ],
	[ 0, 1, 0, 0 ], [ 1, 1, 0, 2 ], [ 0, 1, 1, 0 ], [ 0, 1, 0, 2 ],
	[ 0, 0, 0, 1 ], [ 1, 0, 0, 1 ], [ 1, 0, 1, 1 ], [ 0, 0, 1, 1 ],
];

/**
 * Mesh one chunk.
 *
 * @param {object} spec  { ox, oy, oz, dims, voxel } — world-space min corner
 * @returns {object|null} geometry arrays, or null if the chunk holds no surface
 */
export function meshChunk( spec ) {

	const { ox, oy, oz, dims, voxel } = spec;

	// Grid indices run [-1 .. dims+1]; the extra ring is only for gradients.
	const m = dims + 3;
	const gi = ( ix, iy, iz ) => ( ( iy + 1 ) * m + ( iz + 1 ) ) * m + ( ix + 1 );

	// ---- 1. sample the density grid -------------------------------------
	const grid = new Float32Array( m * m * m );
	const heights = new Float32Array( m * m );   // indexed [iz+1][ix+1]

	for ( let iz = - 1; iz <= dims + 1; iz ++ ) {

		const z = oz + iz * voxel;
		for ( let ix = - 1; ix <= dims + 1; ix ++ ) {

			heights[ ( iz + 1 ) * m + ( ix + 1 ) ] = heightAt( ox + ix * voxel, z );

		}

	}

	// Cheap rejection before any 3D noise: if the chunk is entirely above the
	// highest terrain, or far below the deepest possible carve, there is
	// nothing here.
	{
		let hMin = Infinity, hMax = - Infinity;
		for ( let i = 0; i < heights.length; i ++ ) {

			const h = heights[ i ];
			if ( h < hMin ) hMin = h;
			if ( h > hMax ) hMax = h;

		}

		if ( oy > hMax + 1 || oy + dims * voxel < hMin - 34 ) return null;

	}

	let anyPos = false, anyNeg = false;

	for ( let iy = - 1; iy <= dims + 1; iy ++ ) {

		const y = oy + iy * voxel;
		for ( let iz = - 1; iz <= dims + 1; iz ++ ) {

			const z = oz + iz * voxel;
			const hRow = ( iz + 1 ) * m;
			const gRow = ( ( iy + 1 ) * m + ( iz + 1 ) ) * m;
			for ( let ix = - 1; ix <= dims + 1; ix ++ ) {

				const v = field( ox + ix * voxel, y, z, heights[ hRow + ( ix + 1 ) ] );
				grid[ gRow + ( ix + 1 ) ] = v;
				if ( v > 0 ) anyPos = true; else anyNeg = true;

			}

		}

	}

	if ( ! anyPos || ! anyNeg ) return null; // no sign change → no surface

	// ---- 2. marching cubes ----------------------------------------------
	const positions = [];
	const normals = [];
	const indices = [];
	const columnH = [];  // column height per vertex, reused by the sky bake

	const edgeVerts = new Map();
	const at = ( ix, iy, iz ) => grid[ gi( ix, iy, iz ) ];

	// Central-difference gradient on the sampled grid. The border ring exists
	// precisely so this never needs a field() call.
	const gradAt = ( ix, iy, iz, out ) => {

		out[ 0 ] = at( ix + 1, iy, iz ) - at( ix - 1, iy, iz );
		out[ 1 ] = at( ix, iy + 1, iz ) - at( ix, iy - 1, iz );
		out[ 2 ] = at( ix, iy, iz + 1 ) - at( ix, iy, iz - 1 );

	};

	const gA = [ 0, 0, 0 ], gB = [ 0, 0, 0 ];

	const vertOnEdge = ( ix, iy, iz, edge ) => {

		const own = EDGE_OWNER[ edge ];
		const cx = ix + own[ 0 ], cy = iy + own[ 1 ], cz = iz + own[ 2 ];
		const key = ( ( ( cy + 1 ) * m + ( cz + 1 ) ) * m + ( cx + 1 ) ) * 3 + own[ 3 ];

		const cached = edgeVerts.get( key );
		if ( cached !== undefined ) return cached;

		const a = CORNER[ EDGE_A[ edge ] ], b = CORNER[ EDGE_B[ edge ] ];
		const ax = ix + a[ 0 ], ay = iy + a[ 1 ], az = iz + a[ 2 ];
		const bx = ix + b[ 0 ], by = iy + b[ 1 ], bz = iz + b[ 2 ];

		const va = at( ax, ay, az );
		const vb = at( bx, by, bz );

		const denom = va - vb;
		const t = Math.abs( denom ) < 1e-9 ? 0.5 : va / denom;

		const fx = ax + ( bx - ax ) * t;
		const fy = ay + ( by - ay ) * t;
		const fz = az + ( bz - az ) * t;

		const index = positions.length / 3;
		positions.push( ox + fx * voxel, oy + fy * voxel, oz + fz * voxel );

		// Interpolate the two endpoint gradients — smooth, and free.
		gradAt( ax, ay, az, gA );
		gradAt( bx, by, bz, gB );
		let nx = gA[ 0 ] + ( gB[ 0 ] - gA[ 0 ] ) * t;
		let ny = gA[ 1 ] + ( gB[ 1 ] - gA[ 1 ] ) * t;
		let nz = gA[ 2 ] + ( gB[ 2 ] - gA[ 2 ] ) * t;
		const len = Math.hypot( nx, ny, nz ) || 1;
		// Outward = away from rock = -gradient.
		normals.push( - nx / len, - ny / len, - nz / len );

		// Bilinear column height at the vertex, for the sky bake.
		const h00 = heights[ ( az + 1 ) * m + ( ax + 1 ) ];
		const h11 = heights[ ( bz + 1 ) * m + ( bx + 1 ) ];
		columnH.push( h00 + ( h11 - h00 ) * t );

		edgeVerts.set( key, index );
		return index;

	};

	for ( let iy = 0; iy < dims; iy ++ ) {

		for ( let iz = 0; iz < dims; iz ++ ) {

			for ( let ix = 0; ix < dims; ix ++ ) {

				let cubeIndex = 0;
				for ( let c = 0; c < 8; c ++ ) {

					const o = CORNER[ c ];
					// Bourke's tables treat "below isolevel" as INSIDE the
					// surface. Our field is positive inside rock, so the bit
					// must be set for rock corners (equivalent to feeding the
					// tables -field). Getting this backwards silently produces
					// correct-looking geometry with inverted winding.
					if ( at( ix + o[ 0 ], iy + o[ 1 ], iz + o[ 2 ] ) > 0 ) cubeIndex |= 1 << c;

				}

				const edges = edgeTable[ cubeIndex ];
				if ( edges === 0 ) continue;

				const base = cubeIndex << 4;
				for ( let t = 0; triTable[ base + t ] !== - 1; t += 3 ) {

					indices.push(
						vertOnEdge( ix, iy, iz, triTable[ base + t ] ),
						vertOnEdge( ix, iy, iz, triTable[ base + t + 1 ] ),
						vertOnEdge( ix, iy, iz, triTable[ base + t + 2 ] ),
					);

				}

			}

		}

	}

	if ( indices.length === 0 ) return null;

	// ---- 3. bake sky visibility -----------------------------------------
	const vcount = positions.length / 3;
	const sky = new Float32Array( vcount );
	for ( let i = 0; i < vcount; i ++ ) {

		sky[ i ] = skyVisibilityAt(
			positions[ i * 3 ], positions[ i * 3 + 1 ] + 0.15, positions[ i * 3 + 2 ],
			columnH[ i ],
		);

	}

	smoothVertexScalar( sky, indices, vcount, 3 );

	return {
		positions: new Float32Array( positions ),
		normals: new Float32Array( normals ),
		sky,
		indices: vcount > 65535 ? new Uint32Array( indices ) : new Uint16Array( indices ),
		vertexCount: vcount,
		triangleCount: indices.length / 3,
	};

}

/**
 * Average a per-vertex scalar with its topological neighbours.
 *
 * This is the cheap half of REVIEW §C1: it recovers the soft, cone-like falloff
 * of a real AO bake from a single-ray sample, touching only vertices that
 * already exist.
 */
function smoothVertexScalar( values, indices, vcount, passes ) {

	const sum = new Float32Array( vcount );
	const count = new Uint16Array( vcount );

	for ( let p = 0; p < passes; p ++ ) {

		sum.fill( 0 );
		count.fill( 0 );

		for ( let i = 0; i < indices.length; i += 3 ) {

			const a = indices[ i ], b = indices[ i + 1 ], c = indices[ i + 2 ];
			sum[ a ] += values[ b ] + values[ c ]; count[ a ] += 2;
			sum[ b ] += values[ a ] + values[ c ]; count[ b ] += 2;
			sum[ c ] += values[ a ] + values[ b ]; count[ c ] += 2;

		}

		for ( let i = 0; i < vcount; i ++ ) {

			if ( count[ i ] > 0 ) {

				// Blend toward the neighbourhood mean rather than replacing, so
				// three passes soften without washing detail out entirely.
				values[ i ] = values[ i ] * 0.35 + ( sum[ i ] / count[ i ] ) * 0.65;

			}

		}

	}

}

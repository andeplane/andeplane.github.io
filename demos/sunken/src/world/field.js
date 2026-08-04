/**
 * THE DENSITY FIELD — the single source of truth for the world's shape.
 *
 * DESIGN §3.1. Terrain meshing, player collision, prop scattering, cave
 * validation and creature grounding all call `field()`. There is exactly one
 * definition, so the visible mesh and the collision geometry cannot disagree.
 *
 *   field(x, y, z)  >  0   →  solid rock
 *                   <  0   →  open water / air
 *
 * Built from layered simplex noise:
 *   L1  2D  seabed + island profile
 *   L2  2D/3D reef ridges and overhang detail
 *   L3  3D  cave carve — TWO independent noise fields, tunnels where both ≈ 0
 *   L4  SDF authored cave splines/chambers/skylights that guarantee playability
 *
 * This module is imported by BOTH the main thread (collision) and the mesher
 * workers, so it must be self-contained and deterministic from WORLD_SEED.
 */

import { createNoise2D, createNoise3D } from 'simplex-noise';
import { stream } from '../core/rng.js';

export const WORLD = {
	half: 150,          // world spans [-150, 150] on X and Z
	yMin: - 34,
	yMax: 28,
	seaLevel: 0,

	islandX: 74,
	islandZ: 48,
	islandInner: 17,    // fully island inside this radius
	islandOuter: 66,    // fully seabed outside this radius

	// Beyond this radius from the origin the player gets pushed back (PRD §4.2).
	edgeRadius: 138,
};

/**
 * Cost control (DESIGN §3.1). Two separate gates:
 *
 *  WATER_BAND — more than this far *above* the rock we are trivially in open
 *               water and no 3D work is needed.
 *  ROCK_BAND  — more than this far *below* the rock surface, nothing carves:
 *               noise caves are faded out before here and the authored splines
 *               are all anchored near the surface. An earlier version used one
 *               13 m band for both, which silently prevented any cave from
 *               forming under more than 13 m of rock — i.e. exactly the deep
 *               cave systems the game is about.
 */
const WATER_BAND = 12;
const ROCK_BAND = 22;

let N = null; // noise + primitives, built once per thread

function smoothstep( a, b, x ) {

	const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

}

function fbm2( noise, x, z, octaves, freq, lacunarity = 2, gain = 0.5 ) {

	let amp = 1, f = freq, sum = 0, norm = 0;
	for ( let i = 0; i < octaves; i ++ ) {

		sum += amp * noise( x * f, z * f );
		norm += amp;
		amp *= gain; f *= lacunarity;

	}

	return sum / norm;

}

function fbm3( noise, x, y, z, octaves, freq, lacunarity = 2, gain = 0.5 ) {

	let amp = 1, f = freq, sum = 0, norm = 0;
	for ( let i = 0; i < octaves; i ++ ) {

		sum += amp * noise( x * f, y * f, z * f );
		norm += amp;
		amp *= gain; f *= lacunarity;

	}

	return sum / norm;

}

/* -------------------------------------------------------------------------- */
/* Cave primitives (L4)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Broadphase for authored cave primitives.
 *
 * Naively testing every capsule per voxel would cost ~800M distance
 * computations over the full volume. Primitives are bucketed into a coarse XZ
 * grid so a voxel column only tests the handful that can reach it — most
 * columns test none at all.
 */
class PrimitiveGrid {

	constructor( cell = 12 ) {

		this.cell = cell;
		this.buckets = new Map();

	}

	_key( ix, iz ) {

		return ix * 100003 + iz;

	}

	insert( prim ) {

		const { minX, maxX, minZ, maxZ } = prim.bounds;
		const c = this.cell;
		for ( let ix = Math.floor( minX / c ); ix <= Math.floor( maxX / c ); ix ++ ) {

			for ( let iz = Math.floor( minZ / c ); iz <= Math.floor( maxZ / c ); iz ++ ) {

				const k = this._key( ix, iz );
				let b = this.buckets.get( k );
				if ( b === undefined ) this.buckets.set( k, b = [] );
				b.push( prim );

			}

		}

	}

	at( x, z ) {

		return this.buckets.get( this._key( Math.floor( x / this.cell ), Math.floor( z / this.cell ) ) );

	}

}

/** Capsule: positive inside. */
function capsuleValue( p, x, y, z ) {

	const ax = x - p.ax, ay = y - p.ay, az = z - p.az;
	const bx = p.bx - p.ax, by = p.by - p.ay, bz = p.bz - p.az;
	const bb = bx * bx + by * by + bz * bz;
	let t = bb > 0 ? ( ax * bx + ay * by + az * bz ) / bb : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	const dx = ax - bx * t, dy = ay - by * t, dz = az - bz * t;
	const d = Math.sqrt( dx * dx + dy * dy + dz * dz );
	// Radius eases along the capsule so tunnels swell and pinch.
	const r = p.r0 + ( p.r1 - p.r0 ) * t;
	return r - d;

}

/** Ellipsoid chamber: positive inside. */
function chamberValue( p, x, y, z ) {

	const dx = ( x - p.cx ) / p.rx, dy = ( y - p.cy ) / p.ry, dz = ( z - p.cz ) / p.rz;
	const d = Math.sqrt( dx * dx + dy * dy + dz * dz );
	return ( 1 - d ) * p.scale;

}

function primValue( p, x, y, z ) {

	return p.kind === 0 ? capsuleValue( p, x, y, z ) : chamberValue( p, x, y, z );

}

function capsuleBounds( p ) {

	const r = Math.max( p.r0, p.r1 ) + 2;
	return {
		minX: Math.min( p.ax, p.bx ) - r, maxX: Math.max( p.ax, p.bx ) + r,
		minY: Math.min( p.ay, p.by ) - r, maxY: Math.max( p.ay, p.by ) + r,
		minZ: Math.min( p.az, p.bz ) - r, maxZ: Math.max( p.az, p.bz ) + r,
	};

}

/* -------------------------------------------------------------------------- */
/* Initialisation                                                             */
/* -------------------------------------------------------------------------- */

function buildNoise() {

	const rt = stream( 'terrain' );
	const rc = stream( 'cave-noise' );

	return {
		seabed: createNoise2D( rt ),
		seabedB: createNoise2D( rt ),
		island: createNoise2D( rt ),
		islandB: createNoise2D( rt ),
		reef: createNoise2D( rt ),
		bommie: createNoise2D( rt ),
		detail3: createNoise3D( rt ),
		caveA: createNoise3D( rc ),
		caveB: createNoise3D( rc ),
		caveWarp: createNoise3D( rc ),
	};

}

/** Height of the rock surface, ignoring caves and 3D detail. */
export function heightAt( x, z ) {

	const n = N.noise;

	const r = Math.hypot( x - WORLD.islandX, z - WORLD.islandZ );
	const mask = smoothstep( WORLD.islandOuter, WORLD.islandInner, r );

	// L1a — offshore seabed, −28 … −12 m
	let seabed = - 20 + 8 * fbm2( n.seabed, x, z, 4, 0.0115 );
	// broad dunes on the sand flats
	seabed += 1.6 * fbm2( n.seabedB, x, z, 2, 0.045 );

	// L2 — reef ridge: a warped ridged band that forms the wall with the caves
	const warp = 14 * fbm2( n.bommie, x, z, 2, 0.008 );
	const ridge = 1 - Math.abs( fbm2( n.reef, x + warp, z - warp, 3, 0.0085 ) );
	const reef = 9.5 * Math.pow( Math.max( 0, ridge - 0.42 ) / 0.58, 1.8 );

	// coral bommies — isolated knolls dotted over the slope
	const bom = fbm2( n.bommie, x * 1.7 + 300, z * 1.7 - 120, 2, 0.05 );
	const bommie = 4.5 * Math.pow( Math.max( 0, bom - 0.45 ) / 0.55, 2 );

	let h = seabed + reef * ( 1 - mask * 0.7 ) + bommie * ( 1 - mask );

	if ( mask > 0.001 ) {

		// L1b — island: ridged noise gives cliff faces rather than smooth hills
		const ir = 1 - Math.abs( fbm2( n.island, x, z, 5, 0.019 ) );
		let island = - 2 + 30 * Math.pow( ir, 1.7 );
		island += 3 * fbm2( n.islandB, x, z, 3, 0.06 );
		h = h * ( 1 - mask ) + island * mask;

	}

	return h;

}

/* -------------------------------------------------------------------------- */
/* Cave system authoring (L4)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * DESIGN §3.4: noise alone does not guarantee a cave you can find, enter and
 * swim through. Systems are authored as splines whose mouths are placed, by
 * construction, on the rock surface facing open water.
 */
function buildCaveSystems() {

	const rnd = stream( 'caves' );
	const prims = [];
	const systems = [];

	const surfaceSlope = ( x, z ) => {

		const e = 2;
		const dx = heightAt( x + e, z ) - heightAt( x - e, z );
		const dz = heightAt( x, z + e ) - heightAt( x, z - e );
		return Math.hypot( dx, dz ) / ( 2 * e );

	};

	// Mouths already claimed, so systems spread around the reef instead of all
	// converging on the single steepest spot (the greedy search is
	// deterministic, so without this every system picks the same wall).
	const claimed = [];
	const MIN_MOUTH_SEPARATION = 42;

	// Find a steep spot at a good depth — a wall, not a floor.
	const findMouth = ( opts = {} ) => {

		const minSep = opts.minSeparation ?? MIN_MOUTH_SEPARATION;
		const near = opts.near ?? null;
		const maxDistance = opts.maxDistance ?? Infinity;

		let best = null, bestScore = - Infinity;
		for ( let i = 0; i < 1200; i ++ ) {

			const a = rnd() * Math.PI * 2;
			const rad = 45 + rnd() * 85;
			const x = Math.cos( a ) * rad, z = Math.sin( a ) * rad;
			if ( Math.hypot( x, z ) > WORLD.edgeRadius - 15 ) continue;

			// Keep mouths out of the island's landmass.
			if ( Math.hypot( x - WORLD.islandX, z - WORLD.islandZ ) < WORLD.islandInner + 20 ) continue;

			const h = heightAt( x, z );
			if ( h < - 26 || h > - 8 ) continue;         // PRD: cave mouths at play depth

			let distToNear = 0;
			if ( near !== null ) {

				distToNear = Math.hypot( x - near.x, z - near.z );
				if ( distToNear > maxDistance ) continue;

			}

			let tooClose = false;
			for ( const c of claimed ) {

				if ( Math.hypot( x - c.x, z - c.z ) < minSep ) { tooClose = true; break; }

			}

			if ( tooClose ) continue;

			const slope = surfaceSlope( x, z );
			let score = slope * 3 + ( h + 26 ) * 0.05 + rnd() * 0.4;
			if ( near !== null ) score -= distToNear * 0.02; // prefer nearby exits

			if ( score > bestScore ) {

				bestScore = score;
				best = { x, y: h - 2.2, z };

			}

		}

		if ( best !== null ) claimed.push( best );
		return best;

	};

	/**
	 * Guaranteed exit: march horizontally out from `from` until the point is
	 * clear of the rock surface, and return that spot. Tries several bearings
	 * and takes the shortest bore.
	 */
	const boreExit = ( from, rnd ) => {

		let best = null, bestDist = Infinity;
		const bearings = 12;

		for ( let i = 0; i < bearings; i ++ ) {

			const a = ( i / bearings ) * Math.PI * 2 + rnd() * 0.3;
			const dx = Math.cos( a ), dz = Math.sin( a );

			for ( let d = 8; d <= 70; d += 2 ) {

				const x = from.x + dx * d, z = from.z + dz * d;
				if ( Math.hypot( x, z ) > WORLD.edgeRadius - 12 ) break;
				if ( Math.hypot( x - WORLD.islandX, z - WORLD.islandZ ) < WORLD.islandInner + 12 ) break;

				const h = heightAt( x, z );
				// Open water at the tunnel's height, and not so shallow that the
				// exit pops out on the beach.
				if ( h < from.y - 1.5 && h < - 6 ) {

					if ( d < bestDist ) { bestDist = d; best = { x, y: Math.min( from.y + 1, h - 1.6 ), z }; }
					break;

				}

			}

		}

		if ( best !== null ) claimed.push( best );
		return best;

	};

	const SYSTEMS = 4;
	for ( let s = 0; s < SYSTEMS; s ++ ) {

		const mouth = findMouth();
		if ( mouth === null ) continue;

		const nodes = [ mouth ];
		const system = { id: `cave_${s}`, mouths: [ mouth ], chambers: [], skylights: [], nodes };

		// Head inward (toward the world centre) and downward, wandering.
		let dirX = - mouth.x, dirZ = - mouth.z;
		const dl = Math.hypot( dirX, dirZ ) || 1;
		dirX /= dl; dirZ /= dl;

		let p = { ...mouth };
		const segs = 5 + Math.floor( rnd() * 3 );

		for ( let i = 0; i < segs; i ++ ) {

			const turn = ( rnd() - 0.5 ) * 1.5;
			const cs = Math.cos( turn ), sn = Math.sin( turn );
			const ndx = dirX * cs - dirZ * sn;
			const ndz = dirX * sn + dirZ * cs;
			dirX = ndx; dirZ = ndz;

			const len = 11 + rnd() * 12;

			// PRD §4.3: tunnels 3–8 m across — never a corridor collision test.
			const r0 = 2.0 + rnd() * 1.6;
			const r1 = 2.0 + rnd() * 1.6;

			const next = {
				x: p.x + dirX * len,
				y: p.y - 1.5 + ( rnd() - 0.5 ) * 5,
				z: p.z + dirZ * len,
			};

			// Bury the tunnel: the ceiling must clear the rock surface by more
			// than the 3D detail layer's ±2.8 m amplitude, or the tunnel erupts
			// through the seabed as a visible tube instead of being a cave.
			// The margin must include the tunnel RADIUS, not just its centre.
			const burial = Math.max( r0, r1 ) + 3.2;
			next.y = Math.min( next.y, heightAt( next.x, next.z ) - burial );
			next.y = Math.max( next.y, WORLD.yMin + 5 );
			if ( Math.hypot( next.x, next.z ) > WORLD.edgeRadius - 12 ) break;
			prims.push( {
				kind: 0, ax: p.x, ay: p.y, az: p.z, bx: next.x, by: next.y, bz: next.z,
				r0, r1,
			} );

			nodes.push( next );
			p = next;

		}

		// A chamber at the end of every system.
		const chamber = {
			kind: 1, cx: p.x, cy: p.y - 1.5, cz: p.z,
			rx: 8 + rnd() * 5, ry: 5 + rnd() * 3, rz: 8 + rnd() * 5,
			scale: 6,
		};
		chamber.cy = Math.min( chamber.cy, heightAt( chamber.cx, chamber.cz ) - chamber.ry - 4 );
		prims.push( chamber );
		system.chambers.push( chamber );

		// PRD §4.3: at least one skylight per system — a hole in the ceiling
		// admitting a single god-ray shaft. Also a navigational breadcrumb.
		const surfaceY = heightAt( chamber.cx, chamber.cz );
		if ( surfaceY > chamber.cy + 3 ) {

			const sky = {
				kind: 0,
				ax: chamber.cx, ay: chamber.cy, az: chamber.cz,
				bx: chamber.cx + ( rnd() - 0.5 ) * 4, by: surfaceY + 2.5, bz: chamber.cz + ( rnd() - 0.5 ) * 4,
				r0: 2.6, r1: 1.9,
			};
			prims.push( sky );
			system.skylights.push( { x: sky.bx, y: surfaceY, z: sky.bz } );

		}

		// PRD §4.3: a second opening, so no system is a dead end.
		//
		// A search can legitimately fail (all good walls are already claimed by
		// another system), and a cave you can only back out of is exactly the
		// claustrophobic dead end the PRD forbids. So if the search fails we
		// *bore* an exit: march outward from the chamber until we are past the
		// rock surface, and drive a tunnel there. That cannot fail.
		let second = findMouth( { minSeparation: 26, near: p, maxDistance: 100 } );
		if ( second === null ) second = boreExit( p, rnd );

		if ( second !== null ) {

			const mid = {
				x: ( p.x + second.x ) / 2 + ( rnd() - 0.5 ) * 10,
				y: Math.min( p.y, second.y ) - 1.5 - rnd() * 3.5,
				z: ( p.z + second.z ) / 2 + ( rnd() - 0.5 ) * 10,
			};
			mid.y = Math.min( mid.y, heightAt( mid.x, mid.z ) - 5.8 );

			prims.push( { kind: 0, ax: p.x, ay: p.y, az: p.z, bx: mid.x, by: mid.y, bz: mid.z, r0: 2.2, r1: 2.4 } );
			prims.push( { kind: 0, ax: mid.x, ay: mid.y, az: mid.z, bx: second.x, by: second.y, bz: second.z, r0: 2.4, r1: 2.6 } );
			system.mouths.push( second );
			nodes.push( mid, second );

		}

		systems.push( system );

	}

	// Sea caves at the island waterline — they link the above- and below-water
	// worlds (PRD §4.3).
	for ( let i = 0; i < 2; i ++ ) {

		const a = rnd() * Math.PI * 2;
		const rad = WORLD.islandInner + 14 + rnd() * 18;
		const mx = WORLD.islandX + Math.cos( a ) * rad;
		const mz = WORLD.islandZ + Math.sin( a ) * rad;
		const inX = WORLD.islandX - mx, inZ = WORLD.islandZ - mz;
		const il = Math.hypot( inX, inZ ) || 1;

		const mouth = { x: mx, y: - 1.2, z: mz };
		const end = { x: mx + ( inX / il ) * 26, y: - 2.5, z: mz + ( inZ / il ) * 26 };

		prims.push( { kind: 0, ax: mouth.x, ay: mouth.y, az: mouth.z, bx: end.x, by: end.y, bz: end.z, r0: 3.2, r1: 2.6 } );
		prims.push( {
			kind: 1, cx: end.x, cy: end.y - 0.5, cz: end.z,
			rx: 7, ry: 4.5, rz: 7, scale: 5,
		} );

		systems.push( { id: `seacave_${i}`, mouths: [ mouth ], chambers: [], skylights: [], nodes: [ mouth, end ], seaCave: true } );

	}

	// Broadphase.
	const grid = new PrimitiveGrid( 12 );
	for ( const p of prims ) {

		p.bounds = p.kind === 0 ? capsuleBounds( p ) : {
			minX: p.cx - p.rx - 2, maxX: p.cx + p.rx + 2,
			minY: p.cy - p.ry - 2, maxY: p.cy + p.ry + 2,
			minZ: p.cz - p.rz - 2, maxZ: p.cz + p.rz + 2,
		};
		grid.insert( p );

	}

	return { prims, grid, systems };

}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function initField() {

	if ( N !== null ) return N;

	N = { noise: buildNoise() };
	const caves = buildCaveSystems();
	N.prims = caves.prims;
	N.grid = caves.grid;
	N.systems = caves.systems;
	return N;

}

export function caveSystems() {

	return initField().systems;

}

/**
 * The field. Positive inside rock.
 *
 * `h` may be passed in when the caller already knows the column height (the
 * mesher walks a column at a time), which skips the whole 2D layer.
 */
export function field( x, y, z, h ) {

	if ( h === undefined ) h = heightAt( x, z );

	let solid = h - y;

	// Trivially open water, far above any rock.
	if ( solid < - WATER_BAND ) return solid;

	// Deep interior rock. Nothing carves here — but an authored primitive could
	// in principle reach, so only skip when the broadphase bucket is empty.
	if ( solid > ROCK_BAND && N.grid.at( x, z ) === undefined ) return solid;

	const n = N.noise;

	// L2 — 3D detail, which is what makes overhangs and undercuts possible.
	// Its amplitude is ±2.8 m, so it can only move a surface that is already
	// within a few metres — running it through the whole rock band was ~29% of
	// the world-build cost for no visible effect. Faded out rather than cut, so
	// there is no discontinuity at the boundary.
	if ( solid < 9 ) {

		const detailFade = solid > 5 ? ( 9 - solid ) * 0.25 : 1;
		solid += 2.8 * detailFade * fbm3( n.detail3, x, y * 1.35, z, 3, 0.055 );

	}

	// L3 — noise caves. Two independent fields; a tunnel exists where BOTH are
	// near zero. The intersection of two zero-sets in 3D is a curve, which is
	// why this yields tunnels rather than blobby pockets.
	let cave = - 1e9;
	if ( y < - 5 ) {

		const wx = x + 6 * n.caveWarp( x * 0.01, y * 0.01, z * 0.01 );
		const wz = z + 6 * n.caveWarp( x * 0.01 + 40, y * 0.01, z * 0.01 - 40 );

		const a = Math.abs( n.caveA( wx * 0.031, y * 0.045, wz * 0.031 ) );
		const b = Math.abs( n.caveB( wx * 0.031 + 71, y * 0.045, wz * 0.031 - 23 ) );

		// Fade caves out near the seabed surface, near the world floor, and
		// before ROCK_BAND — the last one keeps the early-out above from
		// producing a visible discontinuity in the rock.
		const gate = smoothstep( - 5, - 11, y )
			* smoothstep( WORLD.yMin, WORLD.yMin + 8, y )
			* smoothstep( ROCK_BAND, ROCK_BAND - 7, solid );
		cave = ( 0.135 - Math.max( a, b ) ) * 34 * gate;

	}

	// L4 — authored primitives (broadphase-culled).
	const bucket = N.grid.at( x, z );
	if ( bucket !== undefined ) {

		for ( let i = 0; i < bucket.length; i ++ ) {

			const p = bucket[ i ];
			if ( y < p.bounds.minY || y > p.bounds.maxY ) continue;
			const v = primValue( p, x, y, z );
			if ( v > cave ) cave = v;

		}

	}

	// Boolean difference: rock minus cave.
	return solid < - cave ? solid : - cave;

}

/** Gradient of the field, by tetrahedral finite differences (DESIGN §3.3). */
const _g = { x: 0, y: 0, z: 0 };
export function fieldGradient( x, y, z, e = 0.35 ) {

	const k0 = field( x + e, y - e, z - e );
	const k1 = field( x - e, y - e, z + e );
	const k2 = field( x - e, y + e, z - e );
	const k3 = field( x + e, y + e, z + e );

	_g.x = k0 - k1 - k2 + k3;
	_g.y = - k0 - k1 + k2 + k3;
	_g.z = - k0 + k1 - k2 + k3;

	const len = Math.hypot( _g.x, _g.y, _g.z ) || 1;
	_g.x /= len; _g.y /= len; _g.z /= len;
	return _g;

}

/**
 * How much sky a point can see, 0..1 (DESIGN §3.2, REVIEW §C1).
 *
 * One vertical ray using the SDF soft-shadow form. Lives here rather than in
 * the mesher because the prop scatterer needs the identical value — flora must
 * only grow where the material will actually light it.
 *
 * `h` is the column height; pass it when known (the ray is vertical, so it is
 * constant along it and recomputing `heightAt` per step is ~20x the cost).
 */
export function skyVisibilityAt( x, y, z, h ) {

	if ( h === undefined ) h = heightAt( x, z );

	let vis = 1;
	let d = 0.7;

	while ( d < 70 ) {

		const sy = y + d;
		if ( sy > WORLD.yMax ) break;

		const f = field( x, sy, z, h );
		if ( f > 0 ) return 0;

		const t = ( - f ) * 3 / d;
		if ( t < vis ) {

			vis = t;
			if ( vis <= 0.001 ) return 0;

		}

		d *= 1.25;

	}

	return vis > 1 ? 1 : vis;

}

/** March down from `y` to find the rock surface below. Returns null if none. */
export function surfaceBelow( x, y, z, maxDrop = 60, step = 0.6 ) {

	let prevY = y, prev = field( x, y, z );
	for ( let d = step; d <= maxDrop; d += step ) {

		const cy = y - d;
		const v = field( x, cy, z );
		if ( prev <= 0 && v > 0 ) {

			// Linear interpolation to the crossing.
			const t = prev / ( prev - v );
			return prevY + ( cy - prevY ) * t;

		}

		prev = v; prevY = cy;

	}

	return null;

}

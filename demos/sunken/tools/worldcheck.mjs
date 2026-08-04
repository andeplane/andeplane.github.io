#!/usr/bin/env node
/**
 * Headless world validation.
 *
 *   npm run world            full report
 *   npm run world -- --map   also print an ASCII depth map
 *   npm run world -- --mesh  also mesh a sample of chunks and time it
 *
 * `src/world/field.js` and `src/world/mesher.js` are deliberately free of
 * three.js and DOM dependencies so the entire world generator is a plain
 * library that runs — and can be validated — in Node. Rendering only ever
 * consumes its output. Keep it that way: it turns "reload the browser and
 * squint" into a sub-second test.
 */

import { initField, field, heightAt, caveSystems, surfaceBelow, WORLD } from '../src/world/field.js';
import { meshChunk } from '../src/world/mesher.js';

const args = new Set( process.argv.slice( 2 ) );
const want = ( f ) => args.has( f ) || args.has( '--all' );

let failures = 0;
const check = ( ok, label, detail = '' ) => {

	if ( ! ok ) failures ++;
	console.log( `  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${label}${detail ? '  — ' + detail : ''}` );
	return ok;

};

console.log( '\n\x1b[1mWORLD CHECK\x1b[0m' );

const tInit = performance.now();
initField();
console.log( `  field initialised in ${( performance.now() - tInit ).toFixed( 0 )} ms\n` );

/* -------------------------------------------------------------------------- */
console.log( '\x1b[1m1. Depth distribution\x1b[0m  (PRD §4.1: play depth −10 … −30 m)' );

{
	const bins = { above: 0, shallow: 0, play: 0, deep: 0, floor: 0 };
	let n = 0, sum = 0, min = Infinity, max = - Infinity;

	for ( let x = - WORLD.half; x < WORLD.half; x += 3 ) {

		for ( let z = - WORLD.half; z < WORLD.half; z += 3 ) {

			if ( Math.hypot( x, z ) > WORLD.edgeRadius ) continue;
			const h = heightAt( x, z );
			n ++; sum += h;
			if ( h < min ) min = h;
			if ( h > max ) max = h;

			if ( h > 0 ) bins.above ++;
			else if ( h > - 10 ) bins.shallow ++;
			else if ( h > - 30 ) bins.play ++;
			else if ( h > - 40 ) bins.deep ++;
			else bins.floor ++;

		}

	}

	const pct = ( v ) => `${( 100 * v / n ).toFixed( 1 )}%`;
	console.log( `  seabed height  min ${min.toFixed( 1 )}  max ${max.toFixed( 1 )}  mean ${( sum / n ).toFixed( 1 )}` );
	console.log( `  above water ${pct( bins.above )} | 0…−10 ${pct( bins.shallow )} | −10…−30 ${pct( bins.play )} | below −30 ${pct( bins.deep + bins.floor )}` );

	check( bins.play / n > 0.45, 'majority of the seabed sits in the −10…−30 m play band', pct( bins.play ) );
	check( bins.above / n > 0.03 && bins.above / n < 0.30, 'island is present but does not dominate', pct( bins.above ) );
	check( max > 15, 'island rises high enough to be a landmark', `peak ${max.toFixed( 1 )} m` );
	check( min > WORLD.yMin + 2, 'seabed stays inside the meshed volume', `min ${min.toFixed( 1 )} vs yMin ${WORLD.yMin}` );

}

/* -------------------------------------------------------------------------- */
console.log( '\n\x1b[1m2. Cave systems\x1b[0m  (PRD §4.3)' );

{
	const systems = caveSystems();
	console.log( `  ${systems.length} systems` );

	let mouthsOpen = 0, mouthsTotal = 0, tooClose = 0;
	const allMouths = [];

	for ( const s of systems ) {

		const tags = [];
		if ( s.skylights.length ) tags.push( `${s.skylights.length} skylight` );
		if ( s.chambers.length ) tags.push( `${s.chambers.length} chamber` );
		if ( s.seaCave ) tags.push( 'sea cave' );
		console.log( `    ${s.id.padEnd( 11 )} ${s.mouths.length} mouth(s)  ${tags.join( ', ' )}` );

		for ( const m of s.mouths ) {

			mouthsTotal ++;
			// A mouth is "open" if the field is negative there — i.e. it is
			// actually a hole, not a spot buried in rock.
			if ( field( m.x, m.y, m.z ) < 0 ) mouthsOpen ++;
			for ( const o of allMouths ) if ( Math.hypot( m.x - o.x, m.z - o.z ) < 15 ) tooClose ++;
			allMouths.push( m );

		}

	}

	check( systems.length >= 4, 'at least 4 cave systems', `${systems.length}` );
	check( mouthsOpen === mouthsTotal, 'every cave mouth is actually open water', `${mouthsOpen}/${mouthsTotal}` );
	check( tooClose === 0, 'no two mouths are stacked on top of each other', `${tooClose} collisions` );
	check( systems.filter( s => ! s.seaCave ).every( s => s.mouths.length >= 2 ),
		'every reef system has ≥2 openings (no dead ends)' );
	check( systems.filter( s => ! s.seaCave ).every( s => s.skylights.length >= 1 ),
		'every reef system has a skylight' );

}

/* -------------------------------------------------------------------------- */
console.log( '\n\x1b[1m3. Cave navigability\x1b[0m  (DESIGN §3.4 clearance)' );

{
	const systems = caveSystems();
	let samples = 0, tight = 0, blocked = 0;
	let minClear = Infinity;

	// Walk each system's spline and measure clearance by expanding a sphere.
	for ( const s of systems ) {

		for ( let i = 0; i < s.nodes.length - 1; i ++ ) {

			const a = s.nodes[ i ], b = s.nodes[ i + 1 ];
			for ( let t = 0; t <= 1; t += 0.2 ) {

				const p = { x: a.x + ( b.x - a.x ) * t, y: a.y + ( b.y - a.y ) * t, z: a.z + ( b.z - a.z ) * t };
				samples ++;

				if ( field( p.x, p.y, p.z ) > 0 ) { blocked ++; continue; }

				// Radial clearance: how far can we go before hitting rock?
				let clear = 4;
				for ( const [ dx, dy, dz ] of [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 1, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ] ] ) {

					for ( let d = 0.4; d <= 4; d += 0.4 ) {

						if ( field( p.x + dx * d, p.y + dy * d, p.z + dz * d ) > 0 ) { if ( d < clear ) clear = d; break; }

					}

				}

				if ( clear < minClear ) minClear = clear;
				if ( clear < 1.2 ) tight ++;

			}

		}

	}

	console.log( `  ${samples} spline samples, min clearance ${minClear.toFixed( 2 )} m` );
	check( blocked === 0, 'no point on a cave spline is buried in rock', `${blocked} blocked` );
	check( tight / samples < 0.05, 'tunnels are wide enough to swim (≥1.2 m clearance)', `${tight} tight (${( 100 * tight / samples ).toFixed( 1 )}%)` );

	// A tunnel with no rock over it is not a cave, it is a trench erupting out
	// of the seabed. Mouths and skylights are allowed to be open; interior
	// nodes are not.
	let unroofed = 0, interior = 0;
	for ( const s of systems ) {

		if ( s.seaCave ) continue;

		for ( let i = 1; i < s.nodes.length - 1; i ++ ) {

			const p = s.nodes[ i ];
			// Skip nodes that are deliberately under a skylight.
			if ( s.skylights.some( k => Math.hypot( k.x - p.x, k.z - p.z ) < 6 ) ) continue;

			interior ++;
			let roofed = false;
			for ( let d = 1; d <= 30; d += 0.5 ) {

				if ( field( p.x, p.y + d, p.z ) > 0 ) { roofed = true; break; }

			}

			if ( ! roofed ) unroofed ++;

		}

	}

	check( unroofed === 0, 'every interior tunnel node has rock above it (caves, not trenches)',
		`${unroofed}/${interior} unroofed` );

}

/* -------------------------------------------------------------------------- */
console.log( '\n\x1b[1m4. Sky visibility bake\x1b[0m  (DESIGN §3.2 / REVIEW §C1)' );

{
	const skyAt = ( x, y, z ) => {

		let vis = 1, d = 0.7;
		while ( d < 70 ) {

			const sy = y + d;
			if ( sy > WORLD.yMax ) break;
			const f = field( x, sy, z );
			if ( f > 0 ) return 0;
			const t = Math.min( 1, ( - f ) * 3 / d );
			if ( t < vis ) vis = t;
			if ( vis <= 0.001 ) return 0;
			d *= 1.18;

		}

		return vis;

	};

	// Open seabed should see the sky; deep inside a cave chamber should not.
	let openSum = 0, openN = 0;
	for ( let i = 0; i < 60; i ++ ) {

		const a = ( i / 60 ) * Math.PI * 2;
		const x = Math.cos( a ) * 105, z = Math.sin( a ) * 105;
		const h = heightAt( x, z );
		if ( h > - 5 ) continue;
		openSum += skyAt( x, h + 0.15, z );
		openN ++;

	}

	const openMean = openSum / Math.max( 1, openN );

	let caveSum = 0, caveN = 0;
	for ( const s of caveSystems() ) {

		for ( const c of s.chambers ) {

			caveSum += skyAt( c.cx, c.cy, c.cz );
			caveN ++;

		}

	}

	const caveMean = caveN > 0 ? caveSum / caveN : 0;

	console.log( `  open seabed mean ${openMean.toFixed( 3 )} (${openN} samples)` );
	console.log( `  cave chamber mean ${caveMean.toFixed( 3 )} (${caveN} samples)` );

	check( openMean > 0.8, 'open seabed is lit', openMean.toFixed( 3 ) );
	check( caveMean < 0.25, 'cave chambers are dark (so the torch matters)', caveMean.toFixed( 3 ) );

}

/* -------------------------------------------------------------------------- */
console.log( '\n\x1b[1m5. Playability\x1b[0m' );

{
	// The player must be able to descend from the surface to the seabed at the
	// spawn, and the seabed must be findable everywhere in open water.
	let missing = 0, n = 0;
	for ( let x = - 120; x <= 120; x += 15 ) {

		for ( let z = - 120; z <= 120; z += 15 ) {

			if ( Math.hypot( x, z ) > WORLD.edgeRadius - 10 ) continue;
			n ++;
			if ( surfaceBelow( x, WORLD.yMax, z ) === null ) missing ++;

		}

	}

	check( missing === 0, 'a solid surface exists below every open-water column', `${missing}/${n} missing` );

	// Sea caves should straddle the waterline (PRD §4.3).
	const seaCaves = caveSystems().filter( s => s.seaCave );
	check( seaCaves.length >= 1, 'sea caves link the above- and below-water worlds', `${seaCaves.length}` );

}

/* -------------------------------------------------------------------------- */
if ( want( '--mesh' ) ) {

	console.log( '\n\x1b[1m6. Meshing\x1b[0m' );

	const voxel = 0.6, dims = 40, size = dims * voxel;
	const specs = [];
	for ( let x = - WORLD.half; x < WORLD.half; x += size )
		for ( let z = - WORLD.half; z < WORLD.half; z += size )
			for ( let y = WORLD.yMin; y < WORLD.yMax; y += size )
				specs.push( { ox: x, oy: y, oz: z, dims, voxel } );

	// Sample every Nth chunk and extrapolate, so this stays a fast check.
	const STRIDE = 7;
	let verts = 0, tris = 0, meshed = 0, empty = 0;
	const t0 = performance.now();
	for ( let i = 0; i < specs.length; i += STRIDE ) {

		const r = meshChunk( specs[ i ] );
		if ( r === null ) { empty ++; continue; }
		meshed ++; verts += r.vertexCount; tris += r.triangleCount;

	}

	const ms = performance.now() - t0;
	const sampled = meshed + empty;
	const scale = specs.length / sampled;

	console.log( `  sampled ${sampled}/${specs.length} chunks in ${ms.toFixed( 0 )} ms` );
	console.log( `  ${meshed} meshed, ${empty} empty (${( 100 * empty / sampled ).toFixed( 0 )}% rejected)` );
	console.log( `  projected full world: ${( tris * scale / 1e6 ).toFixed( 2 )}M tris, ` +
		`${( verts * scale / 1e6 ).toFixed( 2 )}M verts, ${( ms * scale / 1000 ).toFixed( 1 )} s single-threaded` );

	const cores = Math.max( 1, ( ( await import( 'os' ) ).cpus().length ) - 1 );
	const parallel = ms * scale / 1000 / cores;
	console.log( `  across ${cores} workers ≈ ${parallel.toFixed( 2 )} s` );

	check( tris * scale < 3.2e6, 'triangle count within renderable budget', `${( tris * scale / 1e6 ).toFixed( 2 )}M` );
	check( parallel < 4, 'meets the <4 s worldgen budget (DESIGN §3.2)', `${parallel.toFixed( 2 )} s` );

}

/* -------------------------------------------------------------------------- */
if ( want( '--map' ) ) {

	console.log( '\n\x1b[1mDepth map\x1b[0m   ' +
		'\x1b[32m#\x1b[0m land  \x1b[33m+\x1b[0m shallow  \x1b[36m·\x1b[0m reef  \x1b[34m-\x1b[0m deep  ' +
		'\x1b[31mO\x1b[0m cave mouth  \x1b[35m*\x1b[0m skylight' );

	const W = 96, H = 44;
	const grid = [];
	for ( let r = 0; r < H; r ++ ) {

		const row = [];
		for ( let c = 0; c < W; c ++ ) {

			const x = - WORLD.half + ( c / ( W - 1 ) ) * WORLD.half * 2;
			const z = - WORLD.half + ( r / ( H - 1 ) ) * WORLD.half * 2;
			if ( Math.hypot( x, z ) > WORLD.edgeRadius ) { row.push( ' ' ); continue; }
			const h = heightAt( x, z );
			row.push( h > 8 ? '\x1b[32m#\x1b[0m' : h > 0 ? '\x1b[32m▪\x1b[0m' : h > - 10 ? '\x1b[33m+\x1b[0m' : h > - 20 ? '\x1b[36m·\x1b[0m' : '\x1b[34m-\x1b[0m' );

		}

		grid.push( row );

	}

	const plot = ( x, z, ch ) => {

		const c = Math.round( ( x + WORLD.half ) / ( WORLD.half * 2 ) * ( W - 1 ) );
		const r = Math.round( ( z + WORLD.half ) / ( WORLD.half * 2 ) * ( H - 1 ) );
		if ( c >= 0 && c < W && r >= 0 && r < H ) grid[ r ][ c ] = ch;

	};

	for ( const s of caveSystems() ) {

		for ( const m of s.mouths ) plot( m.x, m.z, '\x1b[31;1mO\x1b[0m' );
		for ( const k of s.skylights ) plot( k.x, k.z, '\x1b[35;1m*\x1b[0m' );

	}

	console.log( grid.map( r => '  ' + r.join( '' ) ).join( '\n' ) );

}

/* -------------------------------------------------------------------------- */
console.log( failures === 0
	? `\n\x1b[32m\x1b[1mAll checks passed.\x1b[0m\n`
	: `\n\x1b[31m\x1b[1m${failures} check(s) failed.\x1b[0m\n` );

process.exit( failures === 0 ? 0 : 1 );

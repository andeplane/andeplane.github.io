/**
 * Prop placement (DESIGN §3.5).
 *
 * Stratified jittered sampling over the world, then per-candidate rejection on
 * slope, depth, sky visibility and zone — all read from the same `field()` the
 * terrain was built from, so nothing is ever placed inside a rock or floating
 * above the seabed.
 *
 * Pure: no three.js, runs in Node (`npm run world`).
 */

import { field, heightAt, surfaceBelow, fieldGradient, skyVisibilityAt, WORLD } from './field.js';
import { stream } from '../core/rng.js';

/**
 * @typedef {object} SpeciesRule
 * @property {string} id
 * @property {number} density        relative weight of total budget
 * @property {[number,number]} depth  allowed seabed depth band (negative metres)
 * @property {number} minFlatness    minimum normal.y (1 = flat)
 * @property {number} minSky         minimum sky visibility (0 = caves allowed)
 * @property {number} maxSky
 * @property {[number,number]} scale
 * @property {number} clearance      minimum spacing from same-species neighbours
 * @property {boolean} [alignToSlope]
 */

/** Sample the seabed at (x, z): surface height + normal + sky visibility. */
export function probe( x, z ) {

	const h = heightAt( x, z );
	// Start above the rock and march down to the true surface, which may be a
	// cave floor or an overhang rather than the 2D height.
	const y = surfaceBelow( x, Math.min( h + 6, WORLD.yMax ), z );
	if ( y === null ) return null;

	const g = fieldGradient( x, y + 0.05, z );
	// Outward normal points away from rock.
	const nx = - g.x, ny = - g.y, nz = - g.z;

	return {
		x, y, z,
		nx, ny, nz,
		flatness: ny,
		sky: skyVisibilityAt( x, y + 0.2, z, h ),
	};

}

/**
 * Scatter one species. Returns an array of placements.
 *
 * @param {SpeciesRule} rule
 * @param {number} count target instance count
 */
export function scatterSpecies( rule, count, seedName = rule.id ) {

	const rnd = stream( `scatter-${seedName}` );
	const out = [];

	// A coarse hash grid gives O(1) neighbour rejection; a naive O(n²) check
	// over 40k instances would take seconds.
	const cell = Math.max( 1, rule.clearance );
	const occupied = new Map();
	const key = ( ix, iz ) => ix * 100003 + iz;

	const tooClose = ( x, z ) => {

		const ix = Math.floor( x / cell ), iz = Math.floor( z / cell );
		for ( let dx = - 1; dx <= 1; dx ++ ) {

			for ( let dz = - 1; dz <= 1; dz ++ ) {

				const bucket = occupied.get( key( ix + dx, iz + dz ) );
				if ( bucket === undefined ) continue;
				for ( let i = 0; i < bucket.length; i += 2 ) {

					const ddx = bucket[ i ] - x, ddz = bucket[ i + 1 ] - z;
					if ( ddx * ddx + ddz * ddz < rule.clearance * rule.clearance ) return true;

				}

			}

		}

		return false;

	};

	const claim = ( x, z ) => {

		const k = key( Math.floor( x / cell ), Math.floor( z / cell ) );
		let b = occupied.get( k );
		if ( b === undefined ) occupied.set( k, b = [] );
		b.push( x, z );

	};

	const R = WORLD.edgeRadius - 6;
	const attempts = count * 14;

	for ( let i = 0; i < attempts && out.length < count; i ++ ) {

		// Uniform in the disc.
		const a = rnd() * Math.PI * 2;
		const r = Math.sqrt( rnd() ) * R;
		const x = Math.cos( a ) * r, z = Math.sin( a ) * r;

		if ( tooClose( x, z ) ) continue;

		const p = probe( x, z );
		if ( p === null ) continue;

		if ( p.y < rule.depth[ 0 ] || p.y > rule.depth[ 1 ] ) continue;
		if ( p.flatness < rule.minFlatness ) continue;
		if ( p.sky < rule.minSky || p.sky > rule.maxSky ) continue;
		if ( rule.reject !== undefined && rule.reject( p, rnd ) ) continue;

		claim( x, z );

		const s = rule.scale[ 0 ] + rnd() * ( rule.scale[ 1 ] - rule.scale[ 0 ] );

		out.push( {
			x: p.x, y: p.y, z: p.z,
			nx: p.nx, ny: p.ny, nz: p.nz,
			scale: s,
			rotation: rnd() * Math.PI * 2,
			phase: rnd() * Math.PI * 2,
			tint: rnd(),
			sky: p.sky,
		} );

	}

	return out;

}

/**
 * Scatter a whole set of species against a total instance budget, splitting it
 * by each rule's relative density.
 */
export function scatterAll( rules, totalBudget ) {

	const totalDensity = rules.reduce( ( s, r ) => s + r.density, 0 );
	const result = {};

	for ( const rule of rules ) {

		const count = Math.round( totalBudget * ( rule.density / totalDensity ) );
		result[ rule.id ] = scatterSpecies( rule, count );

	}

	return result;

}

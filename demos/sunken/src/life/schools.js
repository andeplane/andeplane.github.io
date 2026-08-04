import * as THREE from 'three/webgpu';

import { Flock } from './boids.js';
import { buildFish, buildGull } from '../geometry/creatures.js';
import { heightAt, WORLD } from '../world/field.js';
import { stream } from '../core/rng.js';

/**
 * Species definitions and spawning (DESIGN §7.1).
 *
 * Fish and gulls run the *same* flocking system with different parameters —
 * which is why `Flock` is a configurable class rather than logic inlined into a
 * fish file.
 */

const SPECIES = [
	{
		id: 'sardine', schools: 3, count: 420, length: 0.19, shape: 0.30,
		speed: 3.1, separation: 1.5, alignment: 2.2, cohesion: 1.0,
		neighbourRadius: 3.2, undulation: 1.3, fleeRadius: 7.5,
		colorA: 0x6d8fa6, colorB: 0xc9dfe8, bellyColor: 0xf2f6f5,
		// A tight territory is what makes a school read as a school: the same
		// fish spread over a 16 m box just look like scattered debris.
		extent: new THREE.Vector3( 9, 3.5, 9 ), depth: [ - 22, - 7 ], scale: 1,
	},
	{
		id: 'anthias', schools: 2, count: 300, length: 0.25, shape: 0.62,
		speed: 2.1, separation: 1.7, alignment: 1.7, cohesion: 0.9,
		neighbourRadius: 3.8, undulation: 1.0, fleeRadius: 5.5,
		colorA: 0xe0642f, colorB: 0xf5b03f, bellyColor: 0xffd9a0,
		extent: new THREE.Vector3( 10, 4, 10 ), depth: [ - 20, - 6 ], scale: 1,
	},
	{
		id: 'reeffish', schools: 2, count: 130, length: 0.42, shape: 0.85,
		speed: 1.5, separation: 2.1, alignment: 1.0, cohesion: 0.7,
		neighbourRadius: 5.0, undulation: 0.7, fleeRadius: 5.0,
		colorA: 0x3d6fb0, colorB: 0xf0d24a, bellyColor: 0xf4f6f0,
		extent: new THREE.Vector3( 20, 6, 20 ), depth: [ - 24, - 5 ], scale: 1,
	},
];

/** Find an open-water point over reef at a usable depth. */
function findHome( rnd, depthBand ) {

	for ( let attempt = 0; attempt < 400; attempt ++ ) {

		const a = rnd() * Math.PI * 2;
		const r = 25 + rnd() * ( WORLD.edgeRadius - 45 );
		const x = Math.cos( a ) * r, z = Math.sin( a ) * r;

		const h = heightAt( x, z );
		if ( h < depthBand[ 0 ] - 4 || h > depthBand[ 1 ] ) continue;

		// Hover a few metres clear of the bottom.
		const y = Math.min( h + 5.5 + rnd() * 3, - 3 );
		if ( y - h < 3 ) continue;

		return new THREE.Vector3( x, y, z );

	}

	return new THREE.Vector3( 0, - 12, 0 );

}

export function createFishSchools( scene, budget = 3000 ) {

	const rnd = stream( 'schools' );
	const flocks = [];

	const totalPlanned = SPECIES.reduce( ( s, sp ) => s + sp.schools * sp.count, 0 );
	const ratio = Math.min( 1, budget / totalPlanned );

	for ( const sp of SPECIES ) {

		for ( let s = 0; s < sp.schools; s ++ ) {

			const count = Math.max( 24, Math.round( sp.count * ratio ) );
			// Each school gets its own geometry instance because the boids
			// shader writes per-instance attributes onto it.
			const geometry = buildFish( { length: sp.length, shape: sp.shape } );

			const flock = new Flock( {
				name: `${sp.id}${s}`,
				count,
				geometry,
				home: findHome( rnd, sp.depth ),
				extent: sp.extent.clone(),
				speed: sp.speed * ( 0.9 + rnd() * 0.2 ),
				separation: sp.separation,
				alignment: sp.alignment,
				cohesion: sp.cohesion,
				neighbourRadius: sp.neighbourRadius,
				undulation: sp.undulation,
				fleeRadius: sp.fleeRadius,
				colorA: sp.colorA,
				colorB: sp.colorB,
				bellyColor: sp.bellyColor,
				scale: sp.scale,
			} );

			scene.add( flock.mesh );
			flocks.push( flock );

		}

	}

	return flocks;

}

/**
 * Gulls above the island — the same flocking system, tuned for air.
 * Higher cohesion, a much larger and higher territory, no undulation.
 */
export function createGulls( scene, count = 150 ) {

	const geometry = buildGull( { span: 0.95 } );

	const flock = new Flock( {
		name: 'gulls',
		count,
		geometry,
		home: new THREE.Vector3( WORLD.islandX, 26, WORLD.islandZ ),
		extent: new THREE.Vector3( 95, 22, 95 ),
		speed: 6.5,
		separation: 1.8,
		alignment: 1.6,
		cohesion: 0.9,
		neighbourRadius: 9,
		undulation: 0,
		fleeRadius: 0,          // they are not remotely afraid of a swimmer
		colorA: 0xf2f4f6,
		colorB: 0xc9d2d8,
		bellyColor: 0xffffff,
		scale: 1,
		scaleVariance: 0.22,
	} );

	scene.add( flock.mesh );
	return flock;

}

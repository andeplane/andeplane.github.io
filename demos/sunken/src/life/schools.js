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
		// Silver baitball: the dense shimmering mass you swim through.
		id: 'sardine', schools: 3, count: 420, length: 0.19, shape: 0.30,
		speed: 3.1, separation: 1.5, alignment: 2.2, cohesion: 1.0,
		neighbourRadius: 3.2, undulation: 1.3, fleeRadius: 7.5,
		colorA: 0x8fb6c8, colorB: 0xdfeef5, bellyColor: 0xf6fafb,
		// A tight territory is what makes a school read as a school: the same
		// fish spread over a 16 m box just look like scattered debris.
		extent: new THREE.Vector3( 9, 3.5, 9 ), depth: [ - 22, - 7 ], scale: 1,
	},
	{
		// Anthias: the orange haze that hangs over every tropical reef.
		id: 'anthias', schools: 3, count: 300, length: 0.24, shape: 0.62,
		speed: 2.1, separation: 1.7, alignment: 1.7, cohesion: 0.9,
		neighbourRadius: 3.8, undulation: 1.0, fleeRadius: 5.5,
		colorA: 0xff6a1e, colorB: 0xffc23d, bellyColor: 0xffe2a8,
		extent: new THREE.Vector3( 10, 4, 10 ), depth: [ - 20, - 6 ], scale: 1,
	},
	{
		// Blue-green chromis — electric cyan, reads brilliantly against sand.
		id: 'chromis', schools: 2, count: 260, length: 0.17, shape: 0.55,
		speed: 2.4, separation: 1.6, alignment: 2.0, cohesion: 1.1,
		neighbourRadius: 3.2, undulation: 1.1, fleeRadius: 5.0,
		colorA: 0x14d0c0, colorB: 0x6ef0ff, bellyColor: 0xcffbff,
		extent: new THREE.Vector3( 9, 3.5, 9 ), depth: [ - 20, - 5 ], scale: 1,
	},
	{
		// Yellow tang: big, flat, unmistakable.
		id: 'tang', schools: 2, count: 90, length: 0.34, shape: 0.95,
		speed: 1.6, separation: 2.1, alignment: 1.2, cohesion: 0.7,
		neighbourRadius: 5.0, undulation: 0.75, fleeRadius: 5.0,
		colorA: 0xffd400, colorB: 0xffee66, bellyColor: 0xfff6b0,
		extent: new THREE.Vector3( 16, 5, 16 ), depth: [ - 22, - 4 ], scale: 1,
	},
	{
		// Parrotfish: teal and magenta, the big grazers.
		id: 'parrot', schools: 2, count: 55, length: 0.52, shape: 0.88,
		speed: 1.35, separation: 2.3, alignment: 1.0, cohesion: 0.6,
		neighbourRadius: 6.0, undulation: 0.65, fleeRadius: 5.5,
		colorA: 0x1fa89a, colorB: 0xd94f9c, bellyColor: 0x9fe6dd,
		extent: new THREE.Vector3( 20, 6, 20 ), depth: [ - 24, - 5 ], scale: 1,
	},
	{
		// Butterflyfish: white with black bars and a yellow tail.
		id: 'butterfly', schools: 2, count: 70, length: 0.28, shape: 0.98,
		speed: 1.5, separation: 2.0, alignment: 1.1, cohesion: 0.65,
		neighbourRadius: 4.5, undulation: 0.8, fleeRadius: 4.5,
		colorA: 0xf7f2e2, colorB: 0xffcf3a, bellyColor: 0xffffff,
		extent: new THREE.Vector3( 14, 4.5, 14 ), depth: [ - 20, - 4 ], scale: 1,
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

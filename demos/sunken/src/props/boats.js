import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { waveSample } from '../world/waves.js';
import { heightAt, WORLD } from '../world/field.js';
import { stream } from '../core/rng.js';

/**
 * Boats on the surface (PRD §5.5).
 *
 * They sample `world/waves.js` on the CPU — the *same* Gerstner table the ocean
 * shader displaces vertices with — so a boat sits in the swell it is actually
 * floating on. Three samples across the hull give pitch and roll for free: the
 * hull tilts to match the surface between bow, stern and beam, which is what
 * makes it read as buoyant rather than as a model sliding along a plane.
 */

function strip( g ) {

	for ( const name of Object.keys( g.attributes ) ) {

		if ( name !== 'position' && name !== 'normal' ) g.deleteAttribute( name );

	}

	if ( g.getIndex() === null ) g.setIndex( [ ...Array( g.getAttribute( 'position' ).count ).keys() ] );
	return g;

}

/** A simple lofted hull: cross-sections swept along the keel, pointed at the bow. */
function buildHull( { length = 5.2, beam = 1.7, depth = 0.85 } ) {

	const positions = [], indices = [];
	const sections = 9, radial = 7;

	for ( let i = 0; i <= sections; i ++ ) {

		const t = i / sections;
		const z = ( t - 0.5 ) * length;
		// Fine at the bow, full amidships, tucked at the stern.
		const widthScale = Math.sin( Math.pow( t, 0.75 ) * Math.PI ) * 0.92 + 0.08;
		const bowRise = Math.pow( Math.abs( t - 0.5 ) * 2, 3 ) * depth * 0.55;

		for ( let j = 0; j <= radial; j ++ ) {

			const a = ( j / radial ) * Math.PI;      // half-circle: hull below deck
			positions.push(
				- Math.cos( a ) * beam * 0.5 * widthScale,
				- Math.sin( a ) * depth + bowRise,
				z,
			);

		}

	}

	const perRow = radial + 1;
	for ( let i = 0; i < sections; i ++ ) {

		for ( let j = 0; j < radial; j ++ ) {

			const a = i * perRow + j, b = a + 1;
			const c = ( i + 1 ) * perRow + j, d = c + 1;
			indices.push( a, c, b, b, c, d );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	g.setIndex( indices );
	g.computeVertexNormals();
	return g;

}

function buildSailboat() {

	const parts = [];
	const hull = buildHull( { length: 5.4, beam: 1.8, depth: 0.9 } );
	parts.push( hull );

	// Deck.
	const deck = new THREE.BoxGeometry( 1.7, 0.08, 5.2 );
	deck.translate( 0, 0.02, 0 );
	parts.push( deck );

	// Cabin.
	const cabin = new THREE.BoxGeometry( 1.15, 0.5, 1.5 );
	cabin.translate( 0, 0.28, - 0.6 );
	parts.push( cabin );

	// Mast and boom.
	const mast = new THREE.CylinderGeometry( 0.055, 0.07, 5.0, 6 );
	mast.translate( 0, 2.5, 0.4 );
	parts.push( mast );

	const boom = new THREE.CylinderGeometry( 0.04, 0.04, 2.4, 5 );
	boom.rotateX( Math.PI / 2 );
	boom.translate( 0, 0.55, - 0.5 );
	parts.push( boom );

	return mergeGeometries( parts.map( strip ) );

}

function buildFishingBoat() {

	const parts = [];
	parts.push( buildHull( { length: 6.6, beam: 2.3, depth: 1.0 } ) );

	const deck = new THREE.BoxGeometry( 2.2, 0.09, 6.4 );
	parts.push( deck );

	// Wheelhouse.
	const house = new THREE.BoxGeometry( 1.6, 1.1, 1.9 );
	house.translate( 0, 0.6, - 1.5 );
	parts.push( house );

	const roof = new THREE.BoxGeometry( 1.8, 0.1, 2.1 );
	roof.translate( 0, 1.18, - 1.5 );
	parts.push( roof );

	// Derrick.
	const post = new THREE.CylinderGeometry( 0.06, 0.08, 2.6, 6 );
	post.translate( 0, 1.3, 0.6 );
	parts.push( post );

	const arm = new THREE.CylinderGeometry( 0.045, 0.045, 2.2, 5 );
	arm.rotateX( Math.PI / 2.6 );
	arm.translate( 0, 2.1, 1.5 );
	parts.push( arm );

	return mergeGeometries( parts.map( strip ) );

}

class Boat {

	constructor( scene, geometry, material, position, heading, drift ) {

		this.mesh = new THREE.Mesh( geometry, material );
		this.mesh.castShadow = true;
		this.mesh.name = 'boat';
		scene.add( this.mesh );

		this.origin = position.clone();
		this.heading = heading;
		this.drift = drift;          // radians/sec around the anchor, 0 = moored
		this.radius = 0;
		this.angle = 0;

		// Sample offsets along the hull: bow, stern, port beam.
		this._bow = new THREE.Vector3();
		this._stern = new THREE.Vector3();
		this._beam = new THREE.Vector3();
		this._normal = new THREE.Vector3();
		this._quat = new THREE.Quaternion();
		this._up = new THREE.Vector3( 0, 1, 0 );

	}

	setPatrol( radius, angle ) {

		this.radius = radius;
		this.angle = angle;

	}

	update( elapsed ) {

		let x = this.origin.x, z = this.origin.z, heading = this.heading;

		if ( this.radius > 0 ) {

			const a = this.angle + elapsed * this.drift;
			x = this.origin.x + Math.cos( a ) * this.radius;
			z = this.origin.z + Math.sin( a ) * this.radius;
			// Face along the tangent of the circle.
			heading = a + Math.PI / 2;

		}

		const cosH = Math.cos( heading ), sinH = Math.sin( heading );
		const halfLen = 2.4, halfBeam = 0.9;

		// Three samples of the shared wave field → position, pitch and roll.
		const bow = waveSample( x - sinH * halfLen, z - cosH * halfLen, elapsed );
		const by = bow.y;
		const stern = waveSample( x + sinH * halfLen, z + cosH * halfLen, elapsed );
		const sy = stern.y;
		const beam = waveSample( x + cosH * halfBeam, z - sinH * halfBeam, elapsed );
		const my = beam.y;

		const centreY = ( by + sy ) * 0.5;

		// Ride a little low, as a loaded hull does.
		this.mesh.position.set( x, centreY - 0.28, z );

		const pitch = Math.atan2( by - sy, halfLen * 2 );
		const roll = Math.atan2( my - centreY, halfBeam );

		this.mesh.rotation.set( 0, 0, 0 );
		this.mesh.rotateY( heading );
		this.mesh.rotateX( pitch );
		this.mesh.rotateZ( - roll * 0.8 );

	}

}

export function createBoats( scene ) {

	const rnd = stream( 'boats' );

	const material = new THREE.MeshStandardNodeMaterial( {
		color: 0xdfe6e8,
		roughness: 0.62,
		metalness: 0.05,
		side: THREE.DoubleSide,
	} );

	const boats = [];

	/** Find open water at least `clearance` deep, near the island. */
	const findWater = ( minR, maxR ) => {

		for ( let i = 0; i < 300; i ++ ) {

			const a = rnd() * Math.PI * 2;
			const r = minR + rnd() * ( maxR - minR );
			const x = WORLD.islandX + Math.cos( a ) * r;
			const z = WORLD.islandZ + Math.sin( a ) * r;
			if ( Math.hypot( x, z ) > WORLD.edgeRadius - 20 ) continue;
			if ( heightAt( x, z ) < - 6 ) return new THREE.Vector3( x, 0, z );

		}

		return new THREE.Vector3( 0, 0, - 90 );

	};

	// A sailboat moored off the island — the first thing you see at spawn.
	const moored = new Boat( scene, buildSailboat(), material, findWater( 40, 62 ), rnd() * 6.28, 0 );
	boats.push( moored );

	// A fishing boat working a slow circle further out.
	const centre = findWater( 75, 105 );
	const trawler = new Boat( scene, buildFishingBoat(), material, centre, 0, 0.018 );
	trawler.setPatrol( 26, rnd() * 6.28 );
	boats.push( trawler );

	return boats;

}

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural creature geometry.
 *
 * Every builder emits a `bodyT` attribute running 0 at the nose to 1 at the
 * tail. The vertex shader uses it to drive a travelling sine down the body,
 * which is what makes a fish swim rather than slide — three.js's own compute
 * birds example only flaps two vertices, and it shows.
 *
 * Bodies point along +Z.
 */

function strip( g ) {

	for ( const name of Object.keys( g.attributes ) ) {

		if ( name !== 'position' && name !== 'normal' ) g.deleteAttribute( name );

	}

	if ( g.getIndex() === null ) g.setIndex( [ ...Array( g.getAttribute( 'position' ).count ).keys() ] );
	return g;

}

function merge( parts, label ) {

	const merged = mergeGeometries( parts.map( strip ) );
	if ( merged === null ) throw new Error( `creatures: merge failed for "${label}"` );
	return merged;

}

function addBodyT( geometry, length ) {

	const pos = geometry.getAttribute( 'position' );
	const t = new Float32Array( pos.count );
	const half = length / 2;
	for ( let i = 0; i < pos.count; i ++ ) {

		// z = +half at the nose → 0, z = -half at the tail → 1
		t[ i ] = Math.max( 0, Math.min( 1, ( half - pos.getZ( i ) ) / length ) );

	}

	geometry.setAttribute( 'bodyT', new THREE.BufferAttribute( t, 1 ) );
	return geometry;

}

/**
 * A lathe-ish fish body: ellipse cross-sections swept along Z.
 *
 * @param {object} p profile controls
 */
function fishBody( { length, height, width, segments = 10, radial = 8, profile } ) {

	const positions = [], indices = [];
	const half = length / 2;

	for ( let i = 0; i <= segments; i ++ ) {

		const t = i / segments;
		const z = half - t * length;
		const r = profile( t );          // 0..1 body radius scale

		for ( let j = 0; j < radial; j ++ ) {

			const a = ( j / radial ) * Math.PI * 2;
			positions.push(
				Math.cos( a ) * width * 0.5 * r,
				Math.sin( a ) * height * 0.5 * r,
				z,
			);

		}

	}

	for ( let i = 0; i < segments; i ++ ) {

		for ( let j = 0; j < radial; j ++ ) {

			const j1 = ( j + 1 ) % radial;
			const a = i * radial + j, b = i * radial + j1;
			const c = ( i + 1 ) * radial + j, d = ( i + 1 ) * radial + j1;
			indices.push( a, c, b, b, c, d );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	g.setIndex( indices );
	g.computeVertexNormals();
	return g;

}

/** A flat fin: a triangle fan in a plane, optionally swept back. */
function fin( { span, chord, sweep = 0.4, thickness = 0.012, plane = 'vertical' } ) {

	const pts = [
		[ 0, 0, chord * 0.5 ],
		[ 0, span, chord * 0.5 - sweep * chord ],
		[ 0, span * 0.75, - chord * 0.5 ],
		[ 0, 0, - chord * 0.5 ],
	];

	const positions = [], indices = [];
	for ( const s of [ - 1, 1 ] ) {

		for ( const p of pts ) positions.push( p[ 0 ] + s * thickness, p[ 1 ], p[ 2 ] );

	}

	indices.push( 0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6 );
	// Seal the edges so the fin is not a floating pair of quads.
	for ( let i = 0; i < 4; i ++ ) {

		const j = ( i + 1 ) % 4;
		indices.push( i, j, i + 4, j, j + 4, i + 4 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	g.setIndex( indices );
	g.computeVertexNormals();

	if ( plane === 'horizontal' ) g.rotateZ( Math.PI / 2 );
	return g;

}

/** Generic reef fish. `shape` shifts it between slender and deep-bodied. */
export function buildFish( { length = 0.28, shape = 0.5 } = {} ) {

	const height = length * ( 0.28 + shape * 0.42 );
	const width = length * ( 0.14 + shape * 0.06 );

	const body = fishBody( {
		length, height, width,
		profile: ( t ) => Math.sin( Math.pow( t, 0.62 ) * Math.PI ) * ( 1 - t * 0.55 ) + 0.08,
	} );

	const parts = [ body ];

	// Caudal (tail) fin.
	const tail = fin( { span: height * 0.95, chord: length * 0.30, sweep: 0.75 } );
	tail.translate( 0, - height * 0.47, - length * 0.46 );
	parts.push( tail );

	const tailLower = fin( { span: height * 0.95, chord: length * 0.30, sweep: 0.75 } );
	tailLower.rotateZ( Math.PI );
	tailLower.translate( 0, height * 0.47, - length * 0.46 );
	parts.push( tailLower );

	// Dorsal.
	const dorsal = fin( { span: height * 0.45, chord: length * 0.34, sweep: 0.55 } );
	dorsal.translate( 0, height * 0.42, length * 0.02 );
	parts.push( dorsal );

	// Pectorals.
	for ( const s of [ - 1, 1 ] ) {

		const pec = fin( { span: length * 0.16, chord: length * 0.12, sweep: 0.6, plane: 'horizontal' } );
		pec.rotateY( s * 0.4 );
		pec.translate( s * width * 0.42, - height * 0.05, length * 0.14 );
		parts.push( pec );

	}

	return addBodyT( merge( parts, 'fish' ), length );

}

/** Gull — a simple three-triangle glider, in the spirit of three's birds. */
export function buildGull( { span = 0.9 } = {} ) {

	const l = span * 0.55;
	const body = fishBody( {
		length: l, height: l * 0.22, width: l * 0.18, segments: 6, radial: 6,
		profile: ( t ) => Math.sin( Math.pow( t, 0.7 ) * Math.PI ) * ( 1 - t * 0.4 ) + 0.1,
	} );

	const parts = [ body ];

	for ( const s of [ - 1, 1 ] ) {

		const wing = fin( { span: span * 0.5, chord: l * 0.42, sweep: 0.75, thickness: 0.006, plane: 'horizontal' } );
		wing.rotateY( s > 0 ? 0 : Math.PI );
		wing.translate( 0, 0, l * 0.06 );
		if ( s < 0 ) wing.scale( - 1, 1, 1 );
		parts.push( wing );

	}

	const tail = fin( { span: l * 0.22, chord: l * 0.22, sweep: 0.3, plane: 'horizontal' } );
	tail.translate( 0, 0, - l * 0.5 );
	parts.push( tail );

	return addBodyT( merge( parts, 'gull' ), l );

}

/** Jellyfish: a pulsing bell plus trailing tentacles. */
export function buildJellyfish( { radius = 0.22 } = {} ) {

	const bell = new THREE.SphereGeometry( radius, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.58 );
	bell.scale( 1, 0.85, 1 );

	const parts = [ bell ];
	const n = 10;
	for ( let i = 0; i < n; i ++ ) {

		const a = ( i / n ) * Math.PI * 2;
		const len = radius * ( 2.4 + Math.random() * 2.0 );
		const t = new THREE.CylinderGeometry( 0.004, 0.010, len, 4, 1 );
		t.translate( 0, - len / 2, 0 );
		t.translate( Math.cos( a ) * radius * 0.72, - radius * 0.05, Math.sin( a ) * radius * 0.72 );
		parts.push( t );

	}

	const g = merge( parts, 'jellyfish' );
	// bodyT here means "distance below the bell", driving the tentacle trail.
	const pos = g.getAttribute( 'position' );
	const bt = new Float32Array( pos.count );
	for ( let i = 0; i < pos.count; i ++ ) {

		bt[ i ] = Math.max( 0, Math.min( 1, - pos.getY( i ) / ( radius * 4 ) ) );

	}

	g.setAttribute( 'bodyT', new THREE.BufferAttribute( bt, 1 ) );
	return g;

}

/**
 * Crab: shell, eyes and eight legs plus two claws.
 *
 * Legs carry `legIndex` and `limbT` attributes so the vertex shader can walk
 * them procedurally — no bones, no skinning, one draw call for every crab in
 * the world (DESIGN §7.2).
 */
export function buildCrab( { size = 0.22 } = {} ) {

	const parts = [];
	const legIndexOf = [];

	const push = ( g, legIndex ) => {

		strip( g );
		parts.push( g );
		legIndexOf.push( { count: g.getAttribute( 'position' ).count, legIndex } );

	};

	const shell = new THREE.SphereGeometry( size * 0.5, 12, 8 );
	shell.scale( 1.25, 0.55, 1 );
	shell.translate( 0, size * 0.30, 0 );
	push( shell, 0 );

	for ( const s of [ - 1, 1 ] ) {

		const stalk = new THREE.CylinderGeometry( size * 0.03, size * 0.03, size * 0.16, 4 );
		stalk.translate( s * size * 0.17, size * 0.46, size * 0.30 );
		push( stalk, 0 );
		const eye = new THREE.SphereGeometry( size * 0.055, 6, 5 );
		eye.translate( s * size * 0.17, size * 0.54, size * 0.30 );
		push( eye, 0 );

	}

	// Eight walking legs, four per side.
	let leg = 1;
	for ( const s of [ - 1, 1 ] ) {

		for ( let i = 0; i < 4; i ++ ) {

			const spread = ( i - 1.5 ) * 0.42;
			const upper = new THREE.CylinderGeometry( size * 0.028, size * 0.035, size * 0.42, 4 );
			upper.translate( 0, - size * 0.21, 0 );
			upper.rotateZ( s * 1.02 );
			upper.rotateY( spread );
			upper.translate( s * size * 0.30, size * 0.30, - spread * size * 0.55 );
			push( upper, leg );

			const lower = new THREE.CylinderGeometry( size * 0.014, size * 0.028, size * 0.40, 4 );
			lower.translate( 0, - size * 0.20, 0 );
			lower.rotateZ( s * 0.15 );
			lower.rotateY( spread );
			lower.translate( s * size * 0.62, size * 0.06, - spread * size * 0.85 );
			push( lower, leg );

			leg ++;

		}

	}

	// Two claws.
	for ( const s of [ - 1, 1 ] ) {

		const arm = new THREE.CylinderGeometry( size * 0.04, size * 0.045, size * 0.30, 5 );
		arm.rotateZ( s * 1.3 );
		arm.translate( s * size * 0.36, size * 0.28, size * 0.32 );
		push( arm, 9 + ( s > 0 ? 1 : 0 ) );

		const claw = new THREE.SphereGeometry( size * 0.11, 7, 5 );
		claw.scale( 1.5, 0.7, 0.9 );
		claw.translate( s * size * 0.56, size * 0.24, size * 0.44 );
		push( claw, 9 + ( s > 0 ? 1 : 0 ) );

	}

	const g = mergeGeometries( parts );
	if ( g === null ) throw new Error( 'creatures: merge failed for "crab"' );

	// Per-vertex leg index, so each limb can be given its own gait phase.
	const total = g.getAttribute( 'position' ).count;
	const legAttr = new Float32Array( total );
	let cursor = 0;
	for ( const entry of legIndexOf ) {

		legAttr.fill( entry.legIndex, cursor, cursor + entry.count );
		cursor += entry.count;

	}

	g.setAttribute( 'legIndex', new THREE.BufferAttribute( legAttr, 1 ) );

	// limbT: 0 at the body, 1 at the leg tip — the further out, the more it moves.
	const pos = g.getAttribute( 'position' );
	const limbT = new Float32Array( total );
	for ( let i = 0; i < total; i ++ ) {

		const d = Math.hypot( pos.getX( i ), pos.getZ( i ) ) / ( size * 0.8 );
		limbT[ i ] = Math.max( 0, Math.min( 1, d ) );

	}

	g.setAttribute( 'limbT', new THREE.BufferAttribute( limbT, 1 ) );

	return g;

}

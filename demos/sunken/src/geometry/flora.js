import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural reef flora.
 *
 * Built rather than downloaded: no asset licensing, no load time, and — more
 * usefully — every builder can emit a `bend` attribute (0 at the anchored base,
 * 1 at the free tip) that the sway shader needs. A downloaded mesh would have
 * to have that painted on by hand.
 *
 * All geometries are authored Y-up with their base at the origin, so the
 * instancer can place them by surface normal without per-species fixups.
 */

/**
 * Merge parts into one geometry.
 *
 * `mergeGeometries` requires every input to carry the *same* attribute set and
 * returns null otherwise — and it returns null silently, so the failure surfaces
 * much later as "cannot read getAttribute of null". Our hand-built ribbons have
 * no UVs while three's primitives do, so everything is normalised to
 * position+normal first. Nothing here is textured, so UVs are dead weight
 * anyway.
 */
function merge( parts, label ) {

	for ( const g of parts ) {

		for ( const name of Object.keys( g.attributes ) ) {

			if ( name !== 'position' && name !== 'normal' ) g.deleteAttribute( name );

		}

		if ( g.getAttribute( 'normal' ) === undefined ) g.computeVertexNormals();
		if ( g.getIndex() === null ) g.setIndex( [ ...Array( g.getAttribute( 'position' ).count ).keys() ] );

	}

	const merged = mergeGeometries( parts );
	if ( merged === null ) throw new Error( `flora: failed to merge geometry for "${label}"` );
	return merged;

}

/** Tag every vertex with height/maxHeight so the sway shader can bend it. */
function addBend( geometry, maxHeight, override ) {

	const pos = geometry.getAttribute( 'position' );
	const bend = new Float32Array( pos.count );
	for ( let i = 0; i < pos.count; i ++ ) {

		bend[ i ] = override !== undefined ? override : Math.max( 0, Math.min( 1, pos.getY( i ) / maxHeight ) );

	}

	geometry.setAttribute( 'bend', new THREE.BufferAttribute( bend, 1 ) );
	return geometry;

}

/** A tapered ribbon (kelp blade, seagrass blade). */
function ribbon( { height, width, segments, curl = 0.4, twist = 0.6, taper = 0.55 } ) {

	const positions = [], normals = [], indices = [];

	for ( let i = 0; i <= segments; i ++ ) {

		const t = i / segments;
		const y = t * height;
		// Blades are widest a third of the way up, then taper to a point.
		const w = width * ( 1 - Math.pow( Math.abs( t - 0.33 ) / 0.67, 1.6 ) * taper ) * ( 1 - t * 0.75 );
		const bendX = Math.sin( t * Math.PI * curl ) * height * 0.16;
		const rot = t * twist;
		const cr = Math.cos( rot ), sr = Math.sin( rot );

		for ( const side of [ - 1, 1 ] ) {

			const lx = side * w * 0.5;
			positions.push( bendX + lx * cr, y, lx * sr );
			normals.push( - sr, 0, cr );

		}

	}

	for ( let i = 0; i < segments; i ++ ) {

		const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
		indices.push( a, c, b, b, c, d );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
	g.setIndex( indices );
	return g;

}

export function buildKelp() {

	const label = 'kelp';
	const parts = [];
	const bladeCount = 5;
	for ( let i = 0; i < bladeCount; i ++ ) {

		const g = ribbon( {
			height: 2.6 + Math.random() * 1.8,
			width: 0.26,
			segments: 7,
			curl: 0.5 + Math.random() * 0.4,
			twist: 0.7 + Math.random(),
		} );
		g.rotateY( ( i / bladeCount ) * Math.PI * 2 + Math.random() * 0.6 );
		g.translate( ( Math.random() - 0.5 ) * 0.12, 0, ( Math.random() - 0.5 ) * 0.12 );
		parts.push( g );

	}

	// A stipe so the base is not a bundle of floating blades.
	const stipe = new THREE.CylinderGeometry( 0.028, 0.05, 1.1, 5, 1 );
	stipe.translate( 0, 0.55, 0 );
	parts.push( stipe );

	return addBend( merge( parts, label ), 4.2 );

}

export function buildSeagrass() {

	const label = 'seagrass';
	const parts = [];
	const n = 7 + Math.floor( Math.random() * 5 );
	for ( let i = 0; i < n; i ++ ) {

		const g = ribbon( {
			height: 0.5 + Math.random() * 0.55,
			width: 0.055,
			segments: 4,
			curl: 0.6,
			twist: 0.3,
			taper: 0.2,
		} );
		g.rotateY( Math.random() * Math.PI * 2 );
		g.rotateZ( ( Math.random() - 0.5 ) * 0.5 );
		g.translate( ( Math.random() - 0.5 ) * 0.18, 0, ( Math.random() - 0.5 ) * 0.18 );
		parts.push( g );

	}

	return addBend( merge( parts, label ), 1.0 );

}

/** Recursive branching — staghorn coral, and (retuned) the sea fan skeleton. */
function branch( parts, origin, dir, length, radius, depth, opts ) {

	if ( depth <= 0 || radius < 0.022 ) return;

	const end = origin.clone().addScaledVector( dir, length );

	const g = new THREE.CylinderGeometry( radius * 0.72, radius, length, 6, 1 );
	// CylinderGeometry runs along +Y; orient it along `dir`.
	g.translate( 0, length / 2, 0 );
	const q = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), dir );
	g.applyQuaternion( q );
	g.translate( origin.x, origin.y, origin.z );
	parts.push( g );

	const children = opts.children ?? 2;
	for ( let i = 0; i < children; i ++ ) {

		const spread = opts.spread ?? 0.6;
		const next = dir.clone();
		next.x += ( Math.random() - 0.5 ) * spread;
		next.y += ( Math.random() - 0.2 ) * spread * ( opts.upBias ?? 0.6 );
		next.z += ( Math.random() - 0.5 ) * spread;
		if ( opts.flatten ) next.z *= 0.12;   // sea fans grow in a plane
		next.normalize();

		branch( parts, end, next, length * ( 0.68 + Math.random() * 0.14 ), radius * 0.7, depth - 1, opts );

	}

}

export function buildStaghorn() {

	const label = 'staghorn';
	const parts = [];
	const trunks = 2 + Math.floor( Math.random() * 2 );
	for ( let i = 0; i < trunks; i ++ ) {

		const a = ( i / trunks ) * Math.PI * 2;
		branch(
			parts,
			new THREE.Vector3( Math.cos( a ) * 0.1, 0, Math.sin( a ) * 0.1 ),
			new THREE.Vector3( Math.cos( a ) * 0.25, 1, Math.sin( a ) * 0.25 ).normalize(),
			// Thicker and one level shallower. At radius 0.058 over four levels
			// the tips came out as bare wire twigs scattered across the seabed;
			// real staghorn is chunky, and chunky also reads at distance.
			0.40, 0.105, 3,
			{ children: 2, spread: 0.8, upBias: 0.7 },
		);

	}

	// Coral is rigid — a uniform low bend so it only shivers, never waves.
	return addBend( merge( parts, label ), 1, 0.12 );

}

export function buildSeaFan() {

	const label = 'seafan';
	const parts = [];
	branch(
		parts,
		new THREE.Vector3( 0, 0, 0 ),
		new THREE.Vector3( 0, 1, 0 ),
		0.5, 0.045, 5,
		{ children: 2, spread: 1.5, upBias: 0.55, flatten: true },
	);

	const g = merge( parts, label );
	// Fans are soft corals: they flex noticeably in the surge.
	return addBend( g, 1.8 );

}

export function buildBrainCoral() {

	const g = new THREE.SphereGeometry( 0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55 );
	// Push vertices in and out to carve the characteristic meandering grooves.
	const pos = g.getAttribute( 'position' );
	const v = new THREE.Vector3();
	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i );
		const grooves = Math.sin( v.x * 26 + Math.sin( v.z * 18 ) * 2.2 ) * 0.018;
		v.multiplyScalar( 1 + grooves / Math.max( v.length(), 0.01 ) );
		pos.setXYZ( i, v.x, v.y * 0.72, v.z );

	}

	return addBend( smoothed( g ), 1, 0.02 );

}

export function buildBarrelSponge() {

	// A squat, lumpy barrel — NOT a tube.
	//
	// The previous version was a tall thin cylinder with a hole down the middle
	// and smooth walls, which read unmistakably as a drainage pipe or a plant
	// pot scattered across the seabed. Real barrel sponges are wider than they
	// are tall, with a thick irregular wall and a shallow cavity. Squashing the
	// proportions and displacing the wall with noise is what turns the silhouette
	// from plumbing into an organism.
	const RADIUS = 0.40, HEIGHT = 0.42, SEG = 18;

	const positions = [], indices = [];
	const rings = 6;

	// Outer wall, inner wall, and a rim joining them — built as one lathe so
	// the rim is continuous rather than a separate torus sitting on top.
	const profile = [];
	for ( let i = 0; i <= rings; i ++ ) {

		const t = i / rings;
		// Outer: swells at mid height, tucks in at the base.
		profile.push( { r: RADIUS * ( 0.72 + Math.sin( t * Math.PI * 0.85 ) * 0.34 ), y: t * HEIGHT, out: true } );

	}

	for ( let i = rings; i >= 0; i -- ) {

		const t = i / rings;
		// Inner cavity, shallower than the body is tall so it never tunnels
		// through — a see-through sponge is what made it look like a pipe.
		const depth = HEIGHT * 0.62;
		profile.push( { r: RADIUS * 0.52 * ( 0.35 + t * 0.65 ), y: HEIGHT - ( 1 - t ) * depth, out: false } );

	}

	for ( let p = 0; p < profile.length; p ++ ) {

		const { r, y } = profile[ p ];
		for ( let sIdx = 0; sIdx < SEG; sIdx ++ ) {

			const a = ( sIdx / SEG ) * Math.PI * 2;
			// Irregular wall thickness, varying with both angle and height.
			const lump = 1
				+ Math.sin( a * 3 + y * 6 ) * 0.10
				+ Math.sin( a * 7 - y * 4 ) * 0.05;
			positions.push( Math.cos( a ) * r * lump, y, Math.sin( a ) * r * lump );

		}

	}

	for ( let p = 0; p < profile.length - 1; p ++ ) {

		for ( let sIdx = 0; sIdx < SEG; sIdx ++ ) {

			const s1 = ( sIdx + 1 ) % SEG;
			const a = p * SEG + sIdx, b = p * SEG + s1;
			const c = ( p + 1 ) * SEG + sIdx, d = ( p + 1 ) * SEG + s1;
			indices.push( a, c, b, b, c, d );

		}

	}

	// Cap the cavity floor so you cannot see through it.
	const floorIndex = positions.length / 3;
	positions.push( 0, HEIGHT - HEIGHT * 0.62, 0 );
	const lastRing = ( profile.length - 1 ) * SEG;
	for ( let sIdx = 0; sIdx < SEG; sIdx ++ ) {

		indices.push( floorIndex, lastRing + sIdx, lastRing + ( ( sIdx + 1 ) % SEG ) );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	g.setIndex( indices );
	g.computeVertexNormals();

	return addBend( g, 1, 0.05 );

}

export function buildAnemone() {

	const label = 'anemone';
	const parts = [];
	const base = new THREE.CylinderGeometry( 0.13, 0.17, 0.16, 10, 1 );
	base.translate( 0, 0.08, 0 );
	parts.push( base );

	const n = 26;
	for ( let i = 0; i < n; i ++ ) {

		const a = ( i / n ) * Math.PI * 2 + Math.random() * 0.2;
		const lean = 0.5 + Math.random() * 0.7;
		const len = 0.17 + Math.random() * 0.13;
		const t = new THREE.CylinderGeometry( 0.006, 0.016, len, 4, 2 );
		t.translate( 0, len / 2, 0 );
		t.rotateZ( lean );
		t.rotateY( a );
		t.translate( 0, 0.15, 0 );
		parts.push( t );

	}

	// Tentacles are the softest thing on the reef — full bend.
	return addBend( merge( parts, label ), 0.42 );

}

export function buildUrchin() {

	const label = 'urchin';
	const parts = [];
	const body = new THREE.SphereGeometry( 0.09, 10, 8 );
	body.translate( 0, 0.09, 0 );
	parts.push( body );

	const n = 40;
	for ( let i = 0; i < n; i ++ ) {

		// Fibonacci sphere, so spines are evenly distributed.
		const y = 1 - ( i / ( n - 1 ) ) * 1.5;
		const r = Math.sqrt( Math.max( 0, 1 - y * y ) );
		const theta = i * 2.399963;
		const dir = new THREE.Vector3( Math.cos( theta ) * r, y, Math.sin( theta ) * r ).normalize();

		const len = 0.10 + Math.random() * 0.07;
		const s = new THREE.CylinderGeometry( 0.002, 0.010, len, 4, 1 );
		s.translate( 0, len / 2, 0 );
		s.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), dir ) );
		s.translate( dir.x * 0.07, 0.09 + dir.y * 0.07, dir.z * 0.07 );
		parts.push( s );

	}

	return addBend( merge( parts, label ), 1, 0.0 );

}

export function buildStarfish() {

	const label = 'starfish';
	const parts = [];
	const arms = 5;
	for ( let i = 0; i < arms; i ++ ) {

		const a = ( i / arms ) * Math.PI * 2;
		const arm = new THREE.CylinderGeometry( 0.018, 0.075, 0.30, 6, 2 );
		arm.translate( 0, 0.15, 0 );
		arm.rotateZ( Math.PI / 2 );
		arm.rotateY( a );
		arm.scale( 1, 0.34, 1 );
		parts.push( arm );

	}

	const centre = new THREE.SphereGeometry( 0.085, 10, 6 );
	centre.scale( 1, 0.42, 1 );
	parts.push( centre );

	const g = merge( parts, label );
	g.translate( 0, 0.03, 0 );
	return addBend( g, 1, 0.0 );

}

export function buildShell() {

	// A logarithmic-spiral tube — recognisably a conch without a real model.
	const points = [];
	const turns = 2.6, steps = 40;
	for ( let i = 0; i <= steps; i ++ ) {

		const t = i / steps;
		const a = t * turns * Math.PI * 2;
		const r = 0.02 + t * t * 0.11;
		points.push( new THREE.Vector3( Math.cos( a ) * r, t * 0.09, Math.sin( a ) * r ) );

	}

	const curve = new THREE.CatmullRomCurve3( points );
	const g = new THREE.TubeGeometry( curve, 34, 0.028, 6, false );
	// Taper the tube along its length.
	const pos = g.getAttribute( 'position' );
	for ( let i = 0; i < pos.count; i ++ ) {

		const t = i / pos.count;
		const k = 0.35 + t * 1.5;
		const y = pos.getY( i );
		pos.setXYZ( i, pos.getX( i ) * k, y * k, pos.getZ( i ) * k );

	}

	g.computeVertexNormals();
	return addBend( g, 1, 0.0 );

}

export const FLORA_BUILDERS = {
	boulder: buildBoulder,
	outcrop: buildRockOutcrop,
	coralhead: buildCoralHead,
	rubble: buildRubble,
	kelp: buildKelp,
	seagrass: buildSeagrass,
	staghorn: buildStaghorn,
	seafan: buildSeaFan,
	brain: buildBrainCoral,
	sponge: buildBarrelSponge,
	anemone: buildAnemone,
	urchin: buildUrchin,
	starfish: buildStarfish,
	shell: buildShell,
};

/* -------------------------------------------------------------------------- */
/* Seabed structure — rock and reef                                            */
/* -------------------------------------------------------------------------- */

/**
 * Weld an unindexed primitive and re-derive normals so it shades SMOOTHLY.
 *
 * This is the single biggest visual bug fixed in this pass. three's
 * `IcosahedronGeometry` (and the other polyhedra) return *non-indexed*
 * geometry: every triangle owns its three vertices. `computeVertexNormals()`
 * on that gives each triangle a single flat normal, so the mesh renders as a
 * faceted gem no matter how many subdivisions it has — adding triangles just
 * makes smaller facets. Welding first means neighbouring faces share vertices,
 * normals get averaged, and a rock reads as a rock.
 */
function smoothed( geometry ) {

	const welded = mergeVertices( geometry, 1e-4 );
	welded.computeVertexNormals();
	return welded;

}

/**
 * A weathered boulder.
 *
 * The marching-cubes terrain gives large forms but its 0.6 m voxels cannot
 * resolve anything smaller, so the seabed reads as smooth dunes. Scattered
 * boulders put readable, human-scale objects on it — they are what give the
 * ground a sense of scale and make the sand look like sand rather than a
 * gradient.
 */
export function buildBoulder( { radius = 0.7, detail = 3 } = {} ) {

	const g = new THREE.IcosahedronGeometry( radius, detail );
	const pos = g.getAttribute( 'position' );
	const v = new THREE.Vector3();

	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i );
		const n = v.clone().normalize();
		// Three octaves rather than two: without a fine term the surface is
		// smooth between the big lumps and reads as a beanbag.
		const broad = Math.sin( n.x * 3.1 + n.y * 2.3 ) * Math.cos( n.z * 2.7 - n.x * 1.9 );
		const mid = Math.sin( n.x * 7.3 - n.z * 5.1 ) * Math.cos( n.y * 6.2 );
		const fine = Math.sin( n.x * 17 + n.z * 14 ) * Math.cos( n.y * 19 );
		v.multiplyScalar( 1 + broad * 0.19 + mid * 0.075 + fine * 0.028 );
		// Flatten and sink the base, so it sits *in* the sand.
		v.y *= 0.66;
		pos.setXYZ( i, v.x, v.y, v.z );

	}

	const out = smoothed( g );
	out.translate( 0, radius * 0.28, 0 );
	return addBend( out, 1, 0.0 );

}

/** A cluster of boulders — an outcrop rather than a lone rock. */
export function buildRockOutcrop() {

	const label = 'outcrop';
	const parts = [];
	const n = 3 + Math.floor( Math.random() * 3 );

	for ( let i = 0; i < n; i ++ ) {

		const r = 0.35 + Math.random() * 0.55;
		const b = buildBoulder( { radius: r, detail: 1 } );
		b.deleteAttribute( 'bend' );
		const a = Math.random() * Math.PI * 2;
		const d = Math.random() * 0.7;
		b.rotateY( Math.random() * Math.PI );
		b.rotateZ( ( Math.random() - 0.5 ) * 0.4 );
		b.translate( Math.cos( a ) * d, Math.random() * 0.25, Math.sin( a ) * d );
		parts.push( b );

	}

	return addBend( merge( parts, label ), 1, 0.0 );

}

/**
 * A coral head / bommie: a rounded reef mound encrusted with knobs and plates.
 * These are the structures the reef is actually built from — the big colourful
 * masses you swim between, as distinct from the individual corals scattered on
 * top of them.
 */
export function buildCoralHead() {

	const label = 'coralhead';
	const parts = [];

	// Base mound.
	const base = new THREE.IcosahedronGeometry( 0.85, 3 );
	const pos = base.getAttribute( 'position' );
	const v = new THREE.Vector3();
	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i );
		const n = v.clone().normalize();
		const lump = Math.sin( n.x * 4.5 ) * Math.cos( n.z * 3.8 ) * 0.16
			+ Math.sin( n.y * 7 + n.x * 5 ) * 0.07;
		v.multiplyScalar( 1 + lump );
		v.y = v.y * 0.80 + 0.1;
		pos.setXYZ( i, v.x, Math.max( v.y, - 0.05 ), v.z );

	}

	const smoothBase = smoothed( base );
	smoothBase.translate( 0, 0.35, 0 );
	parts.push( smoothBase );

	// Knobs and plates growing off the mound.
	const knobs = 10 + Math.floor( Math.random() * 8 );
	for ( let i = 0; i < knobs; i ++ ) {

		const a = Math.random() * Math.PI * 2;
		const el = Math.random() * 1.1;
		const dir = new THREE.Vector3( Math.cos( a ) * Math.cos( el ), Math.sin( el ) + 0.25, Math.sin( a ) * Math.cos( el ) ).normalize();

		if ( Math.random() < 0.5 ) {

			// Finger.
			const len = 0.18 + Math.random() * 0.30;
			const k = new THREE.CylinderGeometry( 0.045, 0.075, len, 6, 1 );
			k.translate( 0, len / 2, 0 );
			k.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), dir ) );
			k.translate( dir.x * 0.62, 0.35 + dir.y * 0.55, dir.z * 0.62 );
			parts.push( k );

		} else {

			// Plate.
			const pl = new THREE.CylinderGeometry( 0.16 + Math.random() * 0.16, 0.10, 0.045, 8, 1 );
			pl.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), dir ) );
			pl.translate( dir.x * 0.66, 0.35 + dir.y * 0.58, dir.z * 0.66 );
			parts.push( pl );

		}

	}

	return addBend( merge( parts, label ), 1, 0.04 );

}

/** Small rubble: broken coral and shell fragments strewn on the sand. */
export function buildRubble() {

	const label = 'rubble';
	const parts = [];
	const n = 5 + Math.floor( Math.random() * 6 );

	for ( let i = 0; i < n; i ++ ) {

		const g = new THREE.IcosahedronGeometry( 0.035 + Math.random() * 0.06, 0 );
		g.scale( 1 + Math.random(), 0.4 + Math.random() * 0.3, 1 + Math.random() );
		g.rotateX( Math.random() * 3 );
		g.rotateY( Math.random() * 3 );
		const a = Math.random() * Math.PI * 2, d = Math.random() * 0.34;
		g.translate( Math.cos( a ) * d, 0.02, Math.sin( a ) * d );
		parts.push( g );

	}

	return addBend( merge( parts, label ), 1, 0.0 );

}

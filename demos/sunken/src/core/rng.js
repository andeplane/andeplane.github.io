/**
 * Seeded RNG. DESIGN §3: the world must be byte-identical across runs and
 * across workers, so every generator draws from a *named* sub-stream of one
 * root seed rather than from Math.random().
 */

export const WORLD_SEED = 0x5EA9A3E;

/** Fast, decent-quality 32-bit PRNG. */
export function mulberry32( a ) {

	return function () {

		a |= 0; a = ( a + 0x6D2B79F5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

/** Hash a string to a 32-bit int (FNV-1a) so streams can be named. */
export function hashString( str ) {

	let h = 0x811c9dc5;
	for ( let i = 0; i < str.length; i ++ ) {

		h ^= str.charCodeAt( i );
		h = Math.imul( h, 0x01000193 );

	}

	return h >>> 0;

}

/**
 * A named deterministic stream. `stream('caves')` returns the same sequence
 * every run, and is unaffected by how much anyone else drew.
 */
export function stream( name, seed = WORLD_SEED ) {

	const rnd = mulberry32( ( seed ^ hashString( name ) ) >>> 0 );

	rnd.range = ( a, b ) => a + rnd() * ( b - a );
	rnd.int = ( a, b ) => Math.floor( a + rnd() * ( b - a + 1 ) );
	rnd.pick = ( arr ) => arr[ Math.floor( rnd() * arr.length ) ];
	rnd.sign = () => ( rnd() < 0.5 ? - 1 : 1 );
	// Uniform point on a unit sphere.
	rnd.onSphere = ( out = { x: 0, y: 0, z: 0 } ) => {

		const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt( 1 - u * u );
		out.x = s * Math.cos( th ); out.y = u; out.z = s * Math.sin( th );
		return out;

	};

	return rnd;

}

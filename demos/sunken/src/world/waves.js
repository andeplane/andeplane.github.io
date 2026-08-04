/**
 * The wave field — ONE definition, consumed twice (DESIGN §6.1).
 *
 * The same table drives:
 *   • the ocean surface's vertex displacement (TSL / GPU)
 *   • boat buoyancy, the camera waterline test and spray spawning (JS / CPU)
 *
 * This is the same discipline as world/field.js: if the shader and the physics
 * disagree about where the water is, boats float above the swell and the
 * surface transition breaks. So neither is allowed its own copy.
 *
 * Gerstner rather than plain sines: the horizontal pinch is what makes crests
 * sharp and troughs broad, and it is what actually sells "amazing waves" when
 * the player surfaces.
 */

const G = 9.81;

/**
 * dir must be unit length. `steep` is the Gerstner Q factor *before*
 * normalisation — see `WAVE_DATA` below, which rescales so the surface can
 * never self-intersect into loops.
 */
const RAW = [
	// dirX, dirZ, amplitude(m), wavelength(m)
	[ 0.98, 0.20, 0.40, 41 ],
	[ 0.80, - 0.60, 0.25, 23 ],
	[ - 0.42, 0.91, 0.15, 13.5 ],
	[ 0.92, 0.39, 0.085, 7.6 ],
	[ - 0.71, 0.71, 0.05, 4.3 ],
	[ 0.31, - 0.95, 0.028, 2.7 ],
];

export const WAVES = RAW.map( ( [ dx, dz, amp, len ] ) => {

	const l = Math.hypot( dx, dz ) || 1;
	const k = ( 2 * Math.PI ) / len;         // wave number
	return {
		dx: dx / l, dz: dz / l,
		amp, len, k,
		omega: Math.sqrt( G * k ),             // deep-water dispersion
		q: 0,                                  // filled below
	};

} );

// Normalise steepness: Σ(Q·A·k) must stay below 1 or the Gerstner displacement
// folds the surface over itself and you get visible tearing at the crests.
{
	const TARGET_STEEPNESS = 0.72;

	// Weight pinch toward the long swell: big waves are visibly peaked, short
	// ripples are essentially sinusoidal. Weight = wavelength.
	for ( const w of WAVES ) w.q = w.len;

	const sum = WAVES.reduce( ( s, w ) => s + w.q * w.amp * w.k, 0 );
	const scale = TARGET_STEEPNESS / sum;
	for ( const w of WAVES ) w.q *= scale;
}

/** Sea-surface height at (x, z) and time t. */
export function waveHeight( x, z, t ) {

	let y = 0;
	for ( let i = 0; i < WAVES.length; i ++ ) {

		const w = WAVES[ i ];
		const phase = w.k * ( w.dx * x + w.dz * z ) - w.omega * t;
		y += w.amp * Math.sin( phase );

	}

	return y;

}

/**
 * Full surface sample: displaced position and normal.
 * Note the Gerstner horizontal displacement means the point that *lands* at
 * (x, z) is not the one sampled at (x, z); for buoyancy this approximation is
 * more than good enough and avoids an iterative inverse.
 */
const _out = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 };
export function waveSample( x, z, t ) {

	let px = 0, py = 0, pz = 0;
	let nx = 0, ny = 0, nz = 0;

	for ( let i = 0; i < WAVES.length; i ++ ) {

		const w = WAVES[ i ];
		const phase = w.k * ( w.dx * x + w.dz * z ) - w.omega * t;
		const s = Math.sin( phase ), c = Math.cos( phase );

		px += w.q * w.amp * w.dx * c;
		py += w.amp * s;
		pz += w.q * w.amp * w.dz * c;

		const ak = w.amp * w.k;
		nx += w.dx * ak * c;
		nz += w.dz * ak * c;
		ny += w.q * ak * s;

	}

	_out.x = x + px;
	_out.y = py;
	_out.z = z + pz;

	const rx = - nx, ry = 1 - ny, rz = - nz;
	const len = Math.hypot( rx, ry, rz ) || 1;
	_out.nx = rx / len; _out.ny = ry / len; _out.nz = rz / len;

	return _out;

}

/** Steepness proxy in [0,1], used for foam on the crests. */
export function waveCrest( x, z, t ) {

	const s = waveSample( x, z, t );
	return Math.max( 0, Math.min( 1, ( s.y / 0.55 ) ) );

}

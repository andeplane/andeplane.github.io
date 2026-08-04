/**
 * Procedural ambient audio (DESIGN §7.5).
 *
 * Entirely synthesised — no sample files to download, license or wait for. Noise
 * shaped by filters gets you surf, ocean rumble and reef crackle convincingly,
 * and it means the whole soundscape is a few hundred lines with no asset
 * pipeline behind it.
 *
 * The load-bearing piece is `submersionFilter`: a lowpass whose cutoff tracks
 * camera depth. Submerging *audibly closes the world down*, and that single
 * effect does more for immersion than everything else here combined. It rides
 * the same `submersion` value the fog and the post-processing use, so surfacing
 * is one event rather than three.
 *
 * Must be started from a user gesture (browser autoplay policy).
 */

const CUTOFF_AIR = 18000;
const CUTOFF_WATER = 620;

/** Looping noise buffer. `type` shapes the spectrum. */
function makeNoiseBuffer( ctx, seconds, type = 'white' ) {

	const length = Math.floor( ctx.sampleRate * seconds );
	const buffer = ctx.createBuffer( 1, length, ctx.sampleRate );
	const data = buffer.getChannelData( 0 );

	if ( type === 'brown' ) {

		// Integrated white noise → -6 dB/octave. Deep, oceanic.
		let last = 0;
		for ( let i = 0; i < length; i ++ ) {

			const white = Math.random() * 2 - 1;
			last = ( last + 0.02 * white ) / 1.02;
			data[ i ] = last * 3.5;

		}

	} else if ( type === 'pink' ) {

		// Voss-McCartney-ish: cheap -3 dB/octave.
		let b0 = 0, b1 = 0, b2 = 0;
		for ( let i = 0; i < length; i ++ ) {

			const white = Math.random() * 2 - 1;
			b0 = 0.99765 * b0 + white * 0.0990460;
			b1 = 0.96300 * b1 + white * 0.2965164;
			b2 = 0.57000 * b2 + white * 1.0526913;
			data[ i ] = ( b0 + b1 + b2 + white * 0.1848 ) * 0.25;

		}

	} else {

		for ( let i = 0; i < length; i ++ ) data[ i ] = Math.random() * 2 - 1;

	}

	return buffer;

}

function loopSource( ctx, buffer, gainValue ) {

	const src = ctx.createBufferSource();
	src.buffer = buffer;
	src.loop = true;

	const gain = ctx.createGain();
	gain.gain.value = gainValue;
	src.connect( gain );

	return { src, gain };

}

export class Audio {

	constructor() {

		this.ctx = null;
		this.started = false;
		this.enabled = true;
		this._depth = 0;

	}

	/** Call from a click/keypress. Safe to call repeatedly. */
	async start() {

		if ( this.started ) return;

		const Ctx = window.AudioContext || window.webkitAudioContext;
		if ( Ctx === undefined ) return;

		const ctx = new Ctx();
		if ( ctx.state === 'suspended' ) await ctx.resume();

		this.ctx = ctx;
		this.started = true;

		// ---- graph ---------------------------------------------------------
		this.master = ctx.createGain();
		this.master.gain.value = 0.0;
		this.master.connect( ctx.destination );

		// Everything underwater-audible runs through the submersion lowpass.
		this.submersionFilter = ctx.createBiquadFilter();
		this.submersionFilter.type = 'lowpass';
		this.submersionFilter.frequency.value = CUTOFF_AIR;
		this.submersionFilter.Q.value = 0.7;
		this.submersionFilter.connect( this.master );

		// A separate above-water bus that is cross-faded out on submersion,
		// rather than merely filtered — surf should vanish, not go muffled.
		this.airBus = ctx.createGain();
		this.airBus.gain.value = 1;
		this.airBus.connect( this.submersionFilter );

		this.waterBus = ctx.createGain();
		this.waterBus.gain.value = 0;
		this.waterBus.connect( this.submersionFilter );

		const brown = makeNoiseBuffer( ctx, 4, 'brown' );
		const pink = makeNoiseBuffer( ctx, 4, 'pink' );
		const white = makeNoiseBuffer( ctx, 2, 'white' );

		// ---- above water: surf and wind -----------------------------------
		{
			const surf = loopSource( ctx, pink, 0.22 );
			const bp = ctx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = 900;
			bp.Q.value = 0.6;
			surf.gain.connect( bp ).connect( this.airBus );
			surf.src.start();

			// Slow swell in the surf level, so it breathes.
			const lfo = ctx.createOscillator();
			lfo.frequency.value = 0.09;
			const lfoGain = ctx.createGain();
			lfoGain.gain.value = 0.11;
			lfo.connect( lfoGain ).connect( surf.gain.gain );
			lfo.start();

			const wind = loopSource( ctx, brown, 0.10 );
			wind.gain.connect( this.airBus );
			wind.src.start();
		}

		// ---- below water: deep rumble --------------------------------------
		{
			const rumble = loopSource( ctx, brown, 0.5 );
			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = 220;
			rumble.gain.connect( lp ).connect( this.waterBus );
			rumble.src.start();

			// The reef bed: a hiss of snapping shrimp and grazing fish. Real
			// reefs are *loud* and this is what makes the water feel inhabited.
			const crackle = loopSource( ctx, white, 0.035 );
			const hp = ctx.createBiquadFilter();
			hp.type = 'highpass';
			hp.frequency.value = 2600;
			crackle.gain.connect( hp ).connect( this.waterBus );
			crackle.src.start();
			this._crackleGain = crackle.gain;
		}

		this._whaleTimer = 8 + Math.random() * 20;

		// Fade in.
		this.master.gain.setTargetAtTime( 0.85, ctx.currentTime, 1.2 );

	}

	/** A slow, descending moan. Rare, and all the better for it. */
	_whaleSong() {

		const ctx = this.ctx;
		const now = ctx.currentTime;
		const dur = 3.5 + Math.random() * 3;

		const osc = ctx.createOscillator();
		osc.type = 'sine';
		const base = 55 + Math.random() * 45;
		osc.frequency.setValueAtTime( base, now );
		osc.frequency.exponentialRampToValueAtTime( base * 0.55, now + dur );

		const harm = ctx.createOscillator();
		harm.type = 'sine';
		harm.frequency.setValueAtTime( base * 2.02, now );
		harm.frequency.exponentialRampToValueAtTime( base * 1.1, now + dur );

		const gain = ctx.createGain();
		gain.gain.setValueAtTime( 0, now );
		gain.gain.linearRampToValueAtTime( 0.16, now + dur * 0.25 );
		gain.gain.linearRampToValueAtTime( 0, now + dur );

		const harmGain = ctx.createGain();
		harmGain.gain.value = 0.35;

		osc.connect( gain );
		harm.connect( harmGain ).connect( gain );
		gain.connect( this.waterBus );

		osc.start( now ); harm.start( now );
		osc.stop( now + dur ); harm.stop( now + dur );

	}

	/** A short bubble burst — used for fin kicks and surfacing. */
	bubble( strength = 1 ) {

		if ( ! this.started ) return;

		const ctx = this.ctx;
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = 'sine';
		const f = 380 + Math.random() * 900;
		osc.frequency.setValueAtTime( f, now );
		// Rising pitch as the bubble shrinks — the characteristic "bloop".
		osc.frequency.exponentialRampToValueAtTime( f * 2.4, now + 0.10 );

		const gain = ctx.createGain();
		gain.gain.setValueAtTime( 0.05 * strength, now );
		gain.gain.exponentialRampToValueAtTime( 0.0001, now + 0.13 );

		osc.connect( gain ).connect( this.waterBus );
		osc.start( now );
		osc.stop( now + 0.15 );

	}

	/** A warm swell on discovery. */
	sting() {

		if ( ! this.started ) return;

		const ctx = this.ctx;
		const now = ctx.currentTime;
		// A major triad, arriving softly.
		for ( const [ i, ratio ] of [ 1, 1.25, 1.5, 2 ].entries() ) {

			const osc = ctx.createOscillator();
			osc.type = 'triangle';
			osc.frequency.value = 220 * ratio;

			const gain = ctx.createGain();
			const t0 = now + i * 0.06;
			gain.gain.setValueAtTime( 0, t0 );
			gain.gain.linearRampToValueAtTime( 0.09, t0 + 0.12 );
			gain.gain.exponentialRampToValueAtTime( 0.0001, t0 + 2.2 );

			osc.connect( gain ).connect( this.submersionFilter );
			osc.start( t0 );
			osc.stop( t0 + 2.3 );

		}

	}

	/**
	 * @param {number} submersion 0..1 from render/waterFog.js
	 * @param {number} depth      metres below the surface
	 */
	update( dt, submersion, depth ) {

		if ( ! this.started || ! this.enabled ) return;

		const ctx = this.ctx;
		const t = ctx.currentTime;

		// The signature effect. Exponential in submersion so the *moment* of
		// crossing is where most of the change happens.
		const cutoff = CUTOFF_AIR * Math.pow( CUTOFF_WATER / CUTOFF_AIR, submersion );
		this.submersionFilter.frequency.setTargetAtTime( cutoff, t, 0.08 );

		this.airBus.gain.setTargetAtTime( 1 - submersion, t, 0.12 );
		this.waterBus.gain.setTargetAtTime( submersion, t, 0.12 );

		// The reef bed fades out as you leave the shallows for open blue.
		if ( this._crackleGain !== undefined ) {

			const near = Math.max( 0, 1 - Math.max( 0, depth - 6 ) / 22 );
			this._crackleGain.gain.setTargetAtTime( 0.035 * near * submersion, t, 0.5 );

		}

		// Occasional whale song, deep water only.
		this._whaleTimer -= dt;
		if ( this._whaleTimer <= 0 ) {

			this._whaleTimer = 25 + Math.random() * 55;
			if ( submersion > 0.6 && depth > 9 ) this._whaleSong();

		}

	}

	setEnabled( on ) {

		this.enabled = on;
		if ( this.started ) {

			this.master.gain.setTargetAtTime( on ? 0.85 : 0, this.ctx.currentTime, 0.2 );

		}

	}

}

/**
 * Frame clock with a clamped delta and a rolling FPS estimate.
 *
 * The clamp matters: an alt-tab produces a multi-second delta, which without a
 * cap teleports the player through the world (and defeats the substepped
 * collision in game/player.js).
 */

export class Clock {

	constructor( maxDelta = 1 / 15 ) {

		this.maxDelta = maxDelta;
		this.elapsed = 0;
		this.delta = 0;
		this.frame = 0;
		this._last = performance.now();
		this._acc = 0;
		this._accFrames = 0;
		this.fps = 60;
		this.msSmoothed = 16.6;

	}

	tick() {

		const now = performance.now();
		let dt = ( now - this._last ) / 1000;
		this._last = now;

		this.rawDelta = dt;
		if ( dt > this.maxDelta ) dt = this.maxDelta;

		this.delta = dt;
		this.elapsed += dt;
		this.frame ++;

		this._acc += this.rawDelta;
		this._accFrames ++;
		if ( this._acc >= 0.5 ) {

			this.fps = this._accFrames / this._acc;
			this.msSmoothed = ( this._acc / this._accFrames ) * 1000;
			this._acc = 0;
			this._accFrames = 0;

		}

		return dt;

	}

}

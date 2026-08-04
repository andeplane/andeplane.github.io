/**
 * Runtime quality adaptation (DESIGN §5).
 *
 * WebGPU exposes no meaningful way to ask how fast the GPU is, so the preset
 * picked at boot from core counts is a guess. This watches the actual frame
 * time and corrects that guess.
 *
 * Only knobs that can change *without rebuilding pipelines* are used. Fish
 * counts and shader step counts would each trigger a recompile — and a
 * recompile stall is exactly the hitch we are trying to avoid, so "fixing"
 * performance that way would make the symptom worse at the moment it fires.
 */

const SAMPLE_WINDOW = 90;      // frames per decision
const WARMUP_FRAMES = 45;      // ignore: shader compiles and first-use uploads

export class AdaptiveQuality {

	constructor( renderer, quality, { volumetrics = null, targetMs = 17.5, recoverMs = 12.5 } = {} ) {

		this.renderer = renderer;
		this.quality = quality;
		this.volumetrics = volumetrics;
		this.targetMs = targetMs;
		this.recoverMs = recoverMs;

		this.frames = 0;
		this.acc = 0;
		this.samples = 0;
		this.level = 0;             // 0 = full quality
		this.maxLevel = 3;
		this.baseRenderScale = quality.renderScale;
		this.baseVolumetricScale = quality.volumetricScale;
		this.enabled = true;
		this.log = [];

	}

	/** Steps of degradation, cheapest visual loss first. */
	_apply() {

		const q = this.quality;
		const level = this.level;

		// 1: volumetric resolution. 2: render scale. 3: both harder.
		const volScale = level >= 1 ? this.baseVolumetricScale * 0.6 : this.baseVolumetricScale;
		const renderScale =
			level >= 3 ? this.baseRenderScale * 0.62 :
				level >= 2 ? this.baseRenderScale * 0.8 :
					this.baseRenderScale;

		q.volumetricScale = volScale;
		q.renderScale = renderScale;

		if ( this.volumetrics !== null && this.volumetrics.pass !== undefined ) {

			this.volumetrics.pass.setResolutionScale( volScale );

		}

		this.renderer.setPixelRatio(
			Math.min( window.devicePixelRatio, q.maxPixelRatio ) * renderScale
		);

		const note = `quality level ${level} (render ${renderScale.toFixed( 2 )}, volumetric ${volScale.toFixed( 2 )})`;
		this.log.push( note );
		console.log( `[adaptive] ${note}` );

	}

	update( frameMs ) {

		if ( ! this.enabled ) return;

		this.frames ++;
		if ( this.frames < WARMUP_FRAMES ) return;

		this.acc += frameMs;
		this.samples ++;
		if ( this.samples < SAMPLE_WINDOW ) return;

		const mean = this.acc / this.samples;
		this.acc = 0;
		this.samples = 0;

		if ( mean > this.targetMs && this.level < this.maxLevel ) {

			this.level ++;
			this._apply();

		} else if ( mean < this.recoverMs && this.level > 0 ) {

			// Recover slowly, and only when there is real headroom — otherwise
			// it oscillates between two levels every couple of seconds.
			this.level --;
			this._apply();

		}

	}

}

/** In-game HUD: depth gauge, compass, interaction prompt, toasts, dive log. */

const $ = ( id ) => document.getElementById( id );
const CARDINALS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

export class HUD {

	constructor() {

		this.el = $( 'hud' );
		this.depthValue = $( 'depth-value' );
		this.promptEl = $( 'prompt' );
		this.toastsEl = $( 'toasts' );
		this.statsEl = $( 'stats' );
		this.strip = $( 'compass-strip' );
		this.logEl = $( 'log' );
		this.logGrid = $( 'log-grid' );
		this.tint = $( 'vignette-tint' );

		this._buildCompass();
		this._lastDepth = - 1;
		this._promptText = null;
		this.showStats = new URLSearchParams( location.search ).has( 'stats' );

	}

	show() {

		this.el.classList.remove( 'hidden' );

	}

	hide() {

		this.el.classList.add( 'hidden' );

	}

	_buildCompass() {

		// One tick every 15°, repeated three times so it can wrap seamlessly.
		let html = '';
		for ( let rep = 0; rep < 3; rep ++ ) {

			for ( let deg = 0; deg < 360; deg += 15 ) {

				const card = CARDINALS[ deg ];
				html += `<span class="tick ${card ? 'card' : ''}" style="width:38px">${card || '·'}</span>`;

			}

		}

		this.strip.innerHTML = html;
		this.tickWidth = 38;

	}

	updateCompass( headingRad ) {

		// heading 0 = north (-Z). Strip scrolls opposite to turn direction.
		let deg = ( ( headingRad * 180 / Math.PI ) % 360 + 360 ) % 360;
		const pxPerDeg = this.tickWidth / 15;
		const centre = this.strip.parentElement.clientWidth / 2;
		const offset = - ( 360 * pxPerDeg ) - deg * pxPerDeg + centre;
		this.strip.style.transform = `translateX(${offset}px)`;

	}

	updateDepth( y ) {

		const depth = Math.max( 0, - y );
		if ( Math.abs( depth - this._lastDepth ) > 0.05 ) {

			this.depthValue.textContent = depth.toFixed( 1 );
			this._lastDepth = depth;
			// Deepen the screen-edge tint as you descend.
			this.tint.style.opacity = ( 0.55 + Math.min( depth / 30, 1 ) * 0.45 ).toFixed( 2 );

		}

	}

	setPrompt( text ) {

		if ( text === this._promptText ) return;
		this._promptText = text;

		if ( text ) {

			this.promptEl.innerHTML = text;
			this.promptEl.classList.remove( 'hidden' );

		} else {

			this.promptEl.classList.add( 'hidden' );

		}

	}

	toast( { kind = 'discovered', name, flavour } ) {

		const el = document.createElement( 'div' );
		el.className = 'toast';
		el.innerHTML = `<div class="k">${kind}</div><div class="n">${name}</div>` +
			( flavour ? `<div class="f">${flavour}</div>` : '' );
		this.toastsEl.appendChild( el );

		setTimeout( () => {

			el.classList.add( 'out' );
			setTimeout( () => el.remove(), 700 );

		}, 5200 );

	}

	renderLog( entries ) {

		this.logGrid.innerHTML = entries.map( ( e ) => e.found
			? `<div class="log-item found"><div class="n">${e.name}</div><div class="f">${e.flavour}</div></div>`
			: `<div class="log-item"><div class="n q">? ? ?</div><div class="f">${e.hint || 'undiscovered'}</div></div>`
		).join( '' );

	}

	toggleLog( entries ) {

		const hidden = this.logEl.classList.contains( 'hidden' );
		if ( hidden ) this.renderLog( entries );
		this.logEl.classList.toggle( 'hidden' );
		return hidden;

	}

	setStats( text ) {

		if ( ! this.showStats ) return;
		this.statsEl.textContent = text;

	}

}

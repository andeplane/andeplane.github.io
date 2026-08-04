/**
 * Keyboard + pointer-lock mouse look, mapped to named actions so gameplay code
 * never sees a key code.
 */

import { emit } from './events.js';

const BINDINGS = {
	KeyW: 'forward', ArrowUp: 'forward',
	KeyS: 'back', ArrowDown: 'back',
	KeyA: 'left', ArrowLeft: 'left',
	KeyD: 'right', ArrowRight: 'right',
	Space: 'up',
	KeyC: 'down', ControlLeft: 'down', ControlRight: 'down',
	ShiftLeft: 'sprint', ShiftRight: 'sprint',
};

// Edge-triggered (fire once per press, not per frame).
const TAPS = {
	KeyE: 'interact',
	KeyF: 'torch',
	Tab: 'log',
	KeyP: 'stats',
};

export class Input {

	constructor( domElement ) {

		this.dom = domElement;
		this.actions = Object.create( null );
		this.locked = false;
		this.enabled = true;

		// Accumulated mouse delta, consumed once per frame.
		this.dx = 0;
		this.dy = 0;
		this.sensitivity = 0.0022;
		this.invertY = false;

		this._onKeyDown = this._onKeyDown.bind( this );
		this._onKeyUp = this._onKeyUp.bind( this );
		this._onMouseMove = this._onMouseMove.bind( this );
		this._onLockChange = this._onLockChange.bind( this );

		window.addEventListener( 'keydown', this._onKeyDown );
		window.addEventListener( 'keyup', this._onKeyUp );
		document.addEventListener( 'pointerlockchange', this._onLockChange );
		document.addEventListener( 'mousemove', this._onMouseMove );

		// Losing focus must not leave a key stuck down.
		window.addEventListener( 'blur', () => this.releaseAll() );

	}

	requestLock() {

		this.dom.requestPointerLock?.();

	}

	releaseAll() {

		for ( const k in this.actions ) this.actions[ k ] = false;

	}

	is( action ) {

		return this.enabled && this.actions[ action ] === true;

	}

	/** Axis helper: returns -1, 0 or 1. */
	axis( neg, pos ) {

		return ( this.is( pos ) ? 1 : 0 ) - ( this.is( neg ) ? 1 : 0 );

	}

	/** Consume the frame's accumulated look delta. */
	takeLook() {

		const d = { x: this.dx, y: this.dy };
		this.dx = 0; this.dy = 0;
		return d;

	}

	_onKeyDown( e ) {

		if ( TAPS[ e.code ] ) {

			// Tab would move focus out of the canvas.
			e.preventDefault();
			if ( ! e.repeat && this.enabled ) emit( 'input:' + TAPS[ e.code ] );

		}

		const action = BINDINGS[ e.code ];
		if ( action ) {

			if ( e.code === 'Space' ) e.preventDefault();
			this.actions[ action ] = true;

		}

	}

	_onKeyUp( e ) {

		const action = BINDINGS[ e.code ];
		if ( action ) this.actions[ action ] = false;

	}

	_onMouseMove( e ) {

		if ( ! this.locked || ! this.enabled ) return;

		this.dx += e.movementX * this.sensitivity;
		this.dy += e.movementY * this.sensitivity * ( this.invertY ? - 1 : 1 );

	}

	_onLockChange() {

		this.locked = document.pointerLockElement === this.dom;
		if ( ! this.locked ) {

			this.releaseAll();
			emit( 'input:unlocked' );

		} else {

			emit( 'input:locked' );

		}

	}

}

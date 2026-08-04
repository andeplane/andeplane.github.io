/** Loading / unsupported / start screens. */

const $ = ( id ) => document.getElementById( id );

export const Screens = {

	setProgress( fraction, status ) {

		$( 'loading-bar' ).style.width = `${Math.round( fraction * 100 )}%`;
		if ( status !== undefined ) $( 'loading-status' ).textContent = status;

	},

	hideLoading() {

		const el = $( 'loading' );
		el.classList.add( 'hidden' );
		setTimeout( () => el.classList.add( 'gone' ), 900 );

	},

	showUnsupported( detail ) {

		$( 'loading' ).classList.add( 'gone' );
		$( 'unsupported' ).classList.remove( 'hidden' );
		if ( detail ) $( 'unsupported-detail' ).textContent = detail;

	},

	/** Resolves when the player clicks to dive. */
	showStart() {

		return new Promise( ( resolve ) => {

			const el = $( 'start' );
			el.classList.remove( 'hidden' );
			const go = () => {

				el.removeEventListener( 'click', go );
				el.classList.add( 'hidden' );
				setTimeout( () => el.classList.add( 'gone' ), 900 );
				resolve();

			};

			el.addEventListener( 'click', go );

		} );

	},

	/** Bring the start screen back when the player releases the pointer. */
	showPause() {

		const el = $( 'start' );
		el.classList.remove( 'gone', 'hidden' );
		return new Promise( ( resolve ) => {

			const go = () => {

				el.removeEventListener( 'click', go );
				el.classList.add( 'hidden' );
				resolve();

			};

			el.addEventListener( 'click', go );

		} );

	},

};

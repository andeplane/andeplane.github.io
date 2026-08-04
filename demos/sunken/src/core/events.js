/**
 * Minimal event bus. DESIGN §8: triggers and interactions publish here,
 * objectives subscribe. Keeping this dumb is the point — missions must be
 * able to listen to anything without the emitter knowing missions exist.
 */

const listeners = new Map();

export function on( type, fn ) {

	if ( ! listeners.has( type ) ) listeners.set( type, new Set() );
	listeners.get( type ).add( fn );
	return () => off( type, fn );

}

export function once( type, fn ) {

	const un = on( type, ( payload ) => {

		un();
		fn( payload );

	} );
	return un;

}

export function off( type, fn ) {

	listeners.get( type )?.delete( fn );

}

export function emit( type, payload ) {

	const set = listeners.get( type );
	if ( set === undefined ) return;

	// Copy: handlers routinely unsubscribe themselves (see `once`).
	for ( const fn of [ ...set ] ) {

		try {

			fn( payload );

		} catch ( e ) {

			console.error( `[events] handler for "${type}" threw:`, e );

		}

	}

}

/**
 * Worker pool for chunk meshing.
 *
 * DESIGN §3.2 / REVIEW §2: the field sweep costs ~5.3 s single-threaded, so
 * fanning it across cores is what keeps the load under the 8 s budget
 * (~0.35 s on 16 cores, ~1.8 s on 4).
 */

export class MesherPool {

	constructor( size = Math.max( 1, ( navigator.hardwareConcurrency || 4 ) - 1 ) ) {

		this.size = Math.min( size, 12 );
		this.workers = [];
		this.idle = [];
		this.queue = [];
		this.pending = new Map();
		this.nextId = 1;

		for ( let i = 0; i < this.size; i ++ ) {

			const w = new Worker( new URL( './mesher.worker.js', import.meta.url ), { type: 'module' } );
			w.onmessage = ( e ) => this._onMessage( w, e );
			w.onerror = ( e ) => console.error( '[mesher worker]', e.message || e );
			this.workers.push( w );
			this.idle.push( w );

		}

	}

	_onMessage( worker, e ) {

		const { id, result, empty, error, ready } = e.data;
		if ( ready ) return;

		const job = this.pending.get( id );
		this.pending.delete( id );

		this.idle.push( worker );
		this._drain();

		if ( job === undefined ) return;
		if ( error ) job.reject( new Error( error ) );
		else job.resolve( empty ? null : result );

	}

	_drain() {

		while ( this.idle.length > 0 && this.queue.length > 0 ) {

			const worker = this.idle.pop();
			const job = this.queue.shift();
			this.pending.set( job.id, job );
			worker.postMessage( { id: job.id, spec: job.spec } );

		}

	}

	mesh( spec ) {

		return new Promise( ( resolve, reject ) => {

			this.queue.push( { id: this.nextId ++, spec, resolve, reject } );
			this._drain();

		} );

	}

	dispose() {

		for ( const w of this.workers ) w.terminate();
		this.workers.length = 0;
		this.idle.length = 0;

	}

}

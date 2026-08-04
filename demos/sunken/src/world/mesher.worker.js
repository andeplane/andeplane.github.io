/**
 * Mesher worker. Owns its own copy of the field (deterministic from WORLD_SEED,
 * so every worker generates a bit-identical world).
 */

import { initField } from './field.js';
import { meshChunk } from './mesher.js';

initField();

self.onmessage = ( e ) => {

	const { id, spec } = e.data;

	let result = null;
	try {

		result = meshChunk( spec );

	} catch ( err ) {

		self.postMessage( { id, error: String( err && err.stack || err ) } );
		return;

	}

	if ( result === null ) {

		self.postMessage( { id, empty: true } );
		return;

	}

	self.postMessage( { id, result }, [
		result.positions.buffer,
		result.normals.buffer,
		result.sky.buffer,
		result.indices.buffer,
	] );

};

self.postMessage( { ready: true } );

import * as THREE from 'three/webgpu';
import WebGPUCapabilities from 'three/addons/capabilities/WebGPU.js';

/**
 * WebGPURenderer setup.
 *
 * The `requiredLimits` is load-bearing and easy to miss: the GPU boids
 * (life/boids.js) read storage buffers from the *vertex* stage, which needs
 * `maxStorageBuffersInVertexStage` raised at device-creation time. Adding it
 * later means tearing down the device, so it is requested here up front
 * (DESIGN §11 phase 1, REVIEW §1).
 */

export function isWebGPUAvailable() {

	return WebGPUCapabilities.isAvailable();

}

export async function createRenderer( container, quality ) {

	const renderer = new THREE.WebGPURenderer( {
		antialias: false,          // we do our own AA in the post chain
		alpha: false,
		powerPreference: 'high-performance',
		requiredLimits: {
			maxStorageBuffersInVertexStage: 4,
		},
	} );

	renderer.setPixelRatio( Math.min( window.devicePixelRatio, quality.maxPixelRatio ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

	container.appendChild( renderer.domElement );

	await renderer.init();

	return renderer;

}

/**
 * Some devices reject the raised storage-buffer limit. Rather than failing to
 * boot, retry once without it — the boids path checks this flag and falls back
 * to a CPU-updated instance matrix.
 */
export async function createRendererWithFallback( container, quality ) {

	try {

		const r = await createRenderer( container, quality );
		r.userData = { storageInVertex: true };
		return r;

	} catch ( err ) {

		console.warn( '[renderer] raised device limits rejected, retrying without:', err );

		const renderer = new THREE.WebGPURenderer( {
			antialias: false,
			alpha: false,
			powerPreference: 'high-performance',
		} );
		renderer.setPixelRatio( Math.min( window.devicePixelRatio, quality.maxPixelRatio ) );
		renderer.setSize( window.innerWidth, window.innerHeight );
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		container.appendChild( renderer.domElement );
		await renderer.init();
		renderer.userData = { storageInVertex: false };
		return renderer;

	}

}

export function attachResize( renderer, camera, quality, onResize ) {

	const apply = () => {

		const w = window.innerWidth, h = window.innerHeight;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setPixelRatio( Math.min( window.devicePixelRatio, quality.maxPixelRatio ) * quality.renderScale );
		renderer.setSize( w, h );
		onResize?.( w, h );

	};

	window.addEventListener( 'resize', apply );
	apply();
	return apply;

}

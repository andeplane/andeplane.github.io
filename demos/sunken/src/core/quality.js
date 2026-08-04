/**
 * Quality presets (DESIGN §5). Auto-selected from a warm-up measurement,
 * user-overridable via ?quality=low|medium|high.
 *
 * The frame budget in DESIGN §9 is written against `medium` — that is the
 * preset expected to hold 60 fps on an M-series laptop. `high` is explicitly
 * allowed to miss it.
 */

export const PRESETS = {
	low: {
		name: 'low',
		renderScale: 0.75,
		maxPixelRatio: 1,
		volumetric: false,
		volumetricScale: 0.34,
		volumetricSteps: 10,
		shadowMapSize: 1024,
		causticsSize: 512,
		fishTotal: 1200,
		gulls: 60,
		crabs: 60,
		floraTarget: 15000,
		snowParticles: 1500,
		bloom: true,
		dof: false,
		chromatic: false,
		aa: false,
		streamRadius: 4,
		fogDistance: 45,
		terrainVoxel: 0.75,
	},
	medium: {
		name: 'medium',
		renderScale: 1,
		maxPixelRatio: 1.5,
		volumetric: true,
		volumetricScale: 0.45,
		volumetricSteps: 14,
		shadowMapSize: 2048,
		causticsSize: 1024,
		fishTotal: 3000,
		gulls: 150,
		crabs: 120,
		floraTarget: 40000,
		snowParticles: 4000,
		bloom: true,
		dof: false,
		chromatic: false,
		aa: false,
		streamRadius: 5,
		fogDistance: 60,
		terrainVoxel: 0.6,
	},
	high: {
		name: 'high',
		renderScale: 1,
		maxPixelRatio: 2,
		volumetric: true,
		volumetricScale: 0.6,
		volumetricSteps: 20,
		shadowMapSize: 2048,
		causticsSize: 1024,
		fishTotal: 4500,
		gulls: 220,
		crabs: 160,
		floraTarget: 60000,
		snowParticles: 7000,
		bloom: true,
		dof: true,
		chromatic: false,
		aa: false,
		streamRadius: 6,
		fogDistance: 75,
		terrainVoxel: 0.55,
	},
};

/** Order in which quality is sacrificed when we miss frame budget (DESIGN §9). */
export const DEGRADE_ORDER = [ 'dof', 'volumetricScale', 'volumetricSteps', 'fishTotal', 'shadowMapSize', 'renderScale' ];

export function pickPreset() {

	const override = new URLSearchParams( location.search ).get( 'quality' );
	if ( override && PRESETS[ override ] ) return { ...PRESETS[ override ] };

	// No reliable GPU capability query in WebGPU, so guess conservatively from
	// coarse signals, then let the runtime auto-degrade if we guessed high.
	const cores = navigator.hardwareConcurrency || 4;
	const mem = navigator.deviceMemory || 4;
	const mobile = /Android|iPhone|iPad/i.test( navigator.userAgent );

	if ( mobile || cores <= 4 || mem <= 4 ) return { ...PRESETS.low };
	if ( cores >= 10 ) return { ...PRESETS.high };
	return { ...PRESETS.medium };

}

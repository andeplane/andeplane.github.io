import * as THREE from 'three/webgpu';
import { pass, uniform, screenUV } from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

import { isWebGPUAvailable, createRendererWithFallback, attachResize } from './core/renderer.js';
import { pickPreset } from './core/quality.js';
import { Clock } from './core/clock.js';
import { Input } from './core/input.js';
import { on } from './core/events.js';
import { Screens } from './ui/screens.js';
import { HUD } from './ui/hud.js';
import { Player } from './game/player.js';

import { initField, field, heightAt, caveSystems, surfaceBelow, skyVisibilityAt, WORLD } from './world/field.js';
import { Terrain } from './world/chunks.js';
import { FieldCollider } from './world/collider.js';
import { createTerrainMaterial } from './render/terrainMaterial.js';
import { createSkyDome, createSunLight, SUN } from './render/sky.js';
import { createOcean } from './render/ocean.js';
import { createWaterFogNode, updateSubmersion, updateCaveExposure, waterParams } from './render/waterFog.js';
import { updateFrameUniforms } from './render/frame.js';
import { waveHeight } from './world/waves.js';
import { Caustics } from './render/caustics.js';
import { Torch } from './game/torch.js';
import { Flora } from './life/flora.js';
import { createFishSchools, createGulls } from './life/schools.js';
import { Crabs } from './life/crabs.js';
import { Interactions } from './game/interact.js';
import { TreasureChest } from './props/chest.js';
import { createBoats } from './props/boats.js';
import { createMarineSnow, createBubbles } from './life/particles.js';
import { createPostChain } from './render/post.js';
import { Audio } from './audio/audio.js';
import { AdaptiveQuality } from './core/adaptive.js';
import { Volumetrics } from './render/volumetrics.js';
import { Bioluminescence } from './render/biolum.js';

async function boot() {

	if ( ! isWebGPUAvailable() ) {

		Screens.showUnsupported( 'navigator.gpu is undefined' );
		return;

	}

	const params = new URLSearchParams( location.search );
	const quality = pickPreset();
	const container = document.getElementById( 'app' );

	Screens.setProgress( 0.03, 'starting gpu' );

	let renderer;
	try {

		renderer = await createRendererWithFallback( container, quality );

	} catch ( err ) {

		console.error( err );
		Screens.showUnsupported( String( err && err.message || err ) );
		return;

	}

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera( 62, window.innerWidth / window.innerHeight, 0.15, 9000 );

	const input = new Input( renderer.domElement );
	const hud = new HUD();
	const clock = new Clock();
	const player = new Player( camera, input );

	attachResize( renderer, camera, quality );

	// ---- world ------------------------------------------------------------
	Screens.setProgress( 0.06, 'seeding the reef' );
	initField();
	const systems = caveSystems();

	// ---- sky, sun, water volume ------------------------------------------
	scene.add( createSkyDome( new THREE.Color( 0x0a3766 ) ) );

	const sun = createSunLight( quality.shadowMapSize );
	scene.add( sun );
	scene.add( sun.target );

	// The shadow camera is a tight box that follows the player rather than one
	// that covers the whole 300 m world: at 2048² a world-sized box gives ~15 cm
	// texels, which is far too coarse for cave mouths and coral to read.
	const SHADOW_RADIUS = 70;
	{
		const c = sun.shadow.camera;
		c.left = - SHADOW_RADIUS; c.right = SHADOW_RADIUS;
		c.top = SHADOW_RADIUS; c.bottom = - SHADOW_RADIUS;
		c.near = 1; c.far = 420;
		c.updateProjectionMatrix();
	}

	// Ambient: bright blue-green from above, dark from below. Underwater this
	// stands in for the sky's diffuse contribution.
	// Near-white from above rather than saturated blue: the water already tints
	// everything on the way to the eye, and tinting the *light* as well double-
	// counts it and leaves corals with no colour left to lose.
	const ambient = new THREE.HemisphereLight( 0xd8ecff, 0x12283f, 1.05 );
	scene.add( ambient );

	// Per-channel extinction applies to every material in the scene.
	scene.fogNode = createWaterFogNode();

	const ocean = createOcean();
	scene.add( ocean );

	const caustics = new Caustics( renderer, {
		size: quality.causticsSize,
		extent: 48,
		referenceDepth: - 18,
	} );

	const terrainMaterial = createTerrainMaterial( { caustics } );
	const terrain = new Terrain( scene, terrainMaterial, quality.terrainVoxel );

	const t0 = performance.now();
	const stats = await terrain.build( ( done, total ) => {

		Screens.setProgress( 0.06 + 0.72 * ( done / total ), `carving the reef  ${done}/${total}` );

	} );
	const buildMs = performance.now() - t0;

	console.log( `[world] ${stats.meshed} chunks meshed, ${stats.empty} empty, ` +
		`${( stats.triangles / 1000 ).toFixed( 0 )}k tris, ${( stats.vertices / 1000 ).toFixed( 0 )}k verts, ` +
		`${buildMs.toFixed( 0 )} ms` );
	console.log( `[world] ${systems.length} cave systems`, systems.map( s => s.id ).join( ', ' ) );

	// ---- life -------------------------------------------------------------
	Screens.setProgress( 0.80, 'planting the reef' );
	const flora = new Flora( scene, { budget: quality.floraTarget, caustics } );
	const floraCount = flora.build();
	console.log( `[flora] ${floraCount} instances across ${flora.meshes.length} species` );

	// ---- fauna -------------------------------------------------------------
	Screens.setProgress( 0.84, 'releasing the fish' );
	const flocks = createFishSchools( scene, quality.fishTotal );
	flocks.push( createGulls( scene, quality.gulls ) );
	const fishTotal = flocks.reduce( ( n, f ) => n + f.count, 0 );
	const crabs = new Crabs( scene, { count: quality.crabs, caustics } );
	const boats = createBoats( scene );

	// Ambient particles. Vents are seeded on the seabed near cave mouths, where
	// gas actually escapes the rock.
	const snow = createMarineSnow( scene, { count: quality.snowParticles } );
	const vents = [];
	for ( const system of systems ) {

		for ( const mouth of system.mouths ) {

			const vy = surfaceBelow( mouth.x + 2, mouth.y + 4, mouth.z + 2, 12, 0.3 );
			if ( vy !== null ) vents.push( { x: mouth.x + 2, y: vy, z: mouth.z + 2 } );

		}

	}

	const bubbles = vents.length > 0 ? createBubbles( scene, vents ) : null;
	console.log( `[fauna] ${fishTotal} fish across ${flocks.length} flocks, ${crabs.count} crabs` );

	// ---- volumetric light shafts -----------------------------------------
	const volumetrics = quality.volumetric
		? new Volumetrics( { steps: quality.volumetricSteps, caustics } )
		: null;

	if ( volumetrics !== null ) {

		scene.add( volumetrics.mesh );
		// Lights must opt into the volumetric layer or the raymarch sees nothing.
		volumetrics.registerLight( sun );

	}

	const biolum = new Bioluminescence( scene, { maxLights: 8, volumetrics } );

	player.setCollider( new FieldCollider() );

	const torch = new Torch( scene, camera );
	on( 'input:torch', () => torch.toggle() );

	// ---- interaction + the hero easter egg ---------------------------------
	const interactions = new Interactions( camera, hud );
	on( 'input:interact', () => interactions.trigger() );

	const chest = placeChest( scene, systems );

	if ( chest !== null ) {

		interactions.register( {
			id: 'chest_main',
			position: chest.position.clone().setY( chest.position.y + 0.5 ),
			radius: 3.6,
			prompt: 'Open the chest',
			enabled: () => chest.opened === false,
			onInteract: () => {

				chest.open();
				hud.toast( {
					kind: 'discovered',
					name: "The Captain's Hoard",
					flavour: 'Gold, and something colder that catches the light.',
				} );
				audio.sting();

			},
		} );

	}

	// ---- spawn ------------------------------------------------------------
	// PRD §3.1: float at the surface with the island ahead.
	placeSpawn( player, params, systems );

	// ---- render pipeline ---------------------------------------------------
	// The volumetric shafts are a separate quarter-res pass restricted to the
	// volumetric layer, denoised and added back. Feeding the main pass's depth
	// into the volume material is what makes terrain occlude the beams.
	const renderPipeline = new THREE.RenderPipeline( renderer );
	const scenePass = pass( scene, camera );

	let volumetricNode = null;

	if ( volumetrics !== null ) {

		volumetrics.material.depthNode = scenePass.getTextureNode( 'depth' ).sample( screenUV );

		const volumetricPass = pass( scene, camera, { depthBuffer: false } );
		volumetricPass.name = 'Volumetric Lighting';
		volumetricPass.setLayers( volumetrics.layer );
		volumetricPass.setResolutionScale( quality.volumetricScale );

		volumetrics.pass = volumetricPass;   // so AdaptiveQuality can rescale it
		// The volumetric pass is rendered below native resolution and upscaled,
		// so the blur is not decoration — it is what hides the upscale. Too
		// little and the shafts arrive as visible blocks with stair-stepped
		// edges, which is exactly what a low step count plus a quarter-res
		// buffer looks like.
		volumetricNode = gaussianBlur( volumetricPass, uniform( 1.4 ) ).mul( volumetrics.intensity );

	}

	const adaptive = new AdaptiveQuality( renderer, quality, { volumetrics } );
	if ( params.has( 'noadapt' ) ) adaptive.enabled = false;

	const post = createPostChain( scenePass, volumetricNode, quality );
	renderPipeline.outputNode = post.node;

	Screens.setProgress( 0.90, 'warming shaders' );
	await renderer.compileAsync( scene, camera );

	Screens.setProgress( 1, 'ready' );
	await new Promise( ( r ) => setTimeout( r, 200 ) );
	Screens.hideLoading();

	// Audio must start from a user gesture; the dive click is that gesture.
	const audio = new Audio();

	await Screens.showStart();
	audio.start();
	input.requestLock();
	hud.show();

	on( 'input:unlocked', async () => {

		input.enabled = false;
		await Screens.showPause();
		input.enabled = true;
		input.requestLock();

	} );

	on( 'input:stats', () => {

		hud.showStats = ! hud.showStats;
		if ( ! hud.showStats ) hud.statsEl.textContent = '';

	} );

	// The player samples the same Gerstner field the surface shader draws, so
	// buoyancy and the waterline agree with what you can see (DESIGN §6.1).
	player.surfaceHeightAt = ( x, z ) => waveHeight( x, z, clock.elapsed );

	renderer.setAnimationLoop( () => {

		const dt = clock.tick();
		updateFrameUniforms( clock.elapsed );

		player.update( dt );
		torch.update( dt );

		for ( const flock of flocks ) flock.update( renderer, dt, player.position );
		crabs.update( dt, player.position );
		if ( chest !== null ) chest.update( dt );
		interactions.update( player.position );
		for ( const boat of boats ) boat.update( clock.elapsed );
		snow.follow( player.position.x, player.position.y, player.position.z );

		// Keep the surface grid centred on the player, snapped to its cells.
		ocean.userData.follow( player.position.x, player.position.z );

		// Caustics and shadows both follow the player so their limited
		// resolution is spent where it can actually be seen.
		caustics.follow( player.position.x, player.position.z );
		caustics.render();

		sun.position.set(
			player.position.x + SUN.direction.x * 200,
			player.position.y + SUN.direction.y * 200,
			player.position.z + SUN.direction.z * 200,
		);
		sun.target.position.copy( player.position );
		sun.target.updateMatrixWorld();

		// One sky-visibility sample per frame darkens the water volume (and the
		// shafts) when the player is inside a cave.
		const exposure = updateCaveExposure(
			skyVisibilityAt( player.position.x, player.position.y, player.position.z ),
			dt,
		);

		if ( volumetrics !== null ) {

			volumetrics.follow( player.position.x, player.position.z );
			volumetrics.intensity.value = 0.55 * ( 0.15 + exposure * 0.85 );

		}
		biolum.update( clock.elapsed );

		const submersion = updateSubmersion(
			player.position.y,
			waveHeight( player.position.x, player.position.z, clock.elapsed ),
			dt,
		);

		audio.update( dt, submersion, Math.max( 0, - player.position.y ) );

		// Fin-kick bubbles while sprinting underwater.
		if ( player.sprinting === true && submersion > 0.5 && Math.random() < dt * 6 ) audio.bubble( 0.7 );

		hud.updateDepth( player.position.y );
		hud.updateCompass( player.heading );
		hud.setStats(
			`${clock.fps.toFixed( 0 )} fps  ${clock.msSmoothed.toFixed( 1 )} ms   [${quality.name}]\n` +
			`x ${player.position.x.toFixed( 1 )}  y ${player.position.y.toFixed( 1 )}  z ${player.position.z.toFixed( 1 )}\n` +
			`terrain ${stats.meshed} chunks  ${( stats.triangles / 1000 ).toFixed( 0 )}k tris\n` +
			`flora ${floraCount}  fish ${fishTotal}  crabs ${crabs.count}`
		);

		adaptive.update( clock.rawDelta * 1000 );

		renderPipeline.render();

	} );

	window.__game = {
		renderer, scene, camera, player, clock, quality, hud, input, terrain, systems, stats, caustics, torch, sun, flora, volumetrics, biolum, renderPipeline, flocks, crabs, chest, interactions, boats, snow, bubbles, post, audio, adaptive,
		// World queries, so debugging and automated screenshots can find valid
		// viewpoints instead of guessing coordinates.
		field, heightAt, surfaceBelow, WORLD,
		/** Freeze player physics, so a posed screenshot holds its position. */
		freeze( on = true ) {

			player.frozen = on;
			return on;

		},
		/** Drop the camera into open water above the seabed at (x, z). */
		look( x, z, height = 5, yaw = 0, pitch = 0 ) {

			const h = heightAt( x, z );
			player.position.set( x, h + height, z );
			player.velocity.set( 0, 0, 0 );
			player.yaw = yaw; player.pitch = pitch;
			return { x, y: h + height, z, seabed: h };

		},
	};

}

/**
 * Put the chest on the floor of the largest cave chamber (PRD §6.1: the
 * cathedral). Grounded against the real field so it never floats or sinks.
 */
function placeChest( scene, systems ) {

	let best = null, bestSize = - Infinity;

	for ( const system of systems ) {

		for ( const chamber of system.chambers ) {

			const size = chamber.rx * chamber.ry * chamber.rz;
			if ( size > bestSize ) { bestSize = size; best = chamber; }

		}

	}

	if ( best === null ) return null;

	// Offset from dead centre so it sits against a wall, and drop it onto the
	// actual chamber floor rather than the ellipsoid's nominal bottom.
	const x = best.cx + best.rx * 0.35;
	const z = best.cz + best.rz * 0.2;
	const y = surfaceBelow( x, best.cy + best.ry * 0.5, z, best.ry * 2 + 6, 0.25 );
	if ( y === null ) return null;

	const chest = new TreasureChest(
		scene,
		new THREE.Vector3( x, y, z ),
		Math.atan2( best.cx - x, best.cz - z ),
		{ groundYAt: ( gx, gz ) => surfaceBelow( gx, y + 2, gz, 8, 0.25 ) ?? y },
	);

	console.log( `[chest] placed at ${x.toFixed( 1 )}, ${y.toFixed( 1 )}, ${z.toFixed( 1 )}` );
	return chest;

}

function placeSpawn( player, params, systems ) {

	// ?spawn=cave drops you at a cave mouth — used while building phase 2.
	const where = params.get( 'spawn' );

	if ( where === 'cave' && systems.length > 0 ) {

		const m = systems[ 0 ].mouths[ 0 ];
		player.position.set( m.x, m.y + 1, m.z );
		const inner = systems[ 0 ].nodes[ 1 ] || m;
		player.yaw = Math.atan2( - ( inner.x - m.x ), - ( inner.z - m.z ) );
		return;

	}

	if ( where === 'chest' && window.__chestPos !== undefined ) {

		const c = window.__chestPos;
		player.position.set( c.x - 2.5, c.y + 1.2, c.z - 2.5 );
		player.yaw = Math.atan2( - 2.5, - 2.5 );
		return;

	}

	if ( where === 'reef' ) {

		player.position.set( 0, - 16, 60 );
		player.yaw = Math.atan2( - ( WORLD.islandX - 0 ), - ( WORLD.islandZ - 60 ) );
		return;

	}

	// Default (PRD §3.1): floating at the surface, over reef deep enough to be
	// worth descending into, with the island in view for orientation.
	//
	// Searched rather than hard-coded so it survives any re-tuning of the
	// terrain noise — a spawn buried inside the island is an easy regression.
	let best = null, bestScore = - Infinity;

	for ( let a = 0; a < 48; a ++ ) {

		const ang = ( a / 48 ) * Math.PI * 2;
		for ( let rad = 55; rad <= 120; rad += 5 ) {

			const x = WORLD.islandX + Math.cos( ang ) * rad;
			const z = WORLD.islandZ + Math.sin( ang ) * rad;
			if ( Math.hypot( x, z ) > WORLD.edgeRadius - 25 ) continue;

			const h = heightAt( x, z );
			if ( h > - 13 || h < - 26 ) continue;   // want the −13…−26 m band below us

			// Prefer close to the island (so it fills the view) and a clear
			// line of sight to it.
			let clear = true;
			for ( let t = 0.15; t < 0.85; t += 0.1 ) {

				const sxx = x + ( WORLD.islandX - x ) * t;
				const szz = z + ( WORLD.islandZ - z ) * t;
				if ( heightAt( sxx, szz ) > 2 ) { clear = false; break; }

			}

			const score = - rad * 0.05 + ( clear ? 3 : 0 ) + ( h + 26 ) * 0.02;
			if ( score > bestScore ) { bestScore = score; best = { x, z }; }

		}

	}

	const sx = best ? best.x : 0, sz = best ? best.z : - 90;
	player.position.set( sx, 0.4, sz );
	player.yaw = Math.atan2( - ( WORLD.islandX - sx ), - ( WORLD.islandZ - sz ) );
	player.pitch = - 0.05;

}

boot().catch( ( err ) => {

	console.error( err );
	Screens.showUnsupported( String( err && err.message || err ) );

} );

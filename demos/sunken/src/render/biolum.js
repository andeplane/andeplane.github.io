import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, float, uniform, sin, clamp, mix, positionLocal, attribute } from 'three/tsl';

import { uTime } from './frame.js';
import { caveSystems } from '../world/field.js';
import { stream } from '../core/rng.js';

/**
 * Bioluminescent coral in the deep cave chambers (PRD §4.3).
 *
 * These are real `PointLight`s, not just emissive geometry: the chambers are
 * genuinely dark (the mesher bakes sky visibility to zero in there), so
 * something has to actually light them, and a light that also registers with
 * the volumetric layer glows *through* the water instead of sitting flat on the
 * rock.
 *
 * Kept deliberately few — point lights are the expensive kind, and a handful of
 * bright ones in the dark reads better than a hundred dim ones.
 */

const PALETTE = [ 0x49c8ff, 0x6affd0, 0x9a7bff, 0x3fe0a8 ];

export class Bioluminescence {

	constructor( scene, { maxLights = 10, volumetrics = null } = {} ) {

		this.group = new THREE.Group();
		this.group.name = 'biolum';
		scene.add( this.group );

		this.lights = [];
		this.clusters = [];

		const rnd = stream( 'biolum' );
		const systems = caveSystems().filter( ( s ) => s.chambers.length > 0 );

		let budget = maxLights;

		for ( const system of systems ) {

			for ( const chamber of system.chambers ) {

				if ( budget <= 0 ) break;

				const colour = new THREE.Color( PALETTE[ Math.floor( rnd() * PALETTE.length ) ] );

				// Sit the cluster on the chamber floor, offset from the centre so
				// it lights one wall rather than flooding the whole void evenly.
				const a = rnd() * Math.PI * 2;
				const r = chamber.rx * 0.45;
				const x = chamber.cx + Math.cos( a ) * r;
				const z = chamber.cz + Math.sin( a ) * r;
				const y = chamber.cy - chamber.ry * 0.45;

				const light = new THREE.PointLight( colour, 9, 26, 1.7 );
				light.position.set( x, y + 0.6, z );
				light.castShadow = false;
				if ( volumetrics !== null ) volumetrics.registerLight( light );
				this.group.add( light );
				this.lights.push( { light, base: 9, phase: rnd() * Math.PI * 2, speed: 0.4 + rnd() * 0.5 } );

				this.group.add( this._cluster( x, y, z, colour, rnd ) );

				budget --;

			}

		}

	}

	/** A knot of glowing polyps so the light has a visible source. */
	_cluster( x, y, z, colour, rnd ) {

		const geo = new THREE.IcosahedronGeometry( 0.13, 1 );
		const count = 22;

		const material = new THREE.MeshBasicNodeMaterial( { toneMapped: true } );
		const iPhase = attribute( 'iPhase', 'float' );

		material.colorNode = Fn( () => {

			// Slow individual pulsing, so the cluster shimmers rather than
			// blinking as one object.
			const pulse = sin( uTime.mul( 1.1 ).add( iPhase ) ).mul( 0.5 ).add( 0.5 );
			return vec4( vec3( colour ).mul( float( 1.4 ).add( pulse.mul( 2.4 ) ) ), 1 );

		} )();

		const mesh = new THREE.InstancedMesh( geo, material, count );
		mesh.frustumCulled = false;

		const phases = new Float32Array( count );
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const p = new THREE.Vector3();
		const s = new THREE.Vector3();

		for ( let i = 0; i < count; i ++ ) {

			const a = rnd() * Math.PI * 2;
			const rad = rnd() * 1.6;
			p.set( x + Math.cos( a ) * rad, y + rnd() * 0.9, z + Math.sin( a ) * rad );
			s.setScalar( 0.4 + rnd() * 0.9 );
			q.setFromAxisAngle( new THREE.Vector3( rnd(), rnd(), rnd() ).normalize(), rnd() * 3 );
			m.compose( p, q, s );
			mesh.setMatrixAt( i, m );
			phases[ i ] = rnd() * Math.PI * 2;

		}

		mesh.instanceMatrix.needsUpdate = true;
		geo.setAttribute( 'iPhase', new THREE.InstancedBufferAttribute( phases, 1 ) );

		return mesh;

	}

	update( elapsed ) {

		for ( const entry of this.lights ) {

			const pulse = Math.sin( elapsed * entry.speed + entry.phase ) * 0.5 + 0.5;
			entry.light.intensity = entry.base * ( 0.55 + pulse * 0.75 );

		}

	}

}

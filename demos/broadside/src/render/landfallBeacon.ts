import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Rng } from "../sim/rng";
import { IslandScenery, vec } from "./landfallScenery";

const tau = Math.PI * 2;
const iron = "#364e50";
const brass = "#be9963";

function masonry(s: IslandScenery) {
  const w = 640,
    h = 512;
  const texture = new DynamicTexture("hand-laid, salt-worn limewash", { width: w, height: h }, s.scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const rng = new Rng(s.seed ^ 0x9e124ef);
  const rows = 24,
    blocks = 24,
    rowHeight = h / rows,
    blockWidth = w / blocks;
  for (let j = 0; j < rows; j++) {
    const red = (j >= 6 && j <= 10) || (j >= 17 && j <= 20);
    const palette = red
      ? ["#b54d35", "#be503a", "#b54a36", "#bc5541"]
      : ["#e5d2ad", "#e9d9b8", "#eddcba", "#e8d4b1"];
    const y = j * rowHeight,
      shift = (j % 2) * blockWidth * 0.5;
    ctx.fillStyle = red ? "#9d4b38" : "#b6a68c";
    ctx.fillRect(0, y, w, rowHeight + 1);
    let left = -blockWidth + shift;
    for (let i = -1; i <= blocks; i++) {
      const right = (i + 1) * blockWidth + shift + rng.range(-2, 2);
      ctx.fillStyle = rng.pick(palette);
      ctx.fillRect(left + 0.65, y + 0.8, right - left - 0.8, rowHeight - 0.75);
      left = right;
    }
  }
  // Missing paint flakes collect on mortar courses and trickle down below the gallery.
  for (let i = 0; i < 5200; i++) {
    const x = rng.next() * w,
      y = rng.next() * h;
    ctx.fillStyle =
      rng.next() < 0.52
        ? `rgba(118,88,65,${rng.range(0.09, 0.24)})`
        : `rgba(244,222,176,${rng.range(0.14, 0.39)})`;
    ctx.fillRect(x, y, rng.range(0.5, 2.6), rng.range(0.65, 3.7));
  }
  for (let i = 0; i < 36; i++) {
    const x = rng.next() * w,
      y = rng.next() < 0.6 ? 0 : rng.range(0, h);
    const tall = rng.range(8, 55);
    const fade = ctx.createLinearGradient(x, y, x, y + tall);
    fade.addColorStop(0, "rgba(105,83,60,.16)");
    fade.addColorStop(1, "rgba(105,83,60,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(x, y, rng.range(1.5, 5.2), tall);
  }
  texture.update();
  texture.anisotropicFilteringLevel = 4;
  const m = new StandardMaterial("painted lighthouse masonry", s.scene);
  m.diffuseTexture = texture;
  m.specularColor.setAll(0.038);
  return m;
}

function tower(s: IslandScenery) {
  const { x, z } = s.site.landmark,
    y = s.floor(x, z) - 0.18;
  const at = (dy: number) => vec(x, y + dy, z);
  const ring = (name: string, lo: number, hi: number, bottom: number, top: number, color: string) =>
    s.pole(name, at(lo), at(hi), bottom, top, color, 40);
  ring("battered granite footing", -1.4, 0.18, 5.12, 4.86, "#8a8271");
  ring("limestone doorstep plinth", 0.17, 0.53, 4.86, 4.73, "#b7ab90");
  ring("rounded plinth cap", 0.52, 0.71, 4.8, 4.52, "#dfcb9f");
  s.pole("tapered brick light tower", at(0.66), at(8.3), 4.38, 2.56, "#ffffff", 48, masonry(s));
  ring("corbel, lower drip moulding", 8.24, 8.39, 2.66, 2.94, "#e9d5aa");
  ring("corbel, flared stone cornice", 8.37, 8.67, 2.91, 3.53, "#a69779");
  ring("weathered gallery underside", 8.65, 8.79, 3.51, 4.03, "#656555");
  ring("gallery edge moulding", 8.78, 8.94, 4.03, 3.98, "#3b5352");
  ring("light-room sill", 8.93, 9.12, 2.33, 2.35, "#bba071");
  const radius = (h: number) => 2.19 - ((h - 0.66) / (8.3 - 0.66)) * 0.91;
  const orientation = Math.atan2(s.site.spawn.x - x, s.site.spawn.z - z);
  const facade = (angle: number, h: number, side: number, offset: number) => {
    const r = radius(h) + offset;
    return vec(
      x + r * Math.sin(angle) + side * Math.cos(angle),
      y + h,
      z + r * Math.cos(angle) - side * Math.sin(angle),
    );
  };
  function opening(angle: number, base: number, width: number, height: number, door = false) {
    const shoulder = base + height - width * 0.5;
    const a = facade(angle, base, -width * 0.5, 0.042),
      b = facade(angle, base, width * 0.5, 0.042);
    const c = facade(angle, shoulder, width * 0.5, 0.042),
      d = facade(angle, shoulder, -width * 0.5, 0.042);
    const shade = door ? "#32534c" : "#284a51";
    s.triangle(a, b, c, shade);
    s.triangle(a, c, d, shade);
    const mid = facade(angle, shoulder, 0, 0.043);
    const rim = door ? 0.165 : 0.095;
    for (const side of [-1, 1]) {
      s.pole(
        "cut stone jamb",
        facade(angle, base, side * (width * 0.5 + 0.035), 0.068),
        facade(angle, shoulder, side * (width * 0.5 + 0.035), 0.068),
        rim,
        rim,
        "#c0ad89",
        8,
        s.stone,
      );
    }
    for (let i = 0; i < 10; i++) {
      const point = (i: number) => {
        const a = (Math.PI * i) / 10;
        return facade(angle, shoulder + width * 0.5 * Math.sin(a), width * 0.5 * Math.cos(a), 0.047);
      };
      const p = point(i),
        q = point(i + 1);
      s.triangle(mid, p, q, shade);
      s.pole("rounded voussoir", p, q, rim, rim, i % 3 === 0 ? "#aa9674" : "#cfb991", 7, s.stone);
    }
    s.pole(
      "projecting sill",
      facade(angle, base, -width * 0.66, 0.11),
      facade(angle, base, width * 0.66, 0.11),
      rim * 1.5,
      rim * 1.5,
      "#c9b796",
      7,
      s.stone,
    );
    if (door) {
      for (let i = -2; i <= 2; i++)
        s.pole(
          "door boards",
          facade(angle, base + 0.05, (i * width) / 6, 0.057),
          facade(angle, shoulder - 0.05, (i * width) / 6, 0.057),
          0.017,
          0.017,
          "#69816a",
          5,
        );
      const latch = facade(angle, base + height * 0.45, width * 0.32, 0.09);
      s.boulder(latch.x, latch.y, latch.z, 0.055, 0.055, 0.055, brass, s.matte);
    } else {
      s.pole(
        "window light",
        facade(angle, base + 0.06, 0, 0.061),
        facade(angle, base + height - 0.09, 0, 0.061),
        0.038,
        0.04,
        brass,
        6,
      );
      s.pole(
        "transom",
        facade(angle, shoulder, -width * 0.46, 0.061),
        facade(angle, shoulder, width * 0.46, 0.061),
        0.045,
        0.045,
        brass,
        6,
      );
    }
  }
  opening(orientation, 0.78, 1.03, 1.92, true);
  for (let i = 0; i < 5; i++) {
    const p = facade(orientation, 0.61 - i * 0.13, 0, 0.14 + i * 0.29);
    const step = s.stoneBlock("keeper’s stone stair", p.x, p.y, p.z, 1.52, 0.23, 0.48, "#baac90");
    step.rotation.y = orientation;
  }
  for (let i = 0; i < 4; i++) opening(orientation + 0.36 + i * 1.65, 3.05 + i * 1.08, 0.48, 0.9);
  for (let i = 0; i < 16; i++) {
    const a = (i * tau) / 16,
      b = ((i + 1) * tau) / 16,
      r = 1.88;
    const point = (ang: number, h: number, d = r) => vec(x + d * Math.sin(ang), y + h, z + d * Math.cos(ang));
    s.pole("gallery stanchion", point(a, 8.91), point(a, 9.65), 0.068, 0.056, iron, 6);
    for (const h of [9.18, 9.6])
      s.pole(
        "wrought gallery rail",
        point(a, h),
        point(b, h),
        h > 9.4 ? 0.083 : 0.044,
        h > 9.4 ? 0.083 : 0.044,
        iron,
        6,
      );
    if (i % 2 === 0)
      s.pole("gallery support knee", point(a, 8.1, 1.31), point(a, 8.73, 1.85), 0.115, 0.13, iron, 7);
  }
  // The curved copper roof is formed by overlapping sheets with raised standing seams.
  const roof = [
    [10.85, 1.48],
    [10.96, 1.53],
    [11.12, 1.36],
    [11.4, 1.12],
    [11.61, 0.8],
    [11.72, 0.44],
    [11.84, 0.19],
  ];
  for (let i = 1; i < roof.length; i++) {
    const [lo, rb] = roof[i - 1]!,
      [hi, rt] = roof[i]!;
    ring(
      "aged copper lantern roof",
      lo!,
      hi!,
      rb! * 2,
      rt! * 2,
      ["#536c61", "#647a67", "#6e806b", "#7e866a", "#8d896b", "#9c926f"][i - 1]!,
    );
    for (let j = 0; j < 8; j++) {
      const a = (tau * j) / 8;
      const p = (r: number, h: number) =>
        vec(x + Math.sin(a) * (r + 0.012), y + h, z + Math.cos(a) * (r + 0.012));
      s.pole("rolled copper seam", p(rb!, lo!), p(rt!, hi!), 0.035, 0.034, "#b19c76", 5);
    }
  }
  ring("lantern eave", 10.75, 10.9, 2.42, 3.14, "#42564c");
  ring("gilded finial", 11.81, 12.38, 0.19, 0.035, brass);
  s.boulder(x, y + 11.98, z, 0.15, 0.18, 0.15, "#c29b57", s.matte);
  s.solid(x, z, 2.1, 2.1, 12.3);
  return { x, y, z };
}

function lantern(s: IslandScenery, x: number, y: number, z: number, night: boolean) {
  const base = y + 9.12,
    cap = y + 10.75,
    radius = 1.1;
  const position = vec(x, (base + cap) * 0.5, z);
  const panes = new StandardMaterial("blue-green cylinder glass", s.scene);
  panes.diffuseColor = Color3.FromHexString("#91bdb6");
  panes.specularColor.set(0.55, 0.67, 0.61);
  panes.specularPower = 72;
  panes.alpha = night ? 0.1 : 0.16;
  const glass = MeshBuilder.CreateCylinder(
    "lantern glazing",
    { height: cap - base, diameter: radius * 2, tessellation: 8, cap: 0 },
    s.scene,
  );
  glass.position.copyFrom(position);
  glass.material = panes;
  glass.isPickable = false;
  for (let i = 0; i < 8; i++) {
    const a = (i * tau) / 8,
      b = ((i + 1) * tau) / 8;
    const p = (ang: number, h: number) => vec(x + radius * Math.sin(ang), h, z + radius * Math.cos(ang));
    s.pole("lantern window post", p(a, base), p(a, cap), 0.081, 0.073, iron, 8);
    s.pole("crossed lamp-room astragal", p(a, base + 0.06), p(b, cap - 0.06), 0.033, 0.033, brass, 5);
    s.pole("crossed lamp-room astragal", p(b, base + 0.06), p(a, cap - 0.06), 0.033, 0.033, brass, 5);
  }
  const rotor = new TransformNode("clockwork optic carriage", s.scene);
  rotor.position.copyFrom(position);
  const lightGlass = new StandardMaterial("lit ridges of the bullseye optic", s.scene);
  lightGlass.diffuseColor.set(0.96, 0.72, 0.27);
  lightGlass.emissiveColor.set(1, 0.63, 0.19);
  lightGlass.specularColor.set(1, 0.94, 0.74);
  lightGlass.specularPower = 92;
  const form = [vec(0.001, 0.16, 0)];
  for (let i = 1; i <= 7; i++) {
    const r = i * 0.072;
    form.push(vec(r - 0.028, 0.17 - (0.068 * i) / 7, 0), vec(r, 0.055 - (0.036 * i) / 7, 0));
  }
  form.push(vec(0.5, -0.025, 0), vec(0.002, -0.025, 0));
  const lens = MeshBuilder.CreateLathe(
    "stepped Fresnel bullseye",
    { shape: form, tessellation: 44, sideOrientation: Mesh.DOUBLESIDE },
    s.scene,
  );
  lens.parent = rotor;
  lens.position.z = 0.42;
  lens.rotation.x = Math.PI / 2;
  lens.material = lightGlass;
  lens.isPickable = false;
  const core = MeshBuilder.CreateSphere("incandescent lamp", { diameter: 0.53, segments: 12 }, s.scene);
  const wick = new StandardMaterial("incandescent amber core", s.scene);
  wick.diffuseColor.set(0, 0, 0);
  wick.emissiveColor.set(1, 0.84, 0.49);
  core.position.copyFrom(position);
  core.material = wick;
  core.isPickable = false;
  const pedestal = (lo: number, hi: number, b: number, t: number, c: string) =>
    s.pole("brass lens pedestal", vec(x, y + lo, z), vec(x, y + hi, z), b, t, c, 20);
  pedestal(9.12, 9.28, 0.84, 0.64, "#665948");
  pedestal(9.25, 9.51, 0.42, 0.25, brass);
  pedestal(9.44, 9.52, 0.6, 0.66, brass);
  return { rotor, position };
}

/** A translucent volume seen through coastal haze. Fade both the silhouette
 * and the far end; depth testing keeps the sweep behind foreground geometry. */
function shaft(s: IslandScenery, origin: Vector3, night: boolean) {
  const mesh = new Mesh("rotating column of sea haze", s.scene);
  const data = new VertexData(),
    positions: number[] = [],
    indices: number[] = [];
  const cuts = 30;
  for (let j = 0; j < 2; j++) {
    const dist = j ? 76 : 0.58;
    for (let i = 0; i <= cuts; i++) {
      const a = (i * tau) / cuts,
        r = 0.32 + dist * 0.119;
      positions.push(Math.sin(a) * r, Math.cos(a) * r * 0.66, dist);
      if (j === 0 && i < cuts) {
        const k = i + cuts + 1;
        indices.push(i, k, i + 1, i + 1, k, k + 1);
      }
    }
  }
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.position.copyFrom(origin);
  mesh.rotation.x = 0.105;
  mesh.isPickable = false;
  const m = new ShaderMaterial(
    "suspended salt mist in the beacon beam",
    s.scene,
    {
      vertexSource: `precision highp float;
      attribute vec3 position;
      uniform mat4 worldViewProjection,world;
      varying vec3 local,point,radial;
      void main(){
        local=position;point=(world*vec4(position,1.)).xyz;
        radial=(world*vec4(position.x,position.y/0.4356,0.,0.)).xyz;
        gl_Position=worldViewProjection*vec4(position,1.);
      }`,
      fragmentSource: `precision highp float;
      uniform vec3 eye;
      uniform float strength,reach;
      varying vec3 local,point,radial;
      void main(){
        vec3 sight=normalize(eye-point);
        float facing=abs(dot(sight,normalize(radial)));
        float soft=pow(clamp(facing,0.,1.),0.77);
        float along=local.z;
        float fade=exp(-along*.021)*(1.-smoothstep(reach*.68,reach,along));
        float haze=.87+.13*sin(along*.48+local.x*.87)*sin(local.y*1.35-along*.27);
        float a=strength*soft*fade*haze;
        gl_FragColor=vec4(mix(vec3(1.,.69,.34),vec3(1.,.84,.56),soft),a);
      }`,
    },
    {
      attributes: ["position"],
      uniforms: ["world", "worldViewProjection", "eye", "strength", "reach"],
      needAlphaBlending: true,
    },
  );
  m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.setFloat("strength", night ? 0.24 : 0.033);
  m.setFloat("reach", 76);
  mesh.material = m;
  // Terrain occlusion only depends on the seed, so sample bearings once.
  const horizon = new Float32Array(180);
  for (let i = 0; i < horizon.length; i++) {
    const angle = (i * tau) / horizon.length,
      dx = Math.sin(angle),
      dz = Math.cos(angle);
    let d = 2;
    for (; d < 76; d += 1) if (s.floor(origin.x + dx * d, origin.z + dz * d) > origin.y - d * 0.105) break;
    horizon[i] = Math.min(d, 76);
  }
  return (angle: number) => {
    mesh.rotation.y = angle;
    const f = ((((angle / tau) % 1) + 1) % 1) * horizon.length,
      i = Math.floor(f);
    m.setFloat("reach", horizon[i]! + (horizon[(i + 1) % horizon.length]! - horizon[i]!) * (f - i));
    if (s.scene.activeCamera) m.setVector3("eye", s.scene.activeCamera.globalPosition);
  };
}

export function buildBeacon(s: IslandScenery, night: boolean) {
  const { x, y, z } = tower(s),
    { rotor, position } = lantern(s, x, y, z, night);
  const beam = shaft(s, position, night);
  const light = new SpotLight(
    "sweeping lighthouse beam",
    position.clone(),
    vec(0, -0.105, 1).normalize(),
    0.61,
    65,
    s.scene,
  );
  light.diffuse = Color3.FromHexString("#ffdd93");
  light.specular = Color3.FromHexString("#ffcf85");
  light.intensity = night ? 4.7 : 1.6;
  light.range = 76;
  light.renderPriority = 1;
  light.shadowMinZ = 1;
  light.shadowMaxZ = 76;
  const shadow = night ? new ShadowGenerator(512, light) : null;
  if (shadow) {
    shadow.usePercentageCloserFiltering = true;
    shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
    shadow.bias = 0.0005;
    shadow.normalBias = 0.018;
    // Static town and scenery batches are created after this landmark.
    s.scene.onBeforeRenderObservable.addOnce(() => {
      for (const m of s.scene.meshes)
        if (m.receiveShadows && m.getTotalVertices() > 0) shadow.addShadowCaster(m, false);
    });
  }
  const first = Math.atan2(s.site.spawn.x - x, s.site.spawn.z - z) - 0.62;
  return (time: number) => {
    const angle = first + time * 0.53;
    rotor.rotation.y = angle;
    const dx = Math.sin(angle),
      dz = Math.cos(angle);
    light.direction.set(dx, -0.105, dz).normalize();
    // Start past the glass and balcony, so the lamp cannot shadow itself.
    light.position.set(x + dx * 1.25, position.y - 0.13, z + dz * 1.25);
    beam(angle);
  };
}

import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer.js";
import type { Scene } from "@babylonjs/core/scene.js";
import sandUrl from "./sand.jpg";
import turfUrl from "./turf.jpg";
import stoneUrl from "./stone.jpg";
import snowUrl from "./snow.jpg";

const layers = [
  ["beachScan", sandUrl], ["turfScan", turfUrl], ["rockScan", stoneUrl], ["snowScan", snowUrl],
] as const;

// The standard material still owns the scene lights, shadows and fog. The four
// channels of groundCover are sand, turf, rock and snow. Each scan packs the
// tangent-space normal in RG and neutral-relative albedo in B.
class GroundScans extends MaterialPluginBase {
  private readonly maps: Texture[];
  constructor(material: StandardMaterial, scene: Scene) {
    super(material, "Coastal ground scans", 180, {}, true, true);
    this.maps = layers.map(([name, url]) => {
      const t = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      t.name = name;
      t.gammaSpace = false;
      t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = Math.min(8, scene.getEngine().getCaps().maxAnisotropy);
      return t;
    });
  }
  override getClassName() { return "CoastalGroundScans"; }
  override getAttributes(attributes: string[]) { attributes.push("groundCover"); }
  override getSamplers(samplers: string[]) { samplers.push(...layers.map(([name]) => name)); }
  override bindForSubMesh(buffer: UniformBuffer) {
    layers.forEach(([name], i) => buffer.setTexture(name, this.maps[i]!));
  }
  override isReadyForSubMesh() { return this.maps.every(t => t.isReady()); }
  override dispose() { this.maps.forEach(t => t.dispose()); }
  override getCustomCode(stage: string): Record<string, string> {
    if (stage === "vertex") return {
      CUSTOM_VERTEX_DEFINITIONS: "attribute vec4 groundCover; varying vec4 vGroundCover;",
      CUSTOM_VERTEX_MAIN_END: "vGroundCover = groundCover;",
    };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying vec4 vGroundCover;
        uniform sampler2D beachScan, turfScan, rockScan, snowScan;
      `,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        vec3 p = vPositionW;
        // Long wavelengths break repeated grains without a seam at the edge of a tile.
        vec2 bend = vec2(sin(p.z * .36 + p.x * .14), sin(p.x * .32 - p.z * .13)) * .11;
        vec2 ground = p.xz + bend;
        vec3 beach = texture2D(beachScan, ground * .46).rgb;
        mat2 turn = mat2(.6,.8,-.8,.6);
        vec3 secondBeach = texture2D(beachScan, turn * ground * .33 + 1.73).rgb;
        secondBeach.rg = (secondBeach.rg - .5) * turn + .5;
        float borrow = .38 + .21*sin(p.x*.31 + .7*sin(p.z*.36));
        beach = mix(beach, secondBeach, borrow);
        vec3 turf = texture2D(turfScan, ground * .66).rgb;
        vec3 snow = texture2D(snowScan, ground * .27).rgb;
        // Three planes keep fractures legible even on vertical quarry faces.
        vec3 weights = pow(abs(normalW), vec3(4.));
        weights /= max(.001, weights.x + weights.y + weights.z);
        vec3 rockX = texture2D(rockScan, p.zy * vec2(.22,.28)).rgb;
        vec3 rockY = texture2D(rockScan, ground * .22).rgb;
        vec3 rockZ = texture2D(rockScan, p.xy * vec2(.22,.28)).rgb;
        vec3 rock = weights.x * rockX + weights.y * rockY + weights.z * rockZ;
        vec4 w = vGroundCover;
        float tone = dot(w, vec4(beach.b, turf.b, rock.b, snow.b) - .5);
        float closeDetail = 1. - smoothstep(8., 52., length(vEyePosition.xyz-p));
        baseColor.rgb *= 1. + tone * (.74 + .82 * closeDetail);
        // Project normal-map slopes onto the mesh tangent plane; the macro
        // shape controls snow cover and shadows, the scans catch grazing light.
        vec2 grain = w.x * (beach.rg - .5) * .48 + w.y * (turf.rg - .5) * .82
                   + w.w * (snow.rg - .5) * .52;
        vec3 relief = vec3(grain.x, 0., -grain.y);
        relief += w.z * .95 * (
          weights.x * vec3(0., rockX.g - .5, rockX.r - .5) +
          weights.y * vec3(rockY.r - .5, 0., -(rockY.g - .5)) +
          weights.z * vec3(rockZ.r - .5, rockZ.g - .5, 0.));
        normalW = normalize(normalW + relief - normalW * dot(normalW, relief));
      `,
    };
  }
}

export function coastalGroundMaterial(scene: Scene) {
  const material = new StandardMaterial("beach, turf, bedrock and snow", scene);
  material.specularColor.setAll(.028);
  material.specularPower = 28;
  new GroundScans(material, scene);
  return material;
}

import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/** Water-reflected sky light is confined to the inner wall above the pool.
 * Its slowly changing narrow filaments break over the surface relief. */
export class GrottoBounce extends MaterialPluginBase {
  private readonly motion =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;
  constructor(
    mat: StandardMaterial,
    private readonly pool: Vector3,
    private readonly night: boolean,
  ) {
    super(mat, "Tidal caustics", 182, {}, true, true);
  }
  override getClassName() {
    return "GrottoBounce";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "tideBounce", size: 4, type: "vec4" }],
      fragment: "uniform vec4 tideBounce;",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat4(
      "tideBounce",
      this.pool.x,
      this.pool.z,
      this.motion?.matches ? 0 : (performance.now() * 0.00022) % 600,
      this.night ? 0.08 : 1,
    );
  }
  override getCustomCode(stage: string) {
    if (stage !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FOG: `
      vec3 reefP = vPositionW;
      float tideFalloff = exp(-dot(reefP.xz-tideBounce.xy,reefP.xz-tideBounce.xy)*.068)
                        * smoothstep(.02,.73,reefP.y) * (1.-smoothstep(4.6,6.0,reefP.y)) * tideBounce.w;
      vec2 tideUV = vec2(reefP.x*.66 + reefP.z*.68, reefP.y*1.12 + reefP.z*.37);
      vec2 distortion = vec2(sin(tideUV.y*1.91 + tideBounce.z) + .48*cos(tideUV.x*3.12-tideBounce.z*.69),
                             cos(tideUV.x*1.73 - tideBounce.z*.78) + .39*sin(tideUV.y*3.67+tideBounce.z*.64));
      vec2 wave = tideUV * 4.2 + 1.8*distortion;
      float ridges = abs(sin(wave.x + .57*cos(wave.y)) + .83*cos(wave.y + .51*sin(wave.x)));
      float caustic = (1.-smoothstep(.018,.18,ridges)) * (.76+.24*sin(tideUV.x*1.32+tideUV.y));
      color.rgb += baseColor.rgb * tideFalloff * (vec3(.035,.13,.12) + vec3(.32,.50,.40)*caustic);
    `,
    };
  }
}

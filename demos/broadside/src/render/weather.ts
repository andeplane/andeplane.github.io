import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Wind } from "../sim/wind";
import { Rng } from "../sim/rng";
import { lightningFlash, type VoyageWeather } from "../game/weather";

/** One rain draw call, recycled vertices, and a distant branching lightning bolt. */
export class WeatherView {
  private readonly rain?: LinesMesh;
  private readonly bolt?: Mesh;
  private readonly drops: { x: number; z: number; phase: number; speed: number }[] = [];
  private readonly positions: Float32Array;
  private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(scene: Scene, private weather: VoyageWeather, seed: number) {
    const rng = new Rng(seed + 940);
    const count = Math.round(weather.rain * (matchMedia("(pointer: coarse)").matches ? 650 : 1000));
    this.positions = new Float32Array(count * 6);
    if (count) {
      const lines = [];
      for (let i = 0; i < count; i++) {
        this.drops.push({ x: rng.range(-66, 66), z: rng.range(-70, 85), phase: rng.range(0, 76), speed: rng.range(32, 49) });
        lines.push([new Vector3(), new Vector3(0, 1, 0)]);
      }
      this.rain = MeshBuilder.CreateLineSystem("windblown rain", { lines, updatable: true }, scene);
      this.rain.color = Color3.FromHexString("#bcd7e5");
      this.rain.alpha = weather.kind === "storm" ? .53 : .38;
      this.rain.isPickable = false;
      this.rain.alwaysSelectAsActiveMesh = true;
    }
    if (weather.lightning && !this.reduced) {
      const path = [new Vector3(0, 48, 0)];
      for (let i = 1; i <= 10; i++) path.push(new Vector3(rng.range(-3, 3), 48 - i * 4.8, rng.range(-2, 2)));
      const branches = [path, [path[3]!, new Vector3(8, 23, -3), new Vector3(13, 12, -6)],
        [path[5]!, new Vector3(-9, 16, 1), new Vector3(-14, 7, 3)]];
      this.bolt = Mesh.MergeMeshes(branches.map((path, i) => MeshBuilder.CreateTube("lightning branch", {
        path, radius: i ? .09 : .15, tessellation: 6,
      }, scene)), true, true)!;
      this.bolt.name = "distant forked lightning";
      const light = new StandardMaterial("white-blue lightning", scene);
      light.disableLighting = true;
      light.emissiveColor = Color3.FromHexString("#d5efff").scale(2);
      this.bolt.material = light;
      this.bolt.isPickable = false;
      this.bolt.setEnabled(false);
    }
  }
  update(time: number, focus: Vector3, wind: Wind): number {
    if (this.rain) {
      const dx = Math.sin(wind.direction), dz = Math.cos(wind.direction);
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i]!, y = ((d.phase - time * d.speed) % 76 + 76) % 76;
        const tilt = .2 + (wind.drift ?? .6) * .16;
        const x = focus.x + d.x + dx * (76 - y) * tilt;
        const z = focus.z + d.z + dz * (76 - y) * tilt;
        const offset = i * 6;
        this.positions[offset] = x;
        this.positions[offset + 1] = y;
        this.positions[offset + 2] = z;
        const tail = 2.4 + this.weather.rain * 1.4;
        this.positions[offset + 3] = x + dx * tail * tilt;
        this.positions[offset + 4] = y - tail;
        this.positions[offset + 5] = z + dz * tail * tilt;
      }
      this.rain.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    }
    const flash = this.reduced ? 0 : lightningFlash(this.weather, time);
    if (this.bolt) {
      this.bolt.setEnabled(flash > 0.1);
      this.bolt.visibility = Math.min(1, flash * 2);
      this.bolt.position.set(focus.x + 18 * Math.sin(this.weather.direction), 0, focus.z + 64);
    }
    return flash;
  }
}

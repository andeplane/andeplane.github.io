import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
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
  private readonly bolt?: LinesMesh;
  private readonly drops: { x: number; z: number; phase: number; speed: number }[] = [];
  private readonly positions: Float32Array;
  private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(scene: Scene, private weather: VoyageWeather, seed: number) {
    const rng = new Rng(seed + 940);
    const count = Math.round(weather.rain * (matchMedia("(pointer: coarse)").matches ? 460 : 900));
    this.positions = new Float32Array(count * 6);
    if (count) {
      const lines = [];
      for (let i = 0; i < count; i++) {
        this.drops.push({ x: rng.range(-95, 95), z: rng.range(-90, 110), phase: rng.range(0, 50), speed: rng.range(28, 42) });
        lines.push([new Vector3(), new Vector3(0, 1, 0)]);
      }
      this.rain = MeshBuilder.CreateLineSystem("windblown rain", { lines, updatable: true }, scene);
      this.rain.color = Color3.FromHexString("#b4cfde");
      this.rain.alpha = 0.24;
      this.rain.isPickable = false;
      this.rain.alwaysSelectAsActiveMesh = true;
    }
    if (weather.lightning && !this.reduced) {
      const path = [new Vector3(0, 65, 0)];
      for (let i = 1; i < 10; i++) path.push(new Vector3(rng.range(-4, 4), 65 - i * 6.5, rng.range(-3, 3)));
      this.bolt = MeshBuilder.CreateLineSystem("distant forked lightning", { lines: [path, [path[3]!, new Vector3(12, 30, -3), new Vector3(18, 14, -6)], [path[5]!, new Vector3(-13, 21, 1), new Vector3(-18, 12, 3)]] }, scene);
      this.bolt.color = Color3.FromHexString("#cce8ff").scale(3);
      this.bolt.isPickable = false;
      this.bolt.setEnabled(false);
    }
  }
  update(time: number, focus: Vector3, wind: Wind): number {
    if (this.rain) {
      const dx = Math.sin(wind.direction), dz = Math.cos(wind.direction);
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i]!, y = ((d.phase - time * d.speed) % 50 + 50) % 50;
        const x = focus.x + d.x + dx * (50 - y) * 0.25;
        const z = focus.z + d.z + dz * (50 - y) * 0.25;
        const offset = i * 6;
        this.positions[offset] = x;
        this.positions[offset + 1] = y;
        this.positions[offset + 2] = z;
        this.positions[offset + 3] = x + dx * 0.6;
        this.positions[offset + 4] = y - 2.4;
        this.positions[offset + 5] = z + dz * 0.6;
      }
      this.rain.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    }
    const flash = this.reduced ? 0 : lightningFlash(this.weather, time);
    if (this.bolt) {
      this.bolt.setEnabled(flash > 0.1);
      this.bolt.alpha = Math.min(1, flash * 2);
      this.bolt.position.set(focus.x + 50 * Math.sin(this.weather.direction), 0, focus.z + 64);
    }
    return flash;
  }
}

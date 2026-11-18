import { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ShipView } from "./shipView";
import { clamp, wrapAngle } from "../sim/math";

/** Stay at the real helm while looking independently of steering the ship. */
export class CaptainCamera {
  enabled = false;
  yaw = 0;
  pitch = .03;
  private blend = 0;
  deckEye: Vector3 | null = null;
  look(dx: number, dy: number): void {
    this.yaw = wrapAngle(this.yaw + dx * .003);
    this.pitch = clamp(this.pitch + dy * .003, -1.1, 1.1);
  }
  centre(): void { this.yaw = 0; this.pitch = .03; }
  apply(camera: FreeCamera, view: ShipView, dt: number): void {
    // A mode cut avoids flying the camera through canvas, rigging and the hull.
    // Looking and walking still follow the real moving deck after the cut.
    this.blend = this.enabled ? 1 : 0;
    if (this.blend < .0001) { camera.rotation.z = 0; return; }
    view.root.computeWorldMatrix(true);
    const seat = Vector3.TransformCoordinates(this.deckEye ?? view.captainSeat, view.root.getWorldMatrix());
    const yaw = view.root.rotation.y + this.yaw;
    const pitch = this.pitch + view.root.rotation.x * .18;
    const target = seat.add(new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)).scale(80));
    const previousTarget = camera.getTarget().clone();
    camera.position.copyFrom(Vector3.Lerp(camera.position, seat, this.blend));
    camera.setTarget(Vector3.Lerp(previousTarget, target, this.blend));
    camera.rotation.z = view.root.rotation.z * .18 * this.blend;
    // The scaled authored Pearl has rigging immediately behind its wheel.
    // Keep that near-eye geometry outside the lens without hiding ship parts.
    camera.minZ = view.deckGeometry?.eyeScale !== undefined ? view.deckGeometry.length / 22 * .28 : .07;
    const desiredFov = innerWidth < 600 ? 1.06 : 1.12;
    camera.fovMode = innerWidth < 600 ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    camera.fov = .78 + (desiredFov - .78) * this.blend;
  }
}

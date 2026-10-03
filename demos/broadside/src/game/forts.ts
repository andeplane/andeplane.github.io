import { elevationForTarget } from "../sim/cannons";
import { forward } from "../sim/math";
import type { Ship } from "../sim/ships";

/** Lead a steady target, then commit the shot; turning after the muzzle flash can dodge it. */
export function aimFortShot(origin: { x: number; z: number }, target: Ship) {
  const speed = 40,
    height = 12,
    hitHeight = 2;
  const direction = forward(target.heading);
  let x = target.pos.x,
    z = target.pos.z,
    elevation = 0,
    flight = 0;
  for (let i = 0; i < 8; i++) {
    const range = Math.hypot(x - origin.x, z - origin.z);
    elevation = elevationForTarget(range, speed, height - hitHeight);
    flight = range / (speed * Math.cos(elevation));
    x = target.pos.x + direction.x * target.speed * flight;
    z = target.pos.z + direction.z * target.speed * flight;
  }
  const dx = x - origin.x,
    dz = z - origin.z,
    d = Math.max(0.01, Math.hypot(dx, dz));
  return {
    x,
    z,
    flight,
    velocity: {
      x: (dx / d) * speed * Math.cos(elevation),
      y: speed * Math.sin(elevation),
      z: (dz / d) * speed * Math.cos(elevation),
    },
  };
}

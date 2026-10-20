// CAD +X is right, +Y is forward. ROS: vx = CAD vy, vy = -CAD vx.
export const WHEEL_ANGLES_DEG = [30, 150, 270] as const

// Tangential wheel velocity for the actual CAD motor stations.
export function wheelRpm(vx: number, vy: number, omega: number, radius = 0.1318, wheelRadius = 0.03) {
  return WHEEL_ANGLES_DEG.map(degrees => {
    const a = degrees * Math.PI / 180
    return (-Math.sin(a) * vx + Math.cos(a) * vy + radius * omega) / wheelRadius * 60 / (2 * Math.PI)
  })
}

export function bodyVelocity(rpm: number[], radius = 0.1318, wheelRadius = 0.03) {
  const speeds = rpm.map(n => n * 2 * Math.PI / 60 * wheelRadius)
  return {
    vx: -2 / 3 * speeds.reduce((sum, speed, i) => sum + Math.sin(WHEEL_ANGLES_DEG[i] * Math.PI / 180) * speed, 0),
    vy: 2 / 3 * speeds.reduce((sum, speed, i) => sum + Math.cos(WHEEL_ANGLES_DEG[i] * Math.PI / 180) * speed, 0),
    omega: speeds.reduce((a, b) => a + b, 0) / (3 * radius),
  }
}

// Uniform scaling preserves travel direction when one wheel reaches its limit.
export function limitedWheelRpm(vx: number, vy: number, omega: number, limit = 80) {
  const requested = wheelRpm(vx, vy, omega)
  const scale = Math.min(1, limit / Math.max(...requested.map(Math.abs), Number.EPSILON))
  return { requested, actual: requested.map(n => n * scale), scale }
}

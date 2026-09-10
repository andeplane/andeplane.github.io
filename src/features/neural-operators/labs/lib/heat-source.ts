// Periodic Gaussian heater, continuously active in du/dt = nu*u_xx + s(x).
export const SOURCE_CENTER = 0.4;
export const SOURCE_WIDTH = 0.04;
export function sourceValue(x: number) {
  let value = 0;
  for (let m = -3; m <= 3; m++) value += Math.exp(-((x - SOURCE_CENTER + m) ** 2) / (2 * SOURCE_WIDTH ** 2));
  return value;
}
export function sourceResponse(x: number, time: number, nu: number) {
  const mass = Math.sqrt(2 * Math.PI) * SOURCE_WIDTH;
  let value = mass * time;
  for (let k = 1; k <= 64; k++) {
    const lambda = 4 * Math.PI ** 2 * nu * k ** 2;
    const gain = lambda === 0 ? time : -Math.expm1(-lambda * time) / lambda;
    value += 2 * mass * Math.exp(-2 * Math.PI ** 2 * SOURCE_WIDTH ** 2 * k ** 2) * gain * Math.cos(2 * Math.PI * k * (x - SOURCE_CENTER));
  }
  return value;
}

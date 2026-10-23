/** Gentle rudder input from horizontal CSS-pixel travel since touching the wheel.
 * A short drag must not request a completely new compass heading.
 */
export function touchSteeringTurn(distance: number): number {
  const deadzone = 8, fullTravel = 60, maxTurn = 0.75;
  const travel = Math.min(1, Math.max(0, (Math.abs(distance) - deadzone) / (fullTravel - deadzone)));
  return travel === 0 ? 0 : Math.sign(distance) * travel * travel * maxTurn;
}

/** Change scenes only while fully covered, then start the chest after fading in. */
export function arrivalPose(seconds: number, reducedMotion = false) {
  const t = Math.max(0, seconds);
  const out = reducedMotion ? 0.12 : 0.65;
  const swap = out + 0.12;
  const end = swap + (reducedMotion ? 0.12 : 0.85);
  const smooth = (n: number) => {
    const x = Math.max(0, Math.min(1, n));
    return x * x * (3 - 2 * x);
  };
  return {
    opacity: t < swap ? smooth(t / out) : 1 - smooth((t - swap) / (end - swap)),
    inCave: t >= swap,
    ready: t >= end,
  };
}

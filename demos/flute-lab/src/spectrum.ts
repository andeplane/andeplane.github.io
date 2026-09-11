/** Hann-windowed radix-2 FFT of measured microphone samples. */
export function spectrum(samples: Float32Array, head: number) {
  const n = samples.length,
    re = new Float64Array(n),
    im = new Float64Array(n);
  let mean = 0;
  for (const v of samples) mean += v / n;
  for (let i = 0; i < n; i++)
    re[i] =
      (samples[(head + i) % n] - mean) *
      (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < size / 2; j++) {
        const c = Math.cos(angle * j),
          s = Math.sin(angle * j),
          a = start + j,
          b = a + size / 2,
          tr = re[b] * c - im[b] * s,
          ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  return Float32Array.from(
    { length: n / 2 },
    (_, i) => (2 * Math.hypot(re[i], im[i])) / n,
  );
}
export function pitch(magnitudes: Float32Array, rate: number, n: number) {
  let best = 0;
  for (let i = 2; i < magnitudes.length; i++) {
    if ((i * rate) / n > 4000) break;
    if (magnitudes[i] > magnitudes[best]) best = i;
  }
  if (best < 2 || magnitudes[best] < 0.002) return null;
  // Prefer a significant lower harmonic when the strongest peak is an overtone.
  for (let divisor = 4; divisor >= 2; divisor--) {
    const center = Math.round(best / divisor);
    let candidate = center;
    for (let i = center - 1; i <= center + 1; i++)
      if (magnitudes[i] > magnitudes[candidate]) candidate = i;
    if (
      candidate >= 2 &&
      magnitudes[candidate] > magnitudes[best] * 0.2 &&
      magnitudes[candidate] >= magnitudes[candidate - 1] &&
      magnitudes[candidate] >= magnitudes[candidate + 1]
    ) {
      best = candidate;
      break;
    }
  }
  const a = Math.log(magnitudes[best - 1] + 1e-15),
    b = Math.log(magnitudes[best] + 1e-15),
    c = Math.log(magnitudes[best + 1] + 1e-15);
  const offset = (0.5 * (a - c)) / (a - 2 * b + c),
    hz = ((best + Math.max(-0.5, Math.min(0.5, offset))) * rate) / n;
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return {
    hz,
    note: noteName(midi),
    cents: 1200 * Math.log2(hz / (440 * 2 ** ((midi - 69) / 12))),
  };
}
export function noteName(midi: number) {
  return (
    ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][
      ((midi % 12) + 12) % 12
    ] +
    (Math.floor(midi / 12) - 1)
  );
}

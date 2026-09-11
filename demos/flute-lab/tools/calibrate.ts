import { Bore, BORE_RATE, TARGETS } from "../src/bore.ts";
let positions = TARGETS.map((f) => 343 / (2 * f)),
  length = 343 / (2 * 523.251);
function measure(f: Bore) {
  let before = 0;
  const crossings = [];
  for (let i = 0; i < BORE_RATE * 0.6; i++) {
    f.step();
    const v = f.radiation[0];
    if (i > BORE_RATE * 0.3 && v >= 0 && before < 0)
      crossings.push(i - 1 - before / (v - before));
    before = v;
  }
  return (
    (BORE_RATE * (crossings.length - 1)) / (crossings.at(-1)! - crossings[0])
  );
}
for (let iteration = 0; iteration < 4; iteration++) {
  let next = [...positions];
  for (let n = 0; n <= 10; n++) {
    const f = new Bore(positions, length);
    f.open = f.open.map((_, i) => i >= n);
    const measured = measure(f),
      target = [...TARGETS, 523.251][n];
    if (n < 10) next[n] *= measured / target;
    else length *= measured / target;
    console.log(iteration, n, measured.toFixed(3), target);
  }
  positions = next;
}
console.log(JSON.stringify({ positions, length }));

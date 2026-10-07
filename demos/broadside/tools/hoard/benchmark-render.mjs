// Count actual submitted geometry, without a browser, audio or save writes.
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
const url = new URL('../../src/game/goldSurface.ts', import.meta.url);
const source = (await readFile(url, 'utf8')).replace("'./goldAreas'", JSON.stringify(new URL('../../src/game/goldAreas.ts', import.meta.url).href));
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const coinSource = await readFile(new URL('../../src/render/coin.ts', import.meta.url), 'utf8');
const renderSegments = Number(coinSource.match(/DOUBLOON_RENDER_SEGMENTS = (\d+)/)[1]);
const trianglesPerCoin = renderSegments * 8;
const { exposedGold } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
for (const count of [1000, 8000, 10000]) {
  const bytes = await readFile(new URL(`../../public/assets/hoard/world-0/${count}.bin`, import.meta.url));
  const poses = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const start = performance.now(), surface = exposedGold(poses), buildMs = performance.now() - start;
  console.log(JSON.stringify({ coins: count, drawn: surface.length, beforeTriangles: count * 128, afterTriangles: surface.length * trianglesPerCoin, reduction: 1 - surface.length * trianglesPerCoin / (count * 128), buildMs }));
}

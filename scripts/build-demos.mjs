/**
 * Build every self-contained demo under `demos/` and stage it for the site.
 *
 * Each demo is its own Vite app with its own dependencies, because they have nothing to
 * do with the site's React stack and should not be entangled with it. The output is
 * copied into `public/demos/<name>/`, which Vite then copies verbatim into `dist/`, so
 * the site build needs no special knowledge of what a demo contains.
 *
 * Demos are served from a subpath, so each is built with BASE_PATH set accordingly.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demosDir = join(root, 'demos');
const stageDir = join(root, 'public', 'demos');

if (!existsSync(demosDir)) {
  console.log('no demos/ directory — nothing to build');
  process.exit(0);
}

const names = readdirSync(demosDir).filter((name) =>
  statSync(join(demosDir, name)).isDirectory(),
);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const name of names) {
  const dir = join(demosDir, name);
  if (!existsSync(join(dir, 'package.json'))) continue;

  const run = (...args) =>
    execFileSync('npm', args, {
      cwd: dir,
      stdio: 'inherit',
      // Vite reads this to prefix asset URLs; the demo lives under a subpath.
      env: { ...process.env, BASE_PATH: `/demos/${name}/` },
    });

  console.log(`\n=== demos/${name} ===`);
  // `npm ci` needs a lockfile and is what CI should use; fall back for a fresh checkout
  // that has not committed one yet.
  run(existsSync(join(dir, 'package-lock.json')) ? 'ci' : 'install');
  run('run', 'build');

  cpSync(join(dir, 'dist'), join(stageDir, name), { recursive: true });
  console.log(`staged → public/demos/${name}/`);
}

console.log(`\nbuilt ${names.length} demo(s)`);

// Headless validation, worldcheck-spirit: run the CPU-side physics and engine
// test suite. (GPU rendering has no reliable headless path in CI; the
// playwright drive scripts cover it interactively.)
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
execFileSync('npx', ['vitest', 'run'], { cwd: root, stdio: 'inherit' })
console.log('\nflow-defence check: OK')

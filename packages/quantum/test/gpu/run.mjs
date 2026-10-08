// Serve the GPU test page with Vite and run it in headless Chromium.
// Chromium uses the machine's GPU when it has one and falls back to its
// software adapter (SwiftShader) otherwise, which is enough to check the
// kernels against the CPU backend. Set CHROMIUM_PATH to pick a browser.
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const server = await createServer({ root, logLevel: 'error', server: { port: 0, fs: { allow: [`${root}/../..`] } } })
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
})
let failed = true
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('page error:', e.message))
  await page.goto(url)
  await page.waitForFunction(() => window.__results, null, { timeout: 600_000 })
  const results = await page.evaluate(() => window.__results)
  for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  failed = results.some((r) => !r.pass)
} finally {
  await browser.close()
  await server.close()
}
process.exit(failed ? 1 : 0)

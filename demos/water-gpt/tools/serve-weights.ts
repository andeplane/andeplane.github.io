/**
 * Dev-only static server for local weight copies, with CORS, so the hall can be tested
 * without Hugging Face:  node --experimental-strip-types tools/serve-weights.ts [dir] [port]
 * then open big.html?weights=http://localhost:8124/
 * Optional throttle (MB/s) to watch the reservoirs fill slowly: THROTTLE_MBPS=40.
 */
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, join } from 'node:path'

const dir = process.argv[2] ?? process.env.WATER_GPT_WEIGHTS ?? '/home/claude/model-weights'
const port = Number(process.argv[3] ?? 8124)
const mbps = Number(process.env.THROTTLE_MBPS ?? 0)

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Expose-Headers', 'content-length')
  const name = basename(decodeURIComponent((req.url ?? '/').split('?')[0]))
  const path = join(dir, name)
  let size: number
  try {
    size = statSync(path).size
  } catch {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, {
    'content-type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    'content-length': String(size),
  })
  const stream = createReadStream(path, { highWaterMark: 1 << 20 })
  if (!mbps) {
    stream.pipe(res)
    return
  }
  stream.on('data', (chunk) => {
    stream.pause()
    res.write(chunk)
    setTimeout(() => stream.resume(), (chunk.length / (mbps * 1e6)) * 1000)
  })
  stream.on('end', () => res.end())
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}/`))

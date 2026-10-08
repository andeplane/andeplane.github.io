/**
 * Node-side helpers: load the dev copies of the checkpoints from a local folder
 * (never from the repo; default /home/claude/model-weights or $WATER_GPT_WEIGHTS).
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BpeTokenizer, type TokenizerJson } from '../src/big/bpe.ts'
import { GPT2_SMALL, ModelWeights, neoConfig, type NeoConfigJson } from '../src/big/model.ts'
import { ByteReader } from '../src/big/weights/bytereader.ts'
import { readSafetensors } from '../src/big/weights/safetensors.ts'
import { readTorchZip } from '../src/big/weights/torchzip.ts'
import { LOCAL_NAMES } from '../src/big/weights/source.ts'

export const WEIGHTS_DIR = process.env.WATER_GPT_WEIGHTS ?? '/home/claude/model-weights'

export function haveWeights(model: 'gpt2' | 'tinystories'): boolean {
  const f = LOCAL_NAMES[model]
  return [f.weights, f.tokenizer, f.config].every((n) => !n || existsSync(join(WEIGHTS_DIR, n)))
}

export function loadTokenizer(): BpeTokenizer {
  const json = JSON.parse(readFileSync(join(WEIGHTS_DIR, LOCAL_NAMES.gpt2.tokenizer), 'utf8')) as TokenizerJson
  return new BpeTokenizer(json)
}

export async function loadModel(model: 'gpt2' | 'tinystories', keepFloat = true): Promise<ModelWeights> {
  const f = LOCAL_NAMES[model]
  const cfg =
    model === 'gpt2'
      ? GPT2_SMALL
      : neoConfig(JSON.parse(readFileSync(join(WEIGHTS_DIR, f.config!), 'utf8')) as NeoConfigJson)
  const w = new ModelWeights(cfg, keepFloat)
  const stream = createReadStream(join(WEIGHTS_DIR, f.weights), { highWaterMark: 4 << 20 })
  const r = new ByteReader(stream as unknown as AsyncIterable<Uint8Array>)
  const handlers = { want: w.want, bandRows: w.bandRows, band: w.band }
  if (model === 'gpt2') await readSafetensors(r, handlers)
  else await readTorchZip(r, handlers)
  w.validate()
  return w
}

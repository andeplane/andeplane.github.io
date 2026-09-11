#!/usr/bin/env node
/**
 * Re-fetch the source PDFs this reconstruction was built from.
 *
 *   node research/fetch-sources.mjs
 *
 * The PDFs are not committed. They are ~68 MB of third-party material licensed
 * for private scientific use only — the DAI terms embedded in the files
 * expressly prohibit commercial use and redistribution — and this repository is
 * public. So the archive is reproduced on demand instead, and every file is
 * checked against the SHA-256 it had when the model was built. If a checksum
 * fails, the upstream file changed and the reconstruction may be resting on a
 * different edition than it thinks.
 *
 * Two of the hosts sit behind bot walls and cannot be scripted:
 *
 *   publications.dainst.org   Anubis proof-of-work
 *   mediatum.ub.tum.de        Anubis, hard refusal to non-browsers
 *
 * Those are listed as MANUAL below. Open the URL in an ordinary browser, save
 * to the given path, and re-run this script to verify.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'sources');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** @type {{path: string, url: string, sha256: string, bytes: number, manual?: string}[]} */
const SOURCES = [
  {
    path: 'publications/odap-heraion-booklet-en.pdf',
    url: 'https://www.odap.gr/wp-content/uploads/demo_products/163_HRAIO_SAMOY_ENG.pdf',
    sha256: '76869e2d649c46427c6b257e1c398a1592cfa21fb27b3d3b16708e85ba87a62b',
    bytes: 2208936,
  },
  {
    path: 'publications/denker-3d-computer-graphics.pdf',
    url: 'https://dergipark.org.tr/en/download/article-file/105382',
    sha256: 'a65b666ce17bed141783922736ebb4aadbdc9067b4ac5624bd44818ff3120ca5',
    bytes: 344845,
  },
  {
    path: 'publications/samos-21-1-walter-heraion-teil1.pdf',
    url: 'https://publications.dainst.org/books/dai/catalog/view/432/653/1654',
    sha256: '039889db9affec4f222b7e3a29a8549baa96c02e5f021980939d99d030e07b10',
    bytes: 34181407,
    manual: 'iDAI.publications sits behind an Anubis proof-of-work challenge.',
  },
  {
    path: 'dai-plans/samos-21-1-plans.pdf',
    url: 'https://publications.dainst.org/books/dai/catalog/view/432/654/1655',
    sha256: 'fcb258edf9239f2871804b6e979f727ac77391470455b426fe40372a49338eb4',
    bytes: 7809584,
    manual: 'Same.',
  },
  {
    path: 'publications/samos-29-roemische-tempel-peripteros-naiskos.pdf',
    url: 'https://publications.dainst.org/books/dai/catalog/view/433/655/1656',
    sha256: '5160b6fb3470b9986fc7df8e2a2753c502c2d169f4c92ad05f746aba840b08a2',
    bytes: 20407559,
    manual: 'Same.',
  },
  {
    path: 'dai-plans/samos-29-plans.pdf',
    url: 'https://publications.dainst.org/books/dai/catalog/view/433/656/1657',
    sha256: 'afdd60d6b6a9d55831dadc9c52abb31e4956ac513bade7e99f37bb0a07d5d235',
    bytes: 3026865,
    manual: 'Same.',
  },
  {
    path: 'publications/kienast-furtwaengler-datierung-dipteroi-AM.pdf',
    url: 'https://publications.dainst.org/journals/am/article/view/4923',
    sha256: '8149dd48bc7cc7f0c760ba8d3a03fc9cd32e219fae857be8b6fef3b6d7cf74bc',
    bytes: 3113388,
    manual: 'Open access, but behind the same challenge. Click through to the PDF galley.',
  },
];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function verify(target, expected) {
  if (!existsSync(target)) return null;
  const got = sha(await readFile(target));
  return got === expected ? 'ok' : 'MISMATCH';
}

let have = 0;
const manual = [];

for (const s of SOURCES) {
  const target = join(out, s.path);
  await mkdir(dirname(target), { recursive: true });

  const already = await verify(target, s.sha256);
  if (already === 'ok') {
    console.log(`ok       ${s.path}`);
    have++;
    continue;
  }
  if (already === 'MISMATCH') {
    console.log(`CHANGED  ${s.path}  — on disk but does not match the recorded hash`);
    continue;
  }

  if (s.manual) {
    manual.push(s);
    console.log(`manual   ${s.path}`);
    continue;
  }

  try {
    const res = await fetch(s.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha(buf);
    if (got !== s.sha256) {
      console.log(`CHANGED  ${s.path}  — upstream hash is ${got}`);
      continue;
    }
    await writeFile(target, buf);
    console.log(`fetched  ${s.path}  (${buf.length} bytes)`);
    have++;
  } catch (err) {
    console.log(`FAILED   ${s.path}  — ${err.message}`);
    manual.push(s);
  }
}

console.log(`\n${have}/${SOURCES.length} present and verified.`);

if (manual.length) {
  console.log(`\nFetch these by hand — open in a normal browser and save to the path shown:\n`);
  for (const s of manual) {
    console.log(`  ${s.url}`);
    console.log(`    → research/sources/${s.path}`);
    console.log(`      ${s.bytes} bytes, sha256 ${s.sha256}`);
    if (s.manual) console.log(`      ${s.manual}`);
    console.log();
  }
  console.log('Then re-run this script to verify.');
}

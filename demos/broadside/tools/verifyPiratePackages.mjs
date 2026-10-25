import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root=process.cwd();
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]).sort();
const hash=paths=>{const h=createHash('sha256');for(const p of paths){h.update(relative(root,p));h.update('\0');h.update(readFileSync(p));h.update('\0');}return h.digest('hex');};
const source=files(resolve('src')).filter(p=>!p.endsWith('.test.ts'));
const expected={sourceHash:hash(source),sharedHash:hash(source.filter(p=>p.includes('/shared/pirate-world/'))),assetsHash:hash(files(resolve('public')).filter(p=>/\/(hoard|audio|cave)\//.test(p)))};
const apps=process.argv.slice(2);
if(apps.length!==2)throw new Error('Usage: node tools/verifyPiratePackages.mjs <Broadside.app> <Calculus.app>');
for(const [i,dist]of ['dist-ios','dist-calculus-ios'].entries()){
  const manifest=JSON.parse(readFileSync(resolve(dist,'pirate-world-build.json'),'utf8'));
  for(const key of Object.keys(expected))if(manifest[key]!==expected[key])throw new Error(`${dist}: ${key} differs from source`);
  const paths=files(resolve(dist));
  for(const path of paths){const target=resolve(apps[i],'public',relative(resolve(dist),path));if(!readFileSync(path).equals(readFileSync(target)))throw new Error(`Package mismatch: ${target}`);}
  console.log(`${dist}: ${paths.length} web files match package; runtime, shared-core and asset fingerprints match source (${manifest.sourceHash}).`);
}

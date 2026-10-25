import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root=process.cwd();
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]).sort();
const hash=paths=>{const h=createHash('sha256');for(const p of paths){h.update(relative(root,p));h.update('\0');h.update(readFileSync(p));h.update('\0');}return h.digest('hex');};
const source=files(resolve('src')).filter(p=>!p.endsWith('.test.ts'));
const expected={sourceHash:hash(source),sharedHash:hash(source.filter(p=>p.includes('/shared/pirate-world/'))),assetsHash:hash(files(resolve('public')).filter(p=>/\/(hoard|audio|cave)\//.test(p)))};
const apps=process.argv.slice(2);
if(![1,2,3].includes(apps.length))throw new Error('Usage: node tools/verifyPiratePackages.mjs <Reader.app> OR <Broadside.app> <Calculus.app> [Reader.app]');
const bundles=apps.length===1?['dist-reading-ios']:apps.length===2?['dist-ios','dist-calculus-ios']:['dist-ios','dist-calculus-ios','dist-reading-ios'];
for(const [i,dist]of bundles.entries()){
  const manifest=JSON.parse(readFileSync(resolve(dist,'pirate-world-build.json'),'utf8'));
  for(const key of Object.keys(expected))if(manifest[key]!==expected[key])throw new Error(`${dist}: ${key} differs from source`);
  const paths=files(resolve(dist));
  for(const path of paths){const target=resolve(apps[i],'public',relative(resolve(dist),path));if(!readFileSync(path).equals(readFileSync(target)))throw new Error(`Package mismatch: ${target}`);}
  console.log(`${dist}: ${paths.length} web files match package; runtime, shared-core and asset fingerprints match source (${manifest.sourceHash}).`);
}

if(bundles.includes('dist-reading-ios')){
 const readerApp=apps[bundles.indexOf('dist-reading-ios')];
 const config=JSON.parse(readFileSync(resolve(readerApp,'capacitor.config.json'),'utf8'));
 if(config.loggingBehavior!=='none')throw new Error('Reader bridge logging must be disabled so spoken transcripts are not logged');
 const manifest=JSON.parse(readFileSync(resolve('dist-reading-ios/reading-native-build.json'),'utf8'));
 for(const path of files(resolve('public/reading'))){const target=resolve('dist-reading-ios/reading',relative(resolve('public/reading'),path));if(!readFileSync(path).equals(readFileSync(target)))throw new Error(`Reader artwork differs from source: ${path}`);}
 for(const [name,path]of Object.entries({scene:'ios-reading/App/App/SceneDelegate.swift',permissions:'ios-reading/App/App/Info.plist',icon:'ios-reading/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'}))
  if(manifest[name]!==createHash('sha256').update(readFileSync(resolve(path))).digest('hex'))throw new Error(`Reader native ${name} differs from source`);
 console.log('Reader native speech source, permissions and icon match its build metadata.');
}

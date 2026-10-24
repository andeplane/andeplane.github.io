import { readFile, writeFile } from 'node:fs/promises';
const path=process.argv[2];
if(!path)throw new Error('Pass the Capacitor Swift package manifest');
const source=await readFile(path,'utf8');
// Capacitor emits .v18 with a PackageDescription 5.9 manifest, where .v18 is unavailable.
// A string preserves our exact tested OS floor and works with that manifest API.
if(!/platforms:\s*\[\.iOS\([^\n]+\)\]/.test(source))throw new Error('Unexpected Capacitor package platform declaration');
await writeFile(path,source.replace(/platforms:\s*\[\.iOS\([^\n]+\)\]/,'platforms: [.iOS("18.3")]'));

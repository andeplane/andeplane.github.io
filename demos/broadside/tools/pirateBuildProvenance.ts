import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Plugin } from 'vite';

const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]).sort();
export function pirateBuildProvenance(root:string,privateShip:boolean):Plugin {
  const hash=(paths:string[])=>{
    const sha=createHash('sha256');
    for(const path of paths){sha.update(relative(root,path));sha.update('\0');sha.update(readFileSync(path));sha.update('\0');}
    return sha.digest('hex');
  };
  return {name:'pirate-world-provenance',generateBundle(){
    const source=files(resolve(root,'src')).filter(p=>!p.endsWith('.test.ts'));
    const shared=source.filter(p=>p.includes('/shared/pirate-world/'));
    const assets=files(resolve(root,'public')).filter(p=>/\/(hoard|audio|cave)\//.test(p));
    let revision='unknown';try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
    this.emitFile({type:'asset',fileName:'pirate-world-build.json',source:JSON.stringify({revision,sourceHash:hash(source),sharedHash:hash(shared),assetsHash:hash(assets),privateShip},null,2)+'\n'});
  }};
}

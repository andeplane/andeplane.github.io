import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../src');
const core=resolve(root,'shared/pirate-world');
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):e.name.endsWith('.ts')&&!e.name.endsWith('.test.ts')?[resolve(dir,e.name)]:[]);
const violations=[];
const forbidden=/^(math|reading)\/|^game\/(progress|rewards|voyage|campaign|academy|session|journey|openSea|freeSailing)\.ts$/;
const visited=new Set();
function inspect(file){
  if(visited.has(file))return;visited.add(file);
  const name=relative(root,file).replaceAll('\\','/');
  if(forbidden.test(name)){violations.push(`shared core reaches game rules/save: ${name}`);return;}
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function walk(node){
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
      const ref=node.moduleSpecifier.text;
      if(ref.startsWith('.')){
        const target=ts.resolveModuleName(ref,file,{moduleResolution:ts.ModuleResolutionKind.Bundler},ts.sys).resolvedModule?.resolvedFileName;
        if(target&&target.startsWith(root)) {
          const name=relative(root,target).replaceAll('\\','/');
          if(forbidden.test(name))violations.push(`shared core imports game rules/save: ${name}`);
          else if(!node.importClause?.isTypeOnly)inspect(target);
        }
      }
    }
    ts.forEachChild(node,walk);
  }
  walk(source);
}
for(const file of files(core))inspect(file);
const owned=new Set(['TreasureCave','ShipHold','RewardChest','CargoChests','CoinHoard','Cavern','PrivateShip','Harbour','CaveWalker','CaveGesture','CargoQueue','Delivery','PirateWorld','CoinSounds']);
for(const file of files(root).filter(f=>!f.startsWith(core))){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function walk(node){
    const game=relative(root,file).replaceAll('\\','/');
    if (/^(math|reading)\//.test(game) && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /@babylonjs\/core\/(scene|Meshes|Cameras|Lights|Materials)/.test(node.moduleSpecifier.text))
      violations.push(`game-specific scene/animation implementation: ${game}`);
    if(ts.isClassDeclaration(node)&&node.name&&owned.has(node.name.text))violations.push(`duplicate presentation owner: ${relative(root,file)} ${node.name.text}`);
    if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&['TreasureCave','ShipHold'].includes(node.expression.text)&&!file.endsWith('/ui/debugCoins.ts'))violations.push(`scene construction outside controller: ${relative(root,file)}`);
    ts.forEachChild(node,walk);
  }
  walk(source);
}
if(violations.length){console.error(violations.join('\n'));process.exitCode=1;}else console.log(`Pirate boundary OK: ${visited.size} modules checked, unique scene/animation owners.`);

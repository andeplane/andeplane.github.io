import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { levels } from '../src/levels';
import { replay, serialize } from '../src/engine';
import { runEpisode } from '../src/solver';
import type { Policy } from '../src/solver';
const args=process.argv.slice(2),arg=(key:string,fallback:string)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
if(args.includes('--help')){console.log('npm run headless -- --level all|LEVEL_ID --policy expert|neglect|overwater|shade|no-equipment --runs N --seed N [--json] [--record FILE] [--replay FILE]');process.exit(0);}
if(args.includes('--replay')){const input=JSON.parse(readFileSync(arg('--replay',''),'utf8'));const s=replay(input.levelId,input.seed,input.commands,input.ticks);console.log(serialize(s));process.exit(s.result?.won?0:1);}
const selected=arg('--level','all'),batch=selected==='all'?levels:levels.filter(l=>l.id===selected),runs=Number(arg('--runs','1')),seed=Number(arg('--seed','1')),policy=arg('--policy','expert') as Policy;
if(!batch.length||!Number.isInteger(runs)||runs<1||runs>100000||!Number.isInteger(seed)||seed<0||seed>0xffffffff||!['expert','neglect','overwater','shade','no-equipment'].includes(policy))throw new Error('Invalid headless arguments. Use --help.');
const begin=performance.now(),results=[];let last;
for(const l of batch){let wins=0,rejected=0,minBiomass=Infinity,minHealth=100,stars=0;const failures:Record<string,number>={};for(let i=0;i<runs;i++){const s=runEpisode(l.id,(seed+i)>>>0,policy);last=s;if(s.result?.won)wins++;else for(const reason of s.result?.reasons??['No terminal result'])failures[reason]=(failures[reason]??0)+1;rejected+=s.rejected;stars+=s.result?.stars??0;minBiomass=Math.min(minBiomass,s.game.biomass);minHealth=Math.min(minHealth,s.game.health);}results.push({level:l.id,policy,episodes:runs,wins,winRate:wins/runs,meanStars:stars/runs,minBiomass,minHealth,rejected,failures});}
const ms=performance.now()-begin,total=runs*batch.length,report={engine:'Verdant deterministic v3',elapsedMs:ms,episodes:total,episodesPerSecond:total/(ms/1000),results};
if(args.includes('--record')&&last)writeFileSync(arg('--record',''),serialize(last));
if(args.includes('--json'))console.log(JSON.stringify(report,null,2));else{console.table(results.map(({level,policy,episodes,wins,meanStars,minBiomass,minHealth,rejected})=>({level,policy,episodes,wins,stars:meanStars.toFixed(1),biomass:minBiomass.toFixed(2),health:minHealth.toFixed(0),rejected})));console.log(`${total} complete episodes in ${ms.toFixed(1)} ms (${report.episodesPerSecond.toFixed(1)} games/sec).`);for(const r of results)if(r.wins<r.episodes)console.log(r.level,r.failures);}

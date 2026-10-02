import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {levels} from '../src/levels';
import {runEpisode} from '../src/solver';
import type {Policy} from '../src/solver';
import {replay,serialize} from '../src/engine';
const runs=Number(process.argv[2]??30);if(!Number.isInteger(runs)||runs<1||runs>10000)throw new Error('Expected a positive run count.');
const matrix=[],fixtures=[];
for(const policy of ['expert','no-equipment','overwater','shade','neglect'] as Policy[]){for(const l of levels){let wins=0,rejected=0;for(let seed=1;seed<=runs;seed++){const s=runEpisode(l.id,seed,policy);if(s.result?.won)wins++;rejected+=s.rejected;if(policy==='expert'&&seed===1)fixtures.push(s);}matrix.push({level:l.id,policy,runs,wins,winRate:wins/runs,rejected});}}
for(const s of fixtures)if(serialize(replay(s.levelId,s.seed,s.commands,s.ticks))!==serialize(s))throw new Error('Replay diverged.');
const begin=performance.now(),times=[];let ticks=0;
for(let i=0;i<runs*10;i++)for(const f of fixtures){const t=performance.now();const s=replay(f.levelId,f.seed,f.commands,f.ticks);times.push(performance.now()-t);ticks+=s.ticks;if(!s.result?.won)throw new Error('Benchmark replay did not finish successfully.');}
const ms=performance.now()-begin;times.sort((a,b)=>a-b);
const report={date:new Date().toISOString(),matrix,engineBenchmark:{episodes:times.length,elapsedMs:ms,episodesPerSecond:times.length*1000/ms,fixedTicksPerSecond:ticks*1000/ms,medianEpisodeMs:times[Math.floor(times.length*.5)],p95EpisodeMs:times[Math.floor(times.length*.95)],note:'Complete terminal games, replaying six real command sequences. Includes roots, physiology, resource rules, outcomes, and logs; excludes renderer and reference-agent path planning.'}};
writeFileSync('artifacts/headless-validation.json',JSON.stringify(report,null,2)+'\n');console.table(matrix);console.log(report.engineBenchmark);
if(matrix.some(r=>r.policy==='expert'&&(r.wins!==runs||r.rejected!==0)))process.exitCode=1;

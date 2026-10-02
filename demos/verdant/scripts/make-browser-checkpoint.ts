import {writeFileSync} from 'node:fs';
import {runEpisode} from '../src/solver';
import {replay,serialize} from '../src/engine';
const terminal=runEpisode('first-roots',1),tick=terminal.ticks-4;
const checkpoint=replay(terminal.levelId,terminal.seed,terminal.commands.filter(c=>c.tick<=tick),tick);
if(checkpoint.game.status!=='active')throw new Error('Expected a running checkpoint.');
writeFileSync('artifacts/browser-checkpoint.json',serialize(checkpoint));
console.log({tick,time:checkpoint.game.time,biomass:checkpoint.game.biomass,health:checkpoint.game.health,connections:checkpoint.world.connections});

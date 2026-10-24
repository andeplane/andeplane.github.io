import { readProgress } from '../../src/game/progress';
import { awardVoyage } from '../../src/game/rewards';
import { freshProgress, startVoyage, questionsFor, answerQuestion, deliverMathChest, pendingMathChests } from '../../src/math/academy';
import { writeFileSync, mkdirSync } from 'node:fs';
const destination=process.argv[2]??'/tmp/pirate-game-fixtures';mkdirSync(destination,{recursive:true});
const sailing=readProgress();
for(let i=0;i<40;i++)awardVoyage(sailing,i,3,3);
sailing.cargo=[];sailing.cargoRelics=[];
writeFileSync(`${destination}/broadside.json`,JSON.stringify({'qa.fixture':'broadside-store-20261024-v1','broadside.v1':JSON.stringify(sailing)}));
const calculus=freshProgress();
for(let level=1;level<=11;level++){
  const run=startVoyage(calculus,'add-10',level,level+27)!;
  for(const q of questionsFor('add-10',run.seed,run.questionSet))answerQuestion(calculus,'add-10',level,q.answer);
  if(level<=10)for(const chest of pendingMathChests(calculus))deliverMathChest(calculus,chest.id);
}
const next=startVoyage(calculus,'add-10',12,1234)!;
writeFileSync(`${destination}/answers.json`,JSON.stringify(questionsFor('add-10',next.seed,next.questionSet).map(q=>q.answer)));
writeFileSync(`${destination}/calculus.json`,JSON.stringify({'qa.fixture':'calculus-store-20261024-v2','broadside.math.v1':JSON.stringify(calculus)}));

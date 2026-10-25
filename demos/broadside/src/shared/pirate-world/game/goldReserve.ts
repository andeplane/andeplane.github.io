/** Monetary balances are unlimited; only the loose floor pile has a capacity. */
export const GOLD_PILE_CAPACITY = 10000;
export function defaultReserve(gold:number):number {
  return gold > GOLD_PILE_CAPACITY ? Math.floor((gold-1)/GOLD_PILE_CAPACITY)*GOLD_PILE_CAPACITY : 0;
}
export function reservePlan(gold:number,deposit=0,previousReserve?:number):{reserve:number;pile:number;archived:boolean} {
  if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(deposit)||deposit<0||deposit>gold||deposit>GOLD_PILE_CAPACITY)throw new Error('Invalid gold reserve');
  const previous=gold-deposit;
  let reserve=previousReserve??defaultReserve(previous);
  if(!Number.isSafeInteger(reserve)||reserve<0||reserve>previous||previous-reserve>GOLD_PILE_CAPACITY)reserve=defaultReserve(previous);
  const archived=previous-reserve+deposit>GOLD_PILE_CAPACITY;
  if(archived)reserve=previous;
  return {reserve,pile:gold-reserve,archived};
}
interface Record { gold:number;reserve:number; }
function records(world:number,namespace:string):Record[]{
  try{const data=JSON.parse(localStorage.getItem(`${namespace}.reserve.v1.${world}`)??'[]');return Array.isArray(data)?data.filter(r=>r&&Number.isSafeInteger(r.gold)&&Number.isSafeInteger(r.reserve)&&r.reserve>=0&&r.reserve<=r.gold&&r.gold-r.reserve<=GOLD_PILE_CAPACITY).slice(-2):[];}catch{return [];}
}
export function readGoldReserve(world:number,gold:number,persistent:boolean,namespace='broadside.coin-poses'):number {
  return (persistent?records(world,namespace).find(r=>r.gold===gold)?.reserve:undefined)??defaultReserve(gold);
}
export function saveGoldReserve(world:number,gold:number,reserve:number,persistent:boolean,namespace='broadside.coin-poses'):void {
  if(!persistent)return;
  try{const recent=records(world,namespace).filter(r=>r.gold!==gold);recent.push({gold,reserve});localStorage.setItem(`${namespace}.reserve.v1.${world}`,JSON.stringify(recent.slice(-2)));}catch{/* The full earned balance has its own independent save. */}
}

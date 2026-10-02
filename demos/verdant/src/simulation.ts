import { missions, missionFor } from './missions';
import type { Species, Mission, Equipment, Action } from './missions';
import { getLevel } from './levels';
export * from './missions';
export interface Sample { time: number; health: number; biomass: number; moisture: number; carbon: number; photo: number; respiration: number; temperature: number; oxygen: number; nitrogen: number; salinity: number; acid: number }
export interface Log { time: number; title: string; text: string; type: 'action' | 'science' | 'event' }
export interface GameState {
  version: 1; levelId?: string; species: Species; time: number; biomass: number; health: number; moisture: number;
  carbon: number; nitrogen: number; salinity: number; acid: number; tissueWater: number;
  budget: number; water: number; energy: number; spent: number;
  shade: number; ventilation: number; lamp: boolean; equipment: Equipment[];
  history: Sample[]; logs: Log[]; status: 'active' | 'success' | 'failed'; seen: string[];
}
export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const missionOf = (s: GameState): Mission => s.levelId ? getLevel(s.levelId).mission : missionFor(s.species);
export function createGame(species: Species = 'tomato', levelId?: string): GameState {
  const m = levelId ? getLevel(levelId).mission : missionFor(species);
  const s: GameState = { version: 1, levelId, species, time: 8, biomass: 3.5, health: 94, moisture: m.initialMoisture, carbon: .8,
    nitrogen: m.initialN, salinity: .12, acid: .1, tissueWater: .85, budget: m.budget, water: m.water, energy: m.energy, spent: 0,
    shade: 0, ventilation: 0, lamp: false, equipment: [], history: [], seen: [], status: 'active',
    logs: [{time:8, title:'Specimen received', text: `${m.name} established in a 2 L research vessel. Record a baseline before changing conditions.`,type:'event'}] };
  s.history = [sample(s)]; return s;
}
export function conditions(s: GameState) {
  const m = missionOf(s); const hour = s.time % 24; const day = Math.floor(s.time / 24) + 1;
  const daylight = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI)) * (hour >= 6 && hour <= 18 ? 1 : 0);
  const heatwave = day >= (m.heatStart ?? 5) && day <= (m.heatEnd ?? 8);
  const temperature = m.temperature - 5 + daylight * 8 + (heatwave ? (m.heatBoost ?? 8) : 0) + (daylight === 0 ? (m.nightBoost ?? 0) : 0) - s.ventilation * 4;
  const humidity = clamp(.64 - daylight * .15 - (heatwave ? .12 : 0) - s.ventilation * .12, .15, .95);
  const ppfd = daylight * 820 * m.light * (day >= (m.cloudStart ?? Infinity) && day <= (m.cloudEnd ?? -1) ? (m.cloudFactor ?? 1) : 1) * (1 - s.shade) + (s.lamp && s.equipment.includes('lamp') && s.energy > 0 && hour >= 6 && hour < 20 ? 220 : 0);
  const saturation = .6108 * Math.exp(17.27 * temperature / (temperature + 237.3));
  const vpd = saturation * (1 - humidity);
  const wetLimit = s.species === 'flytrap' ? .84 : .62;
  const oxygen = clamp(1 - Math.max(0, s.moisture - wetLimit) / (s.species === 'flytrap' ? .20 : .24), .04, 1);
  const waterAccess = clamp((s.moisture - (s.species === 'cactus' ? .07 : .13)) / .20);
  const saltStress = clamp(1 - Math.max(0, s.salinity - (s.species === 'flytrap' ? .32 : 1.2)) / (s.species === 'flytrap' ? .65 : 2));
  const nutrient = s.nitrogen / (s.nitrogen + (s.species === 'flytrap' ? 5 : 15));
  const tempOpt = s.species === 'cactus' ? 29 : 25;
  const thermal = Math.exp(-Math.pow((temperature - tempOpt) / 15, 2));
  const waterStatus = s.species === 'cactus' ? clamp(s.tissueWater / .38) : waterAccess;
  const stomata = clamp(waterStatus * oxygen * saltStress * (s.species === 'cactus' ? (daylight < .01 ? 1 : .04) : 1 / (1 + Math.max(0, vpd - 1.5) * .35)));
  const area = Math.pow(s.biomass / 3.5, .78);
  const maxPhoto = s.species === 'cactus' ? .115 : s.species === 'flytrap' ? .16 : .31;
  const photoPotential = maxPhoto * area * ppfd / (ppfd + 250) * thermal * (s.health / 100);
  const photo = photoPotential * nutrient * saltStress * (s.species === 'cactus' ? Math.min(1, s.acid / .06) * waterStatus : stomata);
  const respiration = (s.species === 'cactus' ? .011 : s.species === 'flytrap' ? .017 : .023) * area * Math.pow(2, (temperature - 25) / 10);
  return { hour, day, daylight, heatwave, temperature, humidity, ppfd, vpd, oxygen, waterAccess, saltStress, nutrient, thermal, stomata, photo, respiration };
}
export function sample(s: GameState): Sample {
  const c = conditions(s);
  return {time:s.time, health:s.health, biomass:s.biomass, moisture:s.moisture, carbon:s.carbon, photo:c.photo, respiration:c.respiration, temperature:c.temperature, oxygen:c.oxygen, nitrogen:s.nitrogen, salinity:s.salinity, acid:s.acid};
}
function log(s: GameState, title: string, text: string, type: Log['type'] = 'science') { s.logs = [{time:s.time,title,text,type},...s.logs].slice(0,80); }
function observe(s: GameState, key: string, title: string, text: string) { if (!s.seen.includes(key)) { s.seen.push(key); log(s,title,text); } }
export function advance(state: GameState, hours: number, mutable = false): GameState {
  if (state.status !== 'active') return state;
  const s: GameState = mutable ? state : {...state,equipment:[...state.equipment],logs:[...state.logs],history:[...state.history],seen:[...state.seen]};
  const dt = .25;
  for (let i=0; i<Math.floor(hours/dt + 1e-8) && s.status==='active'; i++) {
    const c = conditions(s);
    const cam = s.species==='cactus';
    if(cam) {
      if(c.daylight<.01) s.acid = clamp(s.acid + .035*c.stomata*c.thermal*dt,0,.7);
      else s.acid = Math.max(0,s.acid-c.photo*dt);
      s.tissueWater = clamp(s.tissueWater + (c.waterAccess*c.oxygen*.012 - .0015*c.vpd*(c.daylight<.01?1:.25))*dt,0,1);
    }
    const transpiration = (cam ? .00065 : s.species==='flytrap' ? .0014 : .0022) * Math.pow(s.biomass/3.5,.65) * c.vpd * c.stomata * (cam ? (c.daylight < .01 ? 1 : .1) : (.15+.85*c.daylight));
    const evaporation = .00065 * c.vpd * (1-s.shade*.5);
    const drainage = Math.max(0,s.moisture-(s.equipment.includes('drainage')?.49:.72)) * (s.equipment.includes('drainage')?.15:.03);
    s.moisture=clamp(s.moisture-(transpiration+evaporation+drainage)*dt, .015, .98);
    // Carbon pool is grams of carbohydrate equivalent; biomass growth has a construction cost.
    s.carbon=Math.max(-.5,s.carbon+(c.photo-c.respiration)*dt);
    const growthRate = cam ? .012 : s.species==='flytrap' ? .017 : .036;
    const nitrogenPerGram = cam ? 12 : s.species==='flytrap' ? 15 : 25;
    const growth = Math.min(Math.max(0,s.carbon-.35)/1.5, growthRate*c.nutrient*c.thermal*c.oxygen*c.saltStress*(s.health/100)*dt, s.nitrogen/nitrogenPerGram);
    s.biomass += growth; s.carbon -= growth*1.5; s.nitrogen=Math.max(0,s.nitrogen-growth*nitrogenPerGram);
    s.salinity=Math.max(.03,s.salinity-drainage*s.salinity*.5*dt);
    const waterStress = cam ? 1-clamp(s.tissueWater/.32) : 1-c.waterAccess;
    const damage=waterStress*1.9+(1-c.oxygen)*1.7+(1-c.saltStress)*2.1+Math.max(0,c.temperature-37)*.22+(s.carbon<0?1.1:0);
    s.health=clamp(s.health+(.12*c.waterAccess*c.oxygen*c.saltStress-damage)*dt,0,100);
    const lampEnergy=s.lamp && s.equipment.includes('lamp') && c.hour>=6 && c.hour<20?.035:0;
    const fanEnergy=s.equipment.includes('fan')?s.ventilation*.012:0;
    const power = (lampEnergy+fanEnergy)*dt;
    s.energy=Math.max(0,s.energy-power); if(s.energy===0) {s.lamp=false; if(s.equipment.includes('fan'))s.ventilation=0;}
    s.time+=dt;
    if(c.heatwave) observe(s,'heat','Heatwave arrived','Air temperature is rising. Watch vapor-pressure deficit: warm, dry air increases water demand.');
    if(c.oxygen<.5) observe(s,'oxygen','Roots under pressure','Saturated pores leave little space for air. Root oxygen is low; adding water may worsen the problem.');
    if(c.waterAccess<.4&&!cam) observe(s,'dry','Water stress detected','Root-zone moisture is low. Stomatal closure limits carbon uptake before severe wilting appears.');
    if(s.nitrogen<12) observe(s,'nitrogen','Growth is nutrient-limited','Low available nitrogen is slowing construction of new tissue. More light alone cannot resolve this.');
    if(s.carbon<0) observe(s,'carbon','Reserves are falling','Respiration is using more carbohydrate than photosynthesis supplies. Compare the full day, including the night.');
    if(s.energy===0) observe(s,'power','Energy allowance exhausted','Powered equipment has stopped. Natural light and passive ventilation remain available.');
    if(s.health<=15) {s.status='failed';log(s,'Specimen lost','Vitality fell below the recovery threshold. Review the record, then restart with the original grant.','event');}
    if(s.time>=missionOf(s).days*24) {
      const m=missionOf(s); s.status=s.health>15 && s.biomass>=m.target && s.health>=75?'success':'failed';
      log(s,s.status==='success'?'Research objective achieved':'Research objective missed',s.status==='success'?'Your specimen met both the growth and vitality requirements. The complete record is ready for review.':'The deadline has arrived. Compare growth and vitality with the target, and use the evidence for your next attempt.','event');
    }
    if(Math.abs(s.time%3)<.001) s.history=[...s.history,sample(s)].slice(-200);
  }
  return s;
}
export const equipmentInfo: { id: Equipment; name: string; price: number; description: string }[] = [
  {id:'drainage',name:'Drainage insert',price:45,description:'Drains excess water toward field capacity. Useful for tomato and cactus; use cautiously for a bog plant.'},
  {id:'sensor',name:'Root-zone probe',price:30,description:'Measures soil saturation, estimated root aeration, and the dissolved salt index.'},
  {id:'lamp',name:'Grow light',price:55,description:'Adds 220 µmol m⁻² s⁻¹ from 06:00–20:00. Uses 35 W from your energy allowance.'},
  {id:'fan',name:'Ventilation fan',price:35,description:'Adds forced cooling. Also lowers humidity and can increase water loss. Up to 12 W.'},
];
export function buyEquipment(state: GameState, item: Equipment): GameState {
  const e=equipmentInfo.find(e=>e.id===item)!;
  if(state.status!=='active'||state.equipment.includes(item)||state.budget<e.price)return state;
  const s={...state,equipment:[...state.equipment,item],budget:state.budget-e.price,spent:state.spent+e.price,logs:[...state.logs]};
  log(s,`${e.name} installed`,e.description,'action'); return s;
}
export function act(state: GameState, action: Action): GameState {
  if(state.status!=='active'||(action==='prune'&&state.species!=='tomato'))return state;
  const s={...state,logs:[...state.logs]};
  if(action.startsWith('water')) {
    const amount=Number(action.replace('water',''))/1000;
    if(s.water+1e-8<amount)return state;
    s.water=Math.max(0,s.water-amount);s.moisture=clamp(s.moisture+amount/2,0,.98);
    log(s,`${amount*1000} mL water applied`,'Low-mineral water entered the root zone. Track the response before applying more.','action');
  }else if(action==='feed') {
    if(s.budget<12)return state;s.budget-=12;s.spent+=12;s.nitrogen+=45;s.salinity+=.38;
    log(s,'Mineral nutrients added','45 mg available nitrogen added. Dissolved salts also increased: more fertilizer is not always better.','action');
  }else if(action==='prey') {
    if(s.species!=='flytrap'||s.budget<8)return state;s.budget-=8;s.spent+=8;s.nitrogen+=18;s.carbon=Math.max(-.5,s.carbon-.1);
    log(s,'Prey supplied','Digestion provides 18 mg available nitrogen in this simplified model and has a carbohydrate cost. It is not an energy replacement for light.','action');
  }else {
    if(s.biomass<=2.5)return state;s.biomass*=.88;s.carbon=Math.max(-.5,s.carbon-.12);
    log(s,'Canopy pruned','12% of dry biomass removed. A smaller canopy uses less water but also captures less light.','action');
  }
  return s;
}
export function diagnosis(s: GameState): {title:string; text:string; tone:'good'|'warn'|'bad'} {
  const c=conditions(s);
  if(s.status==='success')return{title:'A successful establishment',text:'Growth and vitality targets achieved. Review your experiment or begin a new assignment.',tone:'good'};
  if(s.status==='failed')return{title:'An experiment to learn from',text:'Review the trends and observations. Your original grant is restored when you restart.',tone:'bad'};
  if(c.saltStress<.7)return{title:'Salt stress',text:'Dissolved salts are restricting water uptake. Avoid further mineral feeding and consider drainage.',tone:'bad'};
  if(c.oxygen<.65)return{title:'The roots need air',text:'The root zone is very wet. Check aeration before reaching for the watering can.',tone:'warn'};
  if(s.species!=='cactus'&&c.waterAccess<.55)return{title:'Water supply is tightening',text:'Stomata are restricting gas exchange. A measured drink may help; watch the root-zone response.',tone:'warn'};
  if(s.species==='cactus'&&s.tissueWater<.35)return{title:'Stored water is running low',text:'The succulent is drawing down its tissue reservoir. Check the soil before watering.',tone:'warn'};
  if(s.nitrogen<12)return{title:'Growth needs building materials',text:s.species==='flytrap'?'A small prey supplement supplies nitrogen without enriching the bog substrate.':'Available nitrogen is low. A measured nutrient dose can help, but adds dissolved salts.',tone:'warn'};
  if(s.carbon<.1)return{title:'Carbon reserves are low',text:'Compare daytime photosynthesis with nighttime respiration. More shade may deepen the deficit.',tone:'warn'};
  if(c.heatwave)return{title:'A warmer few days',text:'The heatwave is increasing evaporative demand. Balance cooling, shade, and the water allowance.',tone:'warn'};
  return{title:'Steady, living progress',text:'Conditions support growth. Establish a baseline, then change one variable at a time.',tone:'good'};
}
export function validSave(value: unknown): value is GameState {
  if (!value || typeof value!=='object')return false;
  const v=value as GameState;
  return v.version===1 && (v.levelId===undefined || (typeof v.levelId==='string' && !!getLevel(v.levelId,false))) && missions.some(m=>m.id===v.species) && ['active','success','failed'].includes(v.status)
    && ['time','biomass','health','moisture','carbon','nitrogen','salinity','acid','tissueWater','budget','water','energy','spent','shade','ventilation'].every(k=>typeof v[k as keyof GameState]==='number'&&Number.isFinite(v[k as keyof GameState]))
    && v.time>=0&&v.time<=600&&v.biomass>0&&v.biomass<100&&v.health>=0&&v.health<=100&&v.water>=0&&v.energy>=0&&v.budget>=0&&v.shade>=0&&v.shade<=.7&&v.ventilation>=0&&v.ventilation<=1
    && typeof v.lamp==='boolean' && Array.isArray(v.equipment) && v.equipment.every(e=>equipmentInfo.some(i=>i.id===e))
    && Array.isArray(v.seen)&&v.seen.every(e=>typeof e==='string')&&Array.isArray(v.history)&&v.history.length<=200&&v.history.every(p=>p&&['time','health','biomass','moisture','carbon','photo','respiration','temperature','oxygen','nitrogen','salinity','acid'].every(k=>Number.isFinite(p[k as keyof Sample])))
    && Array.isArray(v.logs)&&v.logs.length<=80&&v.logs.every(l=>l&&typeof l.title==='string'&&typeof l.text==='string'&&Number.isFinite(l.time)&&['action','science','event'].includes(l.type));
}

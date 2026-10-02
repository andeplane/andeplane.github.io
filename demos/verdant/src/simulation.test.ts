import { describe, it, expect } from 'vitest';
import { act, advance, buyEquipment, conditions, createGame, missionFor, missions, validSave } from './simulation';
import type { GameState, Species } from './simulation';
function manage(species: Species) {
  let s=createGame(species);
  if(species!=='flytrap')s=buyEquipment(s,'drainage');
  for(let i=0;i<450 && s.status==='active';i++) {
    const c=conditions(s);
    if(s.moisture<(species==='cactus'?.17:species==='flytrap'?.5:.32))s=act(s,'water250');
    if(s.nitrogen<(species==='flytrap'?8:20))s=act(s,species==='flytrap'?'prey':'feed');
    s={...s,ventilation:c.heatwave?.35:0,shade:c.heatwave&&species==='tomato'?.15:0};
    s=advance(s,3);
  }
  return s;
}
describe('physiology and experiment rules',()=>{
  it('stops carbon assimilation at night while respiration continues',()=>{
    const s={...createGame(),time:23};const c=conditions(s);expect(c.photo).toBe(0);expect(c.respiration).toBeGreaterThan(0);
  });
  it('waterlogging restricts tomato oxygen more than bog plant oxygen',()=>{
    const tomato=conditions({...createGame('tomato'),moisture:.80});const flytrap=conditions({...createGame('flytrap'),moisture:.80});
    expect(tomato.oxygen).toBeLessThan(.3);expect(flytrap.oxygen).toBe(1);
  });
  it('stores carbon in the CAM acid pool at night, then consumes it in daylight',()=>{
    const night=advance({...createGame('cactus'),time:22,acid:.1},3);expect(night.acid).toBeGreaterThan(.1);
    const day=advance({...night,time:10},3);expect(day.acid).toBeLessThan(night.acid);expect(conditions({...day,time:12}).photo).toBeGreaterThan(0);
  });
  it('mineral feeding stresses the flytrap; prey supplements nitrogen with a carbon cost',()=>{
    const original=createGame('flytrap');const prey=act(original,'prey');expect(prey.nitrogen).toBeGreaterThan(original.nitrogen);expect(prey.carbon).toBeLessThan(original.carbon);
    let fed=original;for(let i=0;i<3;i++)fed=act(fed,'feed');expect(conditions(fed).saltStress).toBeLessThan(.3);expect(conditions(prey).saltStress).toBe(1);
  });
  it('conserves budgets and prevents repeat equipment charges or overspending',()=>{
    const original=createGame();let s=buyEquipment(original,'lamp');expect(s.budget).toBe(original.budget-55);expect(buyEquipment(s,'lamp')).toBe(s);
    s={...s,budget:0};expect(act(s,'feed')).toBe(s);expect(buyEquipment(s,'sensor')).toBe(s);
  });
  it('never supplies water beyond the allowance',()=>{const s={...createGame(),water:.1};expect(act(s,'water250')).toBe(s);expect(act(s,'water100').water).toBe(0);});
  it('halts at the deadline and locks interventions after completion',()=>{
    const s=advance({...createGame(),time:287,biomass:7,health:90},6);expect(s.time).toBe(288);expect(s.status).toBe('success');expect(act(s,'water100')).toBe(s);expect(advance(s,24)).toBe(s);
  });
  it('produces equal results regardless of time batching',()=>{const s=createGame();let split=s;for(let i=0;i<24;i++)split=advance(split,1);const all=advance(s,24);expect(split.biomass).toBeCloseTo(all.biomass,10);expect(split.moisture).toBeCloseTo(all.moisture,10);});
  it('rejects corrupt or out-of-range saves',()=>{const s=createGame();expect(validSave(s)).toBe(true);expect(validSave({...s,health:Infinity})).toBe(false);expect(validSave({...s,equipment:['unknown']})).toBe(false);expect(validSave({...s,history:[{time:0}]})).toBe(false);});
  it.each(missions.map(m=>[m.id]))('has a viable limited-resource strategy for %s',(species)=>{
    const result=manage(species as Species);console.log(species,{status:result.status,biomass:result.biomass,health:result.health,water:result.water,budget:result.budget,carbon:result.carbon,moisture:result.moisture});
    expect(result.status).toBe('success');expect(result.biomass).toBeGreaterThanOrEqual(missionFor(species as Species).target);expect(result.health).toBeGreaterThanOrEqual(75);
  });
  it('makes neglect fail to achieve the tomato objective',()=>{expect(advance(createGame(),288).status).toBe('failed');});
});

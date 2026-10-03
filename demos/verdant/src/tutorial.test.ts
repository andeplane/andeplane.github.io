import { describe, expect, it } from 'vitest';
import { createSession, dispatch, step, serialize } from './engine';
import { lessonAllows, lessonSatisfied, lessonTarget, lessons } from './tutorial';

describe('guided practice uses real game actions',()=>{
 it('routes a real root around both rocks to water and nitrogen before teaching supplies',()=>{
  let s=createSession('first-roots',1);const original=serialize(s);
  for(const index of [1,2,3,4]){
   expect(lessonSatisfied(index,s,false)).toBe(false);
   const point=lessonTarget(index,s)!;expect(lessonAllows(index,{type:'target',point})).toBe(true);
   s=dispatch(s,{type:'target',point}).session;
   let ticks=0;while(!lessonSatisfied(index,s,false)&&ticks++<60)s=step(s,.25);
   expect(lessonSatisfied(index,s,false),lessons[index].id).toBe(true);
   expect(s.game.status).toBe('active');
   s=dispatch(s,{type:'switch-tip',index:s.world.active}).session;
  }
  expect(s.world.connections).toBe(2);expect(s.world.deposits[0].connected).toBe(true);expect(s.world.deposits[3].connected).toBe(true);
  expect(serialize(createSession('first-roots',1))).toBe(original);
  for(const [index,command] of [[6,{type:'water',amount:100}],[7,{type:'shade',value:.2}],[8,{type:'buy',item:'drainage'}],[9,{type:'branch'}]] as const){
   expect(lessonSatisfied(index,s,true)).toBe(false);expect(lessonAllows(index,command)).toBe(true);
   const r=dispatch(s,command);expect(r.accepted).toBe(true);s=r.session;expect(lessonSatisfied(index,s,true)).toBe(true);
  }
  expect(lessonSatisfied(10,s,false)).toBe(false);expect(lessonSatisfied(10,s,true)).toBe(true);
  expect(s.game.budget).toBe(50);expect(s.game.water).toBeCloseTo(.8);expect(s.world.paths).toHaveLength(2);
 });
 it('does not complete instruction cards automatically or accept unrelated resource spending',()=>{
  const s=createSession();for(const index of [0,5,11])expect(lessonSatisfied(index,s,true)).toBe(false);
  expect(lessonAllows(8,{type:'buy',item:'lamp'})).toBe(false);
  expect(lessonAllows(6,{type:'feed',source:'mineral'})).toBe(false);
  expect(lessonAllows(1,{type:'water',amount:500})).toBe(false);
 });
});

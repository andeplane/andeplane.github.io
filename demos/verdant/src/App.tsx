import { useCallback, useEffect, useRef, useState } from 'react';
import { PlantScene } from './PlantScene';
import { GameHUD, hudHit, tools } from './GameHUD';
import type { Tool, Screen, Hit } from './GameHUD';
import { createSession, deserialize, dispatch, newCampaign, recordWin, restoreCampaign, serialize, step, unlocked } from './engine';
import type { Campaign, Command, Session } from './engine';
import { getLevel, levels, nextLevel } from './levels';
import type { Layer, Equipment } from './simulation';
import type { Point } from './rootWorld';
import { lessons, lessonAllows, lessonSatisfied, lessonTarget } from './tutorial';
import { TutorialOverlay } from './TutorialOverlay';
const PREFIX=location.search.includes('qa=1')?'verdant.qa.v3':'verdant.game.v3';
function load():Session {try{return deserialize(localStorage.getItem(PREFIX)??'');}catch{return createSession();}}
export default function App() {
 const [session,setSession]=useState<Session>(load);
 const [campaign,setCampaign]=useState<Campaign>(()=>restoreCampaign(localStorage.getItem(`${PREFIX}.campaign`)));
 const [screen,setScreen]=useState<Screen>(session.game.status==='active'?'brief':'play');
 const [tutorial,setTutorial]=useState<number|null>(null);
 const savedGame=useRef<{session:Session;screen:Screen;paused:boolean}|null>(null),offeredTutorial=useRef(false);
 const [paused,setPaused]=useState(false),[tool,setTool]=useState<Tool>('root'),[layer,setLayer]=useState<Layer>('natural'),[speed,setSpeed]=useState(1),[toast,setToast]=useState(''),[inspect,setInspect]=useState(false);
 const live=useRef({session,campaign,screen,paused,tool,layer,speed,tutorial});live.current={session,campaign,screen,paused,tool,layer,speed,tutorial};
 const fileInput=useRef<HTMLInputElement>(null);
 const held=useRef(new Set<string>()),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const notify=useCallback((message:string)=>{setToast(message);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),4200);},[]);
 const issue=useCallback((command:Command,feedback=true)=>{const p=live.current;if(p.tutorial!==null&&!lessonAllows(p.tutorial,command)){notify(`For this step: ${lessons[p.tutorial].task}`);return false;}const result=dispatch(p.session,command);live.current.session=result.session;setSession(result.session);if((feedback||!result.accepted)&&result.message)notify(result.message);return result.accepted;},[notify]);
 const startTutorial=useCallback(()=>{const p=live.current;if(!savedGame.current)savedGame.current={session:p.session,screen:p.screen,paused:p.paused};const practice=createSession('first-roots',1);live.current={...p,session:practice,tutorial:0,screen:'play',paused:true,tool:'root'};setSession(practice);setTutorial(0);setScreen('play');setPaused(true);setTool('root');setLayer('natural');setInspect(false);setToast('');held.current.clear();},[]);
 const finishTutorial=useCallback((completed:boolean)=>{const saved=savedGame.current;if(!saved)return;const view=completed?'play':saved.screen;live.current={...live.current,session:saved.session,tutorial:null,screen:view,paused:completed?false:true};setSession(saved.session);setTutorial(null);setScreen(view);setPaused(completed?false:true);setTool('root');setLayer('natural');setInspect(false);setSpeed(1);held.current.clear();savedGame.current=null;try{localStorage.setItem(`${PREFIX}.tutorial.v1`,'done');}catch{/* Training remains available with T. */}notify(completed?'Your real assignment begins. Guide roots to water and nitrogen. P pauses; T repeats training.':'Your saved plant is unchanged. T repeats training; P resumes time.');},[notify]);
 const advanceTutorial=useCallback((expected=live.current.tutorial)=>{const p=live.current;if(p.tutorial===null||p.tutorial!==expected)return;if(p.tutorial===lessons.length-1){finishTutorial(true);return;}const index=p.tutorial+1,s=dispatch(p.session,{type:'switch-tip',index:p.session.world.active}).session,next=lessons[index];live.current={...p,session:s,tutorial:index,screen:'play',paused:!['grow','pause'].includes(next.kind),tool:next.kind==='grow'||next.id==='branch'?'root':p.tool};setSession(s);setTutorial(index);setScreen('play');setPaused(live.current.paused);setTool(live.current.tool);setToast('');held.current.clear();},[finishTutorial]);
 useEffect(()=>{if(offeredTutorial.current)return;offeredTutorial.current=true;try{if(localStorage.getItem(`${PREFIX}.tutorial.v1`)==='done')return;}catch{/* Offer training if storage is unavailable. */}startTutorial();},[startTutorial]);
 useEffect(()=>{if(tutorial!==null&&lessonSatisfied(tutorial,session,paused))advanceTutorial(tutorial);},[tutorial,session,paused,advanceTutorial]);
 const clearMovement=useCallback(()=>{held.current.clear();if(live.current.session.game.status==='active'&&live.current.session.direction)issue({type:'direction',point:{x:0,y:0}},false);},[issue]);
 const choose=useCallback((id:string)=>{if(!unlocked(live.current.campaign,id)){notify('Complete the preceding assignment to unlock this habitat.');return;}const s=createSession(id,live.current.session.seed);live.current.session=s;setSession(s);setScreen('brief');setPaused(false);setTool('root');setLayer('natural');held.current.clear();},[notify]);
 const begin=useCallback(()=>{setScreen('play');setPaused(false);notify(getLevel(live.current.session.levelId).lesson);},[notify]);
 const next=useCallback(()=>{const s=live.current.session;if(!s.result?.won){choose(s.levelId);return;}const level=nextLevel(s.levelId);if(level)choose(level.id);else{setScreen('missions');notify('All six assignments completed. Replay any habitat for three stars.');}},[choose,notify]);
 const buy=useCallback((id:Equipment)=>issue({type:'buy',item:id}),[issue]);
 const select=useCallback((id:Tool)=>{clearMovement();setTool(id);notify(id==='feed'&&live.current.session.game.species==='flytrap'?'Click a trap to supply prey (€8). Insects provide minerals.':tools.find(t=>t.id===id)!.hint);},[clearMovement,notify]);
 const handleHit=useCallback((hit:Hit)=>{const p=live.current;if(p.tutorial!==null){if(hit.action==='tool'){select(hit.value as Tool);return;}if(hit.action==='menu'&&hit.value==='equipment'&&lessons[p.tutorial].id==='equipment'){setScreen('equipment');return;}if(hit.action==='buy'){buy(hit.value as Equipment);return;}if(hit.action==='pause'&&['grow','pause'].includes(lessons[p.tutorial].kind)){setPaused(v=>!v);return;}return;}if(hit.action==='start')begin();else if(hit.action==='resume'){setScreen('play');setPaused(false);}else if(hit.action==='tool')select(hit.value as Tool);else if(hit.action==='menu'){clearMovement();setScreen(hit.value as Screen);}else if(hit.action==='buy')buy(hit.value as Equipment);else if(hit.action==='species')choose(hit.value!);else if(hit.action==='retry')choose(live.current.session.levelId);else if(hit.action==='next')next();else if(hit.action==='pause'){clearMovement();setPaused(p=>!p);}},[begin,buy,choose,next,select,clearMovement]);
 // Wall time is only a browser adapter. All root, physiology, and completion rules are engine ticks.
 useEffect(()=>{let before=performance.now();const timer=setInterval(()=>{const now=performance.now(),elapsed=Math.min(250,now-before);before=now;const p=live.current;if(p.screen!=='play'||p.paused||p.session.game.status!=='active')return;if(p.tutorial!==null&&lessons[p.tutorial].kind!=='pause'&&!p.session.world.target&&!p.session.direction)return;const s=step(p.session,elapsed/1400*(p.tutorial!==null?2:p.speed));live.current.session=s;setSession(s);},100);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(session.world.message)notify(session.world.message);},[session.world.message,notify]);
 useEffect(()=>{if(tutorial===null&&session.result?.won)setCampaign(c=>{const next=recordWin(c,session);return JSON.stringify(c)===JSON.stringify(next)?c:next;});},[session,tutorial]);
 useEffect(()=>{if(tutorial!==null)return;const timer=setTimeout(()=>{try{localStorage.setItem(PREFIX,serialize(session));}catch{notify('Local saving is unavailable. Keep this tab open.');}},700);return()=>clearTimeout(timer);},[session,tutorial,notify]);
 useEffect(()=>{try{localStorage.setItem(`${PREFIX}.campaign`,JSON.stringify(campaign));}catch{/* Game remains playable. */}},[campaign]);
 useEffect(()=>{const flush=()=>{try{localStorage.setItem(PREFIX,serialize(savedGame.current?.session??live.current.session));localStorage.setItem(`${PREFIX}.campaign`,JSON.stringify(live.current.campaign));}catch{/* Normal autosave reports storage failures. */}};window.addEventListener('pagehide',flush);return()=>window.removeEventListener('pagehide',flush);},[]);
 useEffect(()=>{const movement=()=>{const p=live.current;if(p.screen!=='play'||p.paused||p.tool!=='root'||p.session.game.status!=='active')return;const keys=held.current;const x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),y=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);issue({type:'direction',point:{x,y}},false);};
 const down=(e:KeyboardEvent)=>{const k=e.key.toLowerCase(),p=live.current;if(['tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(e.repeat)return;held.current.add(k);
  if((e.target as HTMLElement).closest?.('.tutorial-panel,.tutorial-beacon')&&['enter',' '].includes(k))return;
  if(k==='t'){e.preventDefault();startTutorial();return;}
  if(p.tutorial!==null){const lesson=lessons[p.tutorial];if(k==='escape'){if(p.screen!=='play')setScreen('play');else finishTutorial(false);return;}if(k==='enter'){if(lesson.kind==='read')advanceTutorial();return;}if(k==='e'){if(lesson.id==='equipment')setScreen(p.screen==='equipment'?'play':'equipment');return;}if(['h','j','m','r','l','f','i','+','=','f9','f10'].includes(k))return;if((k==='p'||k===' ')&&!['grow','pause'].includes(lesson.kind))return;}
  if(k==='f9'){e.preventDefault();const data=serialize(p.session),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`verdant-${p.session.levelId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Checkpoint exported. Use it in the headless engine or resume with F10.');return;}if(k==='f10'){e.preventDefault();clearMovement();setPaused(true);fileInput.current?.click();return;}
  if(p.screen==='brief'){if(k==='enter'||k===' ')begin();else if(k==='r')choose(p.session.levelId);return;}
  if(k==='escape'){clearMovement();setScreen(p.screen==='play'?'pause':'play');return;}
  if(k==='h'||k==='j'||k==='e'||k==='m'){clearMovement();const view:Screen=k==='h'?'guide':k==='j'?'journal':k==='e'?'equipment':'missions';setScreen(p.screen===view?'play':view);return;}
  if(k==='r'){choose(p.session.levelId);return;}
  if(p.screen==='equipment'){const i=Number(k)-1;if(i>=0&&i<4)buy(['drainage','sensor','lamp','fan'][i] as Equipment);return;}
  if(p.screen==='missions'){const i=Number(k)-1;if(i>=0&&i<levels.length)choose(levels[i].id);return;}
  if(p.session.game.status!=='active'){if(k==='enter')next();return;}
  if(p.screen==='pause'){if(k==='p'||k===' '){setScreen('play');setPaused(false);}return;}
  if(p.screen!=='play'){if(k===' ')setScreen('play');return;}
  if(k==='p'||k===' '){clearMovement();setPaused(v=>!v);return;}
  if(k==='i'){setInspect(v=>!v);return;}if(k==='f'){setLayer(l=>l==='natural'?'water':l==='water'?'carbon':'natural');return;}
  if(k==='+'||k==='='){setSpeed(v=>v===1?4:v===4?12:1);return;}
  if(k==='l'){issue({type:'lamp',enabled:!p.session.game.lamp});return;}
  if(k==='b'){issue({type:'branch'});setTool('root');return;}if(k==='tab'){issue({type:'switch-tip'});return;}
  const i=Number(k)-1;if(i>=0&&i<tools.length){select(tools[i].id);return;}
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k))movement();
 };
 const up=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();held.current.delete(k);if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k))movement();};
 const blur=()=>{clearMovement();setPaused(true);};
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 },[begin,buy,choose,next,issue,select,clearMovement,startTutorial,finishTutorial,advanceTutorial]);
 const worldClick=useCallback((point:Point)=>{const p=live.current;if(p.screen!=='play'||p.session.game.status!=='active')return;const g=p.session.game;
  if(p.tool==='root'){issue({type:'target',point},false);if(p.paused)notify('Destination set. Press P to grow.');}
  else if(p.tool==='water')issue({type:'water',amount:100});
  else if(p.tool==='feed'){if(g.species==='flytrap'&&point.y<=0){notify('Aim at a trap to supply prey.');return;}issue({type:'feed',source:g.species==='flytrap'?'prey':'mineral'});}
  else if(p.tool==='shade')issue({type:'shade',value:g.shade>=.39?0:g.shade+.2});
  else if(p.tool==='vent')issue({type:'ventilation',value:g.equipment.includes('fan')?(g.ventilation>=.99?0:Math.min(1,g.ventilation+.5)):(g.ventilation>=.3?0:.35)});
  else {if(point.y<=0){notify('Aim at the canopy to prune foliage.');return;}issue({type:'prune'});}
 },[issue,notify]);
 const hudProps={state:session.game,world:session.world,session,campaign,tool,screen,layer,paused,speed,toast:tutorial===null?toast:'',inspect,complete:!!session.result?.won,tutorialActive:tutorial!==null};
 const marker=tutorial===null?null:lessonTarget(tutorial,session);
 return <div className={`game-world mode-${screen}${tutorial!==null?' training':''}`} data-tutorial-step={tutorial===null?'off':lessons[tutorial].id} onContextMenu={e=>e.preventDefault()} onPointerDownCapture={e=>{if((e.target as HTMLElement).closest('.tutorial-panel,.tutorial-beacon'))return;const r=e.currentTarget.getBoundingClientRect(),hit=hudHit(e.clientX-r.left,e.clientY-r.top,r.width,r.height,hudProps);if(hit){e.stopPropagation();handleHit(hit);}}}>
  <PlantScene key={`${session.levelId}/${session.seed}/${tutorial!==null?'practice':'assignment'}`} state={session.game} world={session.world} layer={layer} onWorldClick={worldClick} tool={tool} tutorialMarker={marker?{point:marker,label:lessons[tutorial!].id==='water-tool'?'Water here':lessons[tutorial!].id==='shade'?'Apply shade here':lessons[tutorial!].id==='water-patch'?'Reach water':lessons[tutorial!].id==='nitrogen-patch'?'Reach nitrogen':'Grow here'}:null}/>
  <GameHUD {...hudProps}/>
  {tutorial!==null&&<TutorialOverlay index={tutorial} paused={paused} message={toast} onContinue={()=>advanceTutorial()} onSkip={()=>finishTutorial(false)} onBranch={()=>issue({type:'branch'})} onPause={()=>setPaused(true)} onEquipment={()=>setScreen(v=>v==='equipment'?'play':'equipment')} onBuyDrainage={()=>buy('drainage')} equipmentOpen={screen==='equipment'} vitality={session.game.health} carbon={session.game.carbon} time={session.game.time}/>}
  <input ref={fileInput} data-testid="checkpoint-import" className="game-accessibility" type="file" accept=".json,application/json" aria-label="Import game checkpoint" onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(!file)return;try{const s=deserialize(await file.text());live.current.session=s;setSession(s);held.current.clear();setScreen('play');setPaused(true);setTool('root');notify('Checkpoint restored. P resumes the same engine state.');}catch{notify('Invalid checkpoint. Your current experiment was preserved.');}}}/>
  <div className="game-accessibility" role="status" aria-live="polite">{tutorial!==null?`Tutorial ${tutorial+1}/${lessons.length}: ${lessons[tutorial].title} ${lessons[tutorial].task}`:screen==='brief'?`${getLevel(session.levelId).title}. Press Enter to begin. T starts guided training.`:toast||`${getLevel(session.levelId).title}: ${session.game.biomass.toFixed(2)} grams, ${session.game.health.toFixed(0)} percent vitality, day ${Math.floor(session.game.time/24)+1}, ${session.world.connections} resource patches.`}</div>
 </div>;
}

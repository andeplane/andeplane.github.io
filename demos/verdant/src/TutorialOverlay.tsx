import { lessons } from './tutorial';
export function TutorialOverlay({index,paused,message,onContinue,onSkip,onBranch,onPause,onEquipment,onBuyDrainage,equipmentOpen,vitality,carbon,time}:{index:number;paused:boolean;message:string;onContinue:()=>void;onSkip:()=>void;onBranch:()=>void;onPause:()=>void;onEquipment:()=>void;onBuyDrainage:()=>void;equipmentOpen:boolean;vitality:number;carbon:number;time:number}) {
 const lesson=lessons[index],last=index===lessons.length-1;
 return <aside className="tutorial-panel" aria-label="Guided plant tutorial" onPointerDown={e=>e.stopPropagation()}>
  <div className="tutorial-meta"><span>FIELD TRAINING · {index+1} / {lessons.length}</span><button onClick={onSkip}>Skip tutorial</button></div>
  <div className="tutorial-progress" aria-hidden="true">{lessons.map((s,i)=><i key={s.id} className={i<=index?'done':''}/>)}</div>
  <h1>{lesson.title}</h1><p>{lesson.body}</p><p className="tutorial-task" role="status">{lesson.task}</p>
  {lesson.id==='readings'&&<div className="tutorial-readings"><span>VITALITY <strong>{vitality.toFixed(0)}%</strong><meter min="0" max="100" value={vitality}/></span><span>CARBON RESERVES <strong>{carbon.toFixed(2)} g</strong><meter min="0" max="2" value={carbon}/></span></div>}
  {message&&<p className="tutorial-feedback" role="status">{message}</p>}
  <div className="tutorial-footer"><span><b className="tutorial-clock">Day {Math.floor(time/24)+1} · {String(Math.floor(time%24)).padStart(2,'0')}:{String(Math.round(time%1*60)).padStart(2,'0')}</b>{lesson.kind==='grow'?(paused?'Paused · P to resume':'Time moves while your root grows'):paused?'Time paused':'Time running'}</span>
   {lesson.kind==='read'&&<button className="tutorial-next" onClick={onContinue}>{last?'Start my assignment':'Continue'} <kbd>Enter</kbd></button>}
   {lesson.id==='branch'&&<button className="tutorial-next" onClick={onBranch}>Branch a root <kbd>B</kbd></button>}
   {lesson.id==='pause'&&<button className="tutorial-next" onClick={onPause}>Pause time <kbd>P</kbd></button>}
   {lesson.id==='equipment'&&<button className="tutorial-next" onClick={equipmentOpen?onBuyDrainage:onEquipment}>{equipmentOpen?'Buy drainage · €45':'Equipment'} <kbd>{equipmentOpen?'1':'E'}</kbd></button>}
  </div>
 </aside>;
}

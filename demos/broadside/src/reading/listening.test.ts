// @vitest-environment happy-dom
import {it,expect,vi} from "vitest";
import type {SpeechResult} from "./nativeSpeech";
const runtime=vi.hoisted(()=>({
 native:true,onDevice:true,result:null as null|((r:SpeechResult)=>void),
 start:vi.fn(async(_locale:string,_token:string)=>{}),cancel:vi.fn(async()=>{}),
 speak:vi.fn(async()=>{}),active:null as null|((s:{isActive:boolean})=>void)
}));
vi.mock("@capacitor/app",()=>({App:{addListener:async(_name:string,fn:(s:{isActive:boolean})=>void)=>{runtime.active=fn;return {remove:async()=>{}};}}}));
vi.mock("./nativeSpeech",()=>({
 isNative:()=>runtime.native,
 capabilities:async()=>({preferredLanguages:["en-US"],locales:[{locale:"en-US",supported:true,onDevice:true,available:true}]}),
 supportedLocale:()=>runtime.onDevice?"en-US":null,
 startSpeech:runtime.start,cancelSpeech:runtime.cancel,speak:runtime.speak,
 listen:async(fn:(r:SpeechResult)=>void)=>{runtime.result=fn;return {remove:async()=>{}};}
}));
vi.mock("../ui/mapPan",()=>({mountMapPan:()=>({destroy(){},center(){}})}));
const click=(action:string)=>{const el=document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);expect(el,action).not.toBeNull();expect(el!.disabled).toBe(false);el!.click();};
const token=()=>runtime.start.mock.calls.at(-1)![1];
const send=(text:string,final=false,id=token())=>runtime.result!({kind:"transcript",token:id,text,final});
const target=()=>document.querySelector('.reading-word')!.textContent!;
const flush=async()=>{await vi.advanceTimersByTimeAsync(0);};
const saved=()=>JSON.parse(sessionStorage.getItem("broadside.reading.v1")!);
it("completes device readings hands-free, rewards only correct speech, and suspends safely",async()=>{
 vi.useFakeTimers();history.replaceState(null,"","/reading/?qa=true&fresh=1&language=en&view=reading");
 Object.defineProperty(document,"hidden",{value:false,configurable:true});
 document.body.innerHTML='<canvas id="reader-world" hidden></canvas><main id="reader"></main>';
 await import("./main");await flush();
 expect(runtime.start).toHaveBeenCalledTimes(1);
 expect(document.querySelector('[data-action="example"]')).not.toBeNull();
 // Optional pause cannot award credit; a fresh level must not inherit the pause.
 click("cancel-reading");expect(document.body.textContent).toContain("Take a breather");
 const pausedToken=token();send(target(),true,pausedToken);
 await vi.advanceTimersByTimeAsync(5000);expect(saved().practised).toBe(0);
 click("back");click("back");click("back");click("back");click("resume");await flush();
 expect(runtime.start).toHaveBeenCalledTimes(2);
 // Spoken help is available on device, suspends capture, and cannot count itself.
 let finishExample!:()=>void;
 runtime.speak.mockImplementationOnce(()=>new Promise<void>(resolve=>{finishExample=resolve;}));
 click("example");await flush();send(target(),true);
 expect(saved().practised).toBe(0);expect(document.body.textContent).toContain("Listen to the example");
 finishExample();await flush();await vi.advanceTimersByTimeAsync(400);
 expect(runtime.start).toHaveBeenCalledTimes(3);
 const startedBeforeMiss=runtime.start.mock.calls.length;
 expect(document.querySelector('.reading-actions')).toBeNull();
 expect(document.querySelector('[data-action="next"]')).toBeNull();
 send("zzzz",true);expect(document.body.textContent).toContain("Pip didn’t catch that");await vi.advanceTimersByTimeAsync(1400);
 expect(runtime.start).toHaveBeenCalledTimes(startedBeforeMiss+1);expect(saved().practised).toBe(0);
 const old=token(),word=target();send(word,false);await flush();
 expect(document.querySelector('.reading-paper.accepted')).not.toBeNull();expect(saved().practised).toBe(1);
 send(word,true,old);expect(saved().practised).toBe(1);
 await vi.advanceTimersByTimeAsync(1100);expect(runtime.start).toHaveBeenCalledTimes(startedBeforeMiss+2);
 send(target(),true,old);expect(saved().practised).toBe(1);
 // Background cancels pending capture. Late results cannot earn anything.
 const backgroundToken=token();runtime.active!({isActive:false});const beforeBackground=runtime.start.mock.calls.length;
 send(target(),true,backgroundToken);await vi.advanceTimersByTimeAsync(5000);
 expect(saved().practised).toBe(1);expect(runtime.start).toHaveBeenCalledTimes(beforeBackground);
 runtime.active!({isActive:true});await vi.advanceTimersByTimeAsync(750);expect(runtime.start).toHaveBeenCalledTimes(beforeBackground+1);
 // Suspend an accepted reward, then resume its transition without awarding twice.
 send(target());runtime.active!({isActive:false});const beforeReward=runtime.start.mock.calls.length;
 await vi.advanceTimersByTimeAsync(5000);expect(document.querySelector('.reading-paper.accepted')).not.toBeNull();
 runtime.active!({isActive:true});await vi.advanceTimersByTimeAsync(1100);expect(runtime.start).toHaveBeenCalledTimes(beforeReward+1);expect(saved().practised).toBe(2);
 // Native interruptions and unmatched final results recover automatically.
 runtime.result!({kind:"interrupted",token:token()});await vi.advanceTimersByTimeAsync(800);
 expect(runtime.start).toHaveBeenCalledTimes(beforeReward+2);
 for(let i=2;i<10;i++){send(target());await vi.advanceTimersByTimeAsync(1100);}
 expect(document.querySelector('#reader')!.getAttribute('data-screen')).toBe("complete");
 expect(saved().cargo).toEqual([{id:1,area:1,gold:100}]);expect(saved().practised).toBe(10);
 // Leaving during a reward cancels the queued advance and rejects late callbacks.
 click("next-level");await flush();send(target());const leavingToken=token();click("back");const beforeBack=runtime.start.mock.calls.length;
 await vi.advanceTimersByTimeAsync(5000);expect(runtime.start).toHaveBeenCalledTimes(beforeBack);send(word,false,leavingToken);expect(saved().practised).toBe(11);
 // Story questions also accept spoken answers and advance without buttons.
 const p=saved();delete p.tracks['en-1'].run;
 p.tracks['en-10']={cleared:0,seed:1,run:{id:p.nextRun++,level:1,language:"en",pack:10,items:Array.from({length:2},(_,i)=>({id:`story-${i}`,text:"A pirate sails.",chunks:["A pirate sails."],question:{text:"Who sails?",answers:["A pirate","A bird","A fish"],correct:0}})),index:0,chunk:0,helped:false,evidence:[],value:500,rewardVersion:1,contentVersion:1}};
 // Resume through a fresh module to read the saved story fixture.
 window.dispatchEvent(new Event("pagehide"));sessionStorage.setItem("broadside.reading.v1",JSON.stringify(p));
 vi.resetModules();document.body.innerHTML='<canvas id="reader-world" hidden></canvas><main id="reader"></main>';
 history.replaceState(null,"","/reading/?qa=true&language=en");await import("./main");await flush();click("resume");await flush();
 send("A pirate sails.");await vi.advanceTimersByTimeAsync(1100);
 expect(document.querySelector('#reader')!.getAttribute('data-screen')).toBe("comprehension");
 expect(document.querySelector('[data-answer]')).toBeNull();
 send("A bird",true);await vi.advanceTimersByTimeAsync(1400);expect(document.querySelector('#reader')!.getAttribute('data-screen')).toBe("comprehension");
 send("A pirate");await vi.advanceTimersByTimeAsync(1100);expect(document.querySelector('#reader')!.getAttribute('data-screen')).toBe("reading");
 // Permission failure leaves a clear explanation and no tap-to-award escape hatch.
 runtime.start.mockRejectedValueOnce(new Error("MICROPHONE_PERMISSION"));send("wrong",true);await vi.advanceTimersByTimeAsync(1400);
 expect(document.body.textContent).toContain("Enable both permissions");
 click("listen");await flush();expect(document.body.textContent).toContain("Pip is listening");expect(document.querySelector('[data-action="next"]')).toBeNull();
 const practiceBefore=saved().practised;click("back");await vi.advanceTimersByTimeAsync(5000);expect(saved().practised).toBe(practiceBefore);
 window.dispatchEvent(new Event("pagehide"));vi.useRealTimers();
});

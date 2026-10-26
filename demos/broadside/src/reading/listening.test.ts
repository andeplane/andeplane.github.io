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
it("listens continuously, accepts live speech once, and always trusts Next without an adult gate",async()=>{
 vi.useFakeTimers();history.replaceState(null,"","/reading/?qa=true&fresh=1&language=en&view=reading");
 Object.defineProperty(document,"hidden",{value:false,configurable:true});
 document.body.innerHTML='<canvas id="reader-world" hidden></canvas><main id="reader"></main>';
 await import("./main");await flush();
 expect(runtime.start).toHaveBeenCalledTimes(1);
 expect(document.querySelector('[data-action="stop-reading"]')).toBeNull();
 expect(document.querySelector('[data-action="adult"]')).toBeNull();
 expect(document.querySelector('[data-action="next"]')).not.toBeNull();
 // An unmatched utterance restarts by itself, with no record/finish button.
 send("zzzz",true);await vi.advanceTimersByTimeAsync(400);
 expect(runtime.start).toHaveBeenCalledTimes(2);
 const old=token(),word=target();send(word,false);await flush();
 expect(document.querySelector('.reading-paper.accepted')).not.toBeNull();expect(saved().practised).toBe(1);
 send(word,true,old);expect(saved().practised).toBe(1);
 click("next");await flush();expect(runtime.start).toHaveBeenCalledTimes(3);
 send(word,true,old);expect(saved().practised).toBe(1);
 // A manual Next awards once and advances in one tap, including while listening is paused.
 click("cancel-reading");const beforePause=runtime.start.mock.calls.length;
 click("next");await vi.advanceTimersByTimeAsync(5000);
 expect(runtime.start).toHaveBeenCalledTimes(beforePause);expect(saved().practised).toBe(2);
 expect(saved().tracks['en-1'].run.evidence).toEqual(["independent","self"]);
 click("listen");await flush();
 // Do not recognize the example voice; resume only after playback finishes.
 let finishOldExample!:()=>void,finishExample!:()=>void;runtime.speak.mockImplementationOnce(()=>new Promise<void>(r=>{finishOldExample=r;})).mockImplementationOnce(()=>new Promise<void>(r=>{finishExample=r;}));
 const exampleToken=token(),exampleWord=target();click("example");await flush();
 click("example");await flush();finishOldExample();await flush();
 const beforeExample=runtime.start.mock.calls.length;send(exampleWord,false,exampleToken);
 await vi.advanceTimersByTimeAsync(5000);expect(runtime.start).toHaveBeenCalledTimes(beforeExample);expect(saved().practised).toBe(2);
 finishExample();await flush();await vi.advanceTimersByTimeAsync(400);expect(runtime.start).toHaveBeenCalledTimes(beforeExample+1);
 // Background cancels pending capture and foreground resumes automatically.
 runtime.active!({isActive:false});const beforeBackground=runtime.start.mock.calls.length;
 await vi.advanceTimersByTimeAsync(5000);expect(runtime.start).toHaveBeenCalledTimes(beforeBackground);
 runtime.active!({isActive:true});await vi.advanceTimersByTimeAsync(750);expect(runtime.start).toHaveBeenCalledTimes(beforeBackground+1);
 // Navigation cancels automatic restarts and rejects late speech.
 send("zzzz",true);const leavingToken=token();click("back");const beforeBack=runtime.start.mock.calls.length;
 await vi.advanceTimersByTimeAsync(5000);expect(runtime.start).toHaveBeenCalledTimes(beforeBack);
 send(exampleWord,false,leavingToken);expect(saved().practised).toBe(2);
 // Browser/unavailable mode still has a one-tap Next and unchanged rewards.
 runtime.native=false;runtime.onDevice=false;
 document.querySelector<HTMLButtonElement>('[data-level="1"]')!.click();await flush();
 for(let i=0;i<8;i++)click("next");
 expect(document.querySelector('#reader')!.getAttribute('data-screen')).toBe("complete");
 expect(saved().cargo).toEqual([{id:1,area:1,gold:100}]);expect(saved().practised).toBe(10);
 expect(document.querySelector('dialog')).toBeNull();
 window.dispatchEvent(new Event("pagehide"));vi.useRealTimers();
});

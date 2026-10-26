import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Language } from "./content";
export interface SpeechCapabilities { preferredLanguages:string[];locales:{locale:string;supported:boolean;onDevice:boolean;available:boolean}[];speechPermission?:number; }
export interface SpeechResult {token:string;kind:"transcript"|"level"|"error"|"interrupted";text?:string;final?:boolean;level?:number;message?:string;}
interface ReadingSpeechPlugin {
 capabilities():Promise<SpeechCapabilities>;
 start(options:{locale:string;token:string}):Promise<void>;
 stop():Promise<void>;cancel():Promise<void>;speak(options:{locale:string;text:string}):Promise<void>;
 addListener(name:"result",callback:(result:SpeechResult)=>void):Promise<PluginListenerHandle>;
}
const native=registerPlugin<ReadingSpeechPlugin>("ReadingSpeech");
export const isNative=()=>Capacitor.isNativePlatform();
export async function capabilities():Promise<SpeechCapabilities>{
 if(!isNative())return {preferredLanguages:[...navigator.languages],locales:[]};
 return native.capabilities();
}
export function supportedLocale(cap:SpeechCapabilities,language:Language):string|null {
 const choices=language==="nb"?["nb-NO"]:cap.preferredLanguages.some(l=>/^en-US/i.test(l))?["en-US","en-GB"]:["en-GB","en-US"];
 return choices.find(locale=>cap.locales.some(l=>l.locale===locale&&l.supported&&l.onDevice&&l.available))??null;
}
export const startSpeech=(locale:string,token:string)=>native.start({locale,token});
export const stopSpeech=()=>isNative()?native.stop():Promise.resolve();
export async function cancelSpeech():Promise<void>{window.speechSynthesis?.cancel();if(isNative())await native.cancel();}
export async function speak(text:string,language:Language):Promise<void>{
 await cancelSpeech();
 const locale=language==="nb"?"nb-NO":"en-GB";
 if(isNative()){await native.speak({text,locale});return;}
 const voices=window.speechSynthesis?.getVoices()??[];
 const voice=voices.find(v=>(language==="nb"?/^(nb|no)[-_]/i:/^en[-_]/i).test(v.lang));
 if(!voice)throw new Error("VOICE_UNAVAILABLE");
 await new Promise<void>((resolve,reject)=>{
  const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=locale;utterance.rate=.8;
  utterance.onend=()=>resolve();utterance.onerror=e=>e.error==="canceled"||e.error==="interrupted"?resolve():reject(new Error("VOICE_UNAVAILABLE"));
  window.speechSynthesis.speak(utterance);
 });
}
export const listen=(callback:(r:SpeechResult)=>void)=>isNative()?native.addListener("result",callback):Promise.resolve({remove:async()=>{}});

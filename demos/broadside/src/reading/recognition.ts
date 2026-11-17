import { matches, normalize, type Language } from "./content";
export type SpeechState="ready"|"preparing"|"listening"|"checking"|"accepted"|"retry"|"unavailable";
/** Accept the current spoken target, including live results and a fresh attempt after a false start. */
export function hearsTarget(text:string,expected:string,language:Language):boolean {
 const count=normalize(expected).split(" ").length;
 const recent=normalize(text).split(" ").slice(-count).join(" ");
 return !!normalize(expected)&&matches(recent,expected,language);
}
/** Number of complete expected words heard in the latest hypothesis. Visual feedback only.
 * A fresh start may follow a false start, but skipped or substituted words never count.
 */
export function heardPrefix(text:string,expected:string,language:Language):number {
 const words=normalize(text).split(" "),target=normalize(expected).split(" ");
 if(!normalize(text)||!normalize(expected))return 0;
 let best=0;
 for(let start=0;start<words.length;start++){
  const tail=words.slice(start);
  if(tail.length<=target.length&&matches(tail.join(" "),target.slice(0,tail.length).join(" "),language))best=Math.max(best,tail.length);
 }
 return best;
}
/** Transcripts never own rewards. The caller also validates run/item/chunk identity. */
export class ReadingAttempt {
 state:SpeechState="ready";private generation=0;token="";expected="";private language:Language="en";
 begin(expected:string,language:Language="en"):string{this.language=language;this.expected=expected;this.token=String(++this.generation);this.state="preparing";return this.token;}
 listening(token:string):void{if(token===this.token&&this.state==="preparing")this.state="listening";}
 transcript(token:string,text:string,_final:boolean):boolean{
  if(token!==this.token||!["preparing","listening"].includes(this.state))return false;
  if(!hearsTarget(text,this.expected,this.language))return false;
  this.state="accepted";return true;
 }
 fail(token:string,unavailable=false):void{if(token===this.token&&["preparing","listening","checking"].includes(this.state))this.state=unavailable?"unavailable":"retry";}
 cancel():void{this.token=String(++this.generation);this.state="ready";this.expected="";}
}

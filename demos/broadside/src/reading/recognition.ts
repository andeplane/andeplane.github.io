import { matches, normalize, type Language } from "./content";
export type SpeechState="ready"|"preparing"|"listening"|"checking"|"accepted"|"retry"|"unavailable";
/** Accept the current spoken target, including live results and a fresh attempt after a false start. */
export function hearsTarget(text:string,expected:string,language:Language):boolean {
 const count=normalize(expected).split(" ").length;
 const recent=normalize(text).split(" ").slice(-count).join(" ");
 return !!normalize(expected)&&matches(recent,expected,language);
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

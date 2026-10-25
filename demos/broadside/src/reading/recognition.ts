import { matches, type Language } from "./content";
export type SpeechState="ready"|"preparing"|"listening"|"checking"|"accepted"|"retry"|"unavailable";
/** Transcripts never own rewards. The caller also validates run/item/chunk identity. */
export class ReadingAttempt {
 state:SpeechState="ready";private generation=0;token="";expected="";private language:Language="en";
 begin(expected:string,language:Language="en"):string{this.language=language;this.expected=expected;this.token=String(++this.generation);this.state="preparing";return this.token;}
 listening(token:string):void{if(token===this.token&&this.state==="preparing")this.state="listening";}
 stop():void{if(this.state==="listening")this.state="checking";}
 transcript(token:string,text:string,final:boolean):boolean{
  if(token!==this.token||!final||!["listening","checking"].includes(this.state))return false;
  const accepted=matches(text,this.expected,this.language);this.state=accepted?"accepted":"retry";return accepted;
 }
 fail(token:string,unavailable=false):void{if(token===this.token&&["preparing","listening","checking"].includes(this.state))this.state=unavailable?"unavailable":"retry";}
 cancel():void{this.token=String(++this.generation);this.state="ready";this.expected="";}
}

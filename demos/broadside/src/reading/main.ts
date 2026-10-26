import { App } from "@capacitor/app";
import { difficultyMap } from "../ui/difficultyMap";
import { homeMenu } from "../ui/homeMenu";
import { pirateShipArt } from "../ui/worldArt";
import { backButton, menuHeader } from "../ui/menuChrome";
import { icon } from "../ui/icons";
import { expeditionTrail, initialTrailWindow, extendTrailWindow, type TrailWindow } from "../ui/expeditionTrail";
import { mountMapPan, type MapPanController } from "../ui/mapPan";
import { PACKS, packFor, preferredLanguage, type Language, type ReadingItem } from "./content";
import { freshProgress, readProgress, saveProgress, startRun, currentItem, currentText, completeChunk, banked, aboard, trackKey, type Run, type ReadingProgress, type Evidence } from "./progress";
import { ReadingAttempt } from "./recognition";
import * as speech from "./nativeSpeech";
import type { ReadingPirateHost } from "./pirateHost";
import "./style.css";

type Screen="home"|"languages"|"packs"|"levels"|"reading"|"complete"|"comprehension"|"settings"|"ship"|"cave"|"unload";
const root=document.querySelector<HTMLDivElement>("#reader")!;
const canvas=document.querySelector<HTMLCanvasElement>("#reader-world")!;
const params=new URLSearchParams(location.search),qa=import.meta.env.DEV&&params.get("qa")==="true";
let storage:Storage|undefined;try{storage=qa?sessionStorage:localStorage;}catch{}
const initial=readProgress(storage,preferredLanguage(navigator.languages));
let progress=initial.progress,saveFailed=false,saveWarning=initial.warning;
let screen:Screen="home",packId=1,run:Run|null=null,worldReturn:Screen="home",epoch=0;
let page:TrailWindow=initialTrailWindow(1),pan:MapPanController|null=null,host:ReadingPirateHost|null=null;
let cap:speech.SpeechCapabilities={preferredLanguages:[],locales:[]},capLoaded=false;
const attempt=new ReadingAttempt();
let shown:{item:ReadingItem;chunk:number;index:number;id:number}|null=null;
let result:{itemComplete:boolean;levelComplete:boolean;gold:number}|null=null;
let listenTimer:ReturnType<typeof setTimeout>|undefined,listenPaused=false,examplePlaying=false,exampleGeneration=0,appActive=true,restartDelay=400;
let errorMessage="",worldLoading=false,worldError=false,comprehensionCorrect=false;
const copy={
 en:{shipShort:"Ship",caveShort:"Cave",brand:"Captain Reader",tag:"A PIRATE READING ADVENTURE",intro:"Read a little. Bring home a fortune.",play:"Play",continue:"Continue",choose:"Choose another adventure",practice:"Choose your language and reading pack",ship:"Your ship",cave:"Your cave",settings:"Settings & guide",rule:"Harder reading earns more gold. Take your time.",gold:"gold",home:"Home",languages:"Choose your language",languageHelp:"Tap a flag to begin your reading adventure.",packs:"Choose your reading island",packHelp:"Ten packs. All open. Read at your own pace.",level:"Level",reading:"Read aloud",next:"Next",retry:"Try again",cancel:"Pause listening",resumeListening:"Resume listening",paused:"Listening paused. Read at your own pace and press Next.",selfAccepted:"Onward, captain!",help:"Hear an example",adult:"Read with an adult",adultTitle:"A little help from your crew",adultText:"An adult can listen and confirm this reading. It earns the same gold and is saved as assisted practice.",confirm:"I heard this reading",close:"Close",ready:"Ready when you are",listening:"Pip is listening…",checking:"Checking your reading…",preparing:"Getting ready to listen…",accepted:"Well read, captain!",uncertain:"Pip didn’t catch that. Have another go, or ask your crew.",browser:"Read aloud, then press Next when you’re ready. The iPhone app can also listen automatically.",unavailable:"On-device listening isn’t available for this language right now. Read aloud and press Next when you’re ready.",permissions:"Listening needs microphone and speech permission in iPhone Settings. You can still read aloud and press Next.",sound:"Listening indicator — sound level, not a reading score",complete:"Treasure earned!",completeText:"Your chest is safely aboard. Bring it home to your cave.",nextLevel:"Next island",unload:"Unload your chests",explore:"Explore the cave",loading:"Your crew is getting ready…",worldFail:"Your treasure scene couldn’t open. Your saved gold is safe. Try again.",back:"Back",save:"Progress couldn’t be saved. Keep this game open to continue.",resetWarning:"The saved progress couldn’t be read. A fresh adventure is ready.",privacy:"Your voice stays on this device",privacyText:"Listening starts automatically on each reading prompt. You can pause it at any time. It stops when you leave or the app goes into the background. Recordings and transcripts are not saved or sent to us. There are no accounts, ads, or analytics.",ui:"Menu language",world:"Reading language",practiceCount:"readings practised",assisted:"with help",guide:"Choose a flag, an island pack, and a level. Read each prompt aloud. Pip listens automatically in the iPhone app, and you can always press Next yourself. Sentences in a story are read one at a time. Hints and retries are free. Every gold coin you earn is one coin in your chest.",reset:"Reset reading progress",resetTitle:"Start a new adventure?",resetText:"This removes Captain Reader’s progress and treasure on this device. The other pirate games keep their saves.",resetConfirm:"Reset this game",voiceFail:"An example voice isn’t available for this language. Ask an adult to read it with you.",chunk:"Sentence",of:"of",comp:"A little story question",compRetry:"Have another look at the story and try again.",compGood:"That’s right!",qa:"Design preview · separate practice save",banked:"saved in your cave",aboard:"aboard your ship",empty:"Your next chest goes here",room:"Treasure cave",inspect:"Inspect / explore",jump:"Jump",move:"Move",readingCount:"read",more:"More challenging reading earns more gold"},
 nb:{shipShort:"Skip",caveShort:"Hule",brand:"Kaptein Leselyst",tag:"ET LESEEVENTYR MED PIRATER",intro:"Les litt. Ta med skatten hjem.",play:"Spill",continue:"Fortsett",choose:"Velg et annet eventyr",practice:"Velg språk og lesepakke",ship:"Skipet ditt",cave:"Hulen din",settings:"Innstillinger og hjelp",rule:"Vanskeligere lesing gir mer gull. Ta deg god tid.",gold:"gull",home:"Hjem",languages:"Velg lesespråk",languageHelp:"Trykk på et flagg og begynn leseeventyret.",packs:"Velg leseøy",packHelp:"Ti pakker. Alle er åpne. Les i ditt eget tempo.",level:"Nivå",reading:"Les høyt",next:"Neste",retry:"Prøv igjen",cancel:"Sett lytting på pause",resumeListening:"Fortsett lytting",paused:"Lytting på pause. Les i ditt eget tempo og trykk Neste.",selfAccepted:"Videre, kaptein!",help:"Hør et eksempel",adult:"Les med en voksen",adultTitle:"Litt hjelp fra mannskapet",adultText:"En voksen kan lytte og bekrefte lesingen. Det gir like mye gull og lagres som øving med hjelp.",confirm:"Jeg hørte denne lesingen",close:"Lukk",ready:"Klar når du er",listening:"Pip lytter…",checking:"Sjekker lesingen din…",preparing:"Gjør klar til å lytte…",accepted:"Godt lest, kaptein!",uncertain:"Pip fikk ikke med seg det. Prøv igjen, eller spør mannskapet.",browser:"Les høyt og trykk Neste når du er klar. iPhone-appen kan også lytte automatisk.",unavailable:"Lytting på enheten er ikke tilgjengelig for dette språket akkurat nå. Les høyt og trykk Neste når du er klar.",permissions:"Lytting trenger tilgang til mikrofon og talegjenkjenning i iPhone-innstillingene. Du kan fortsatt lese høyt og trykke Neste.",sound:"Lytteindikator — lydnivå, ikke en lesepoengsum",complete:"Du har tjent en skatt!",completeText:"Kisten er trygt om bord. Ta den med hjem til hulen.",nextLevel:"Neste øy",unload:"Loss kistene dine",explore:"Utforsk hulen",loading:"Mannskapet gjør klart…",worldFail:"Skatten kunne ikke vises. Det lagrede gullet er trygt. Prøv igjen.",back:"Tilbake",save:"Fremgangen kunne ikke lagres. Hold spillet åpent for å fortsette.",resetWarning:"Den lagrede fremgangen kunne ikke leses. Et nytt eventyr er klart.",privacy:"Stemmen din blir på enheten",privacyText:"Lytting starter automatisk ved hver leseoppgave. Du kan sette den på pause når som helst. Den stopper når du går ut eller appen går i bakgrunnen. Opptak og utskrifter lagres ikke og sendes ikke til oss. Ingen kontoer, reklame eller analyseverktøy.",ui:"Menyspråk",world:"Lesespråk",practiceCount:"lesinger øvd",assisted:"med hjelp",guide:"Velg et flagg, en leseøy og et nivå. Les høyt. Pip lytter automatisk i iPhone-appen, og du kan alltid trykke Neste selv. I fortellinger leser du én setning om gangen. Hjelp og nye forsøk er gratis. Hver gullmynt du tjener, er én mynt i kisten.",reset:"Nullstill lesefremgangen",resetTitle:"Begynne et nytt eventyr?",resetText:"Dette fjerner fremgangen og skatten i Kaptein Leselyst på denne enheten. De andre sjørøverspillene beholder sine lagringer.",resetConfirm:"Nullstill dette spillet",voiceFail:"En eksempelstemme finnes ikke for dette språket. Be en voksen lese sammen med deg.",chunk:"Setning",of:"av",comp:"Et lite spørsmål om fortellingen",compRetry:"Se på fortellingen en gang til og prøv igjen.",compGood:"Helt riktig!",qa:"Designvisning · egen øvingslagring",banked:"lagret i hulen",aboard:"om bord på skipet",empty:"Den neste kisten din kommer hit",room:"Skattehulen",inspect:"Se nærmere / utforsk",jump:"Hopp",move:"Beveg deg",readingCount:"lest",more:"Vanskeligere lesing gir mer gull"}
};
type CopyKey=keyof typeof copy.en;
const t=(key:CopyKey)=>copy[progress.ui][key];
const esc=(s:string)=>s.replace(/[&<>"']/gu,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const f=(n:number)=>n.toLocaleString(progress.ui==="nb"?"nb-NO":"en-GB");
const title=()=>t("brand");
const area=()=>progress.language==="nb"?0:1;
const track=()=>progress.tracks[trackKey(progress.language,packId)];
const persist=()=>{saveFailed=!saveProgress(progress,storage);};
const button=(action:string,label:string,primary=false)=>`<button class="wood-button${primary?" primary":""}" data-action="${action}">${esc(label)}</button>`;
const flag=(language:Language)=>language==="nb"?`<svg class="language-flag" viewBox="0 0 66 48" aria-hidden="true"><path fill="#ba2635" d="M0 0h66v48H0z"/><path fill="#fff" d="M18 0h12v48H18zM0 18h66v12H0z"/><path fill="#142e67" d="M21 0h6v48h-6zM0 21h66v6H0z"/></svg>`:`<svg class="language-flag" viewBox="0 0 60 40" aria-hidden="true"><path fill="#142e67" d="M0 0h60v40H0z"/><path stroke="#fff" stroke-width="9" d="m0 0 60 40m0-40L0 40"/><path stroke="#bf2737" stroke-width="3" d="m0 0 60 40m0-40L0 40"/><path stroke="#fff" stroke-width="13" d="M30 0v40M0 20h60"/><path stroke="#bf2737" stroke-width="7" d="M30 0v40M0 20h60"/></svg>`;
const heading=(h:string,sub:string)=>`<div class="page-heading"><span class="eyebrow">${esc(title())}</span><h1>${esc(h)}</h1><p>${esc(sub)}</p></div>`;
function header():string{
 if(screen==="home")return "";
 return menuHeader({className:"reader-topbar",brand:"",back:backButton({action:"back",label:t("back"),destination:screen==="languages"?t("home"):undefined}),actions:`<button class="pirate-nav-link" data-action="ship">${icon("ship")}<span>${esc(t("shipShort"))}<small>${f(aboard(progress))} ${t("gold")}</small></span></button><button class="pirate-nav-link" data-action="cave">${icon("chest")}<span>${esc(t("caveShort"))}<small>${f(banked(progress))} ${t("gold")}</small></span></button>`});
}
function home():string{
 const active=Object.values(progress.tracks).map(t=>t.run).filter((r):r is Run=>!!r).sort((a,b)=>b.id-a.id)[0];
 return `<section class="pirate-home-shell">${homeMenu({title:progress.ui==="nb"?["Kaptein","Leselyst"]:["Captain","Reader"],eyebrow:t("tag"),description:t("intro"),illustration:pirateShipArt("reader"),primary:{action:active?"resume":"play",label:active?t("continue"):t("play"),detail:active?`${packFor(active.pack).name[progress.ui]} · ${t("level")} ${f(active.level)} · ${active.index}/${active.items.length}`:t("practice")},chooseLevels:active?{action:"play",label:t("choose")}:undefined,ship:{action:"ship",icon:"ship",title:t("ship"),value:`${f(aboard(progress))} ${t("gold")}`,detail:progress.cargo.length?t("aboard"):t("empty")},cave:{action:"cave",icon:"chest",title:t("cave"),value:`${f(banked(progress))} ${t("gold")}`,detail:t("banked")},settings:{action:"settings",label:t("settings")},rule:t("rule")})}</section>`;
}
function languages():string{
 const width=innerHeight<520?800:innerWidth<350?850:1100,height=width*2/3;
 return `<section class="map-view operation-world language-map-view" style="--world-accent:#e9c98d;--world-ocean:#16454d"><div class="world-map-heading"><span class="eyebrow">${esc(title())}</span><h1>${esc(t("languages"))}</h1><p>${esc(t("languageHelp"))}</p></div><div class="world-map-viewport" data-map-viewport tabindex="0" data-focus-x="${width*.51}" data-focus-y="${height*.5-(innerHeight<520?12:0)}" data-map-scale=".65" aria-label="Northern Europe language map"><div class="world-map-plane language-map-plane" data-map-world style="width:${width}px;height:${height}px"><img class="world-map-art" src="${import.meta.env.BASE_URL}reading/northern-europe.png" alt="" draggable="false"/>${(["nb","en"] as Language[]).map(l=>`<button data-language="${l}" class="language-stop ${l===progress.language?"selected":""} ${l}" aria-label="${l==="nb"?"Norsk bokmål":"English"}">${flag(l)}<strong>${l==="nb"?"Norsk":"English"}</strong></button>`).join("")}</div><div class="world-map-tools" data-map-control><span>${progress.ui==="nb"?"Dra for å utforske":"Drag to explore"}</span><button data-map-center>${icon("compass")} ${progress.ui==="nb"?"Begge språk":"Both languages"}</button></div></div></section>`;
}
function packs():string{
 const nb=progress.language==="nb",ui=progress.ui;
 const world={name:nb?ui==="nb"?"Lesefjordene":"Reading Fjords":ui==="nb"?"Bokøyene":"Storybook Isles",image:nb?"reading/norwegian-world.png":"reading/english-world.png",accent:nb?"#b9e7f6":"#b6e4ad",ocean:nb?"#233f59":"#164d4e",paper:nb?"#e4eef1":"#f3e2ac",ink:nb?"#2c485c":"#254a3c"};
 return difficultyMap({world,eyebrow:nb?"NORSK · BOKMÅL":"ENGLISH",instructions:ui==="nb"?"Dra kartet. Velg lesepakke.":"Drag the map. Choose your reading pack.",baseUrl:import.meta.env.BASE_URL,height:3600,selected:packId,footer:ui==="nb"?"Ti lesepakker · alle åpne":"Ten reading packs · all open",centerLabel:ui==="nb"?"Nåværende øy":"Current island",stops:PACKS.map((p,i)=>({id:p.id,x:i%2?850:350,y:3250-i*320,number:p.id,label:p.name[ui],description:p.description[ui],example:`${f(p.gold)} ${t("gold")} / ${t("level").toLowerCase()}`,detail:ui==="nb"?"Utforsk øya":"Start exploring"}))});
}
function levels():string{
 const p=packFor(packId),tr=track(),current=(tr?.cleared??0)+1;
 return expeditionTrail({world:{name:p.name[progress.ui],image:progress.language==="nb"?"reading/norwegian-world.png":"reading/english-world.png",accent:"#edcd8b",ocean:"#16474c",chapterNames:progress.ui==="nb"?["Ordvika","Bokstranden","Lesefjorden","Historiehavn","Skatteøya"]:["Word Bay","Book Beach","Reading Reach","Story Harbour","Treasure Island"]},reading:true,norwegian:progress.ui==="nb",promptsPerLevel:p.count,goldRule:`${f(p.gold)} ${t("gold")} / ${t("level").toLowerCase()}`,packName:p.name[progress.ui],operatorName:progress.language==="nb"?"Norsk":"English",packLabel:p.name[progress.ui],practiceRule:p.description[progress.ui],baseUrl:import.meta.env.BASE_URL,window:page,track:{cleared:tr?.cleared??0,stars:{},runs:tr?.run?{[tr.run.level]:{solved:tr.run.index}}:{}}});
}
function statusText():string{
 if(errorMessage)return errorMessage;
 if(listenPaused)return t("paused");
 if(attempt.state==="accepted")return t("accepted");
 if(["preparing","listening","checking"].includes(attempt.state))return t(attempt.state as "preparing"|"listening"|"checking");
 if(attempt.state==="retry")return t("uncertain");
 if(!speech.isNative())return t("browser");
 if(capLoaded&&!speech.supportedLocale(cap,progress.language))return t("unavailable");
 return t("ready");
}
function reading():string{
 const r=run!,v=shown!,p=packFor(r.pack),accepted=attempt.state==="accepted";
 const prompt=p.kind==="word"?`<div class="reading-word" style="--word-size:${Math.max(1.2,Math.min(4.5,22/v.item.text.length))}rem">${esc(v.item.text)}</div>`:`<div class="reading-passage" lang="${r.language}">${v.item.chunks.map((chunk,i)=>`<span class="${i<v.chunk?"read":i===v.chunk?"current":""}">${esc(chunk)}</span>`).join(" ")}</div>`;
 return `<section class="reading-view reading-prompt-view">${heading(p.name[progress.ui],`${t("level")} ${f(r.level)} · ${v.index+1}/${r.items.length} · ${f(r.value)} ${t("gold")}`)}<div class="reading-paper ${accepted?"accepted":""}">${prompt}${v.item.chunks.length>1?`<p class="chunk-count">${t("chunk")} ${v.chunk+1} ${t("of")} ${v.item.chunks.length}</p>`:""}</div><div class="reading-feedback ${accepted?"is-accepted":""}"><div class="listening-indicator ${attempt.state}" aria-label="${esc(t("sound"))}" aria-hidden="true">${accepted?"✦":"✧"}<span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div><p role="status" aria-live="polite">${esc(statusText())}${accepted&&result?.gold?`<strong class="earned-gold">+${f(result.gold)} ${t("gold")}</strong>`:""}</p></div><div class="reading-actions">${button("next",t("next"),true)}${!accepted?`${button("example",t("help"))}${speech.supportedLocale(cap,progress.language)?button(listenPaused?"listen":"cancel-reading",t(listenPaused?"resumeListening":"cancel")):""}`:""}</div><p class="small-note">${esc(t("rule"))}</p></section>`;
}
function completion():string{return `<section class="reader-complete">${heading(t("complete"),t("completeText"))}<div class="reward-emblem">${icon("chest")}</div><strong class="reward-total">${f(packFor(packId).gold)} ${t("gold")}</strong><div class="reading-actions">${button("ship",t("ship"),true)}${button("next-level",t("nextLevel"))}${button("packs",t("packs"))}</div></section>`;}
function comprehension():string{
 const q=shown!.item.question!;
 return `<section class="reading-view">${heading(t("comp"),"")}<div class="reading-paper"><div class="reading-passage">${esc(shown!.item.text)}</div><h2 class="story-question">${esc(q.text)}</h2></div><div class="reading-actions">${q.answers.map((a,i)=>`<button class="wood-button" data-answer="${i}" ${comprehensionCorrect?"disabled":""}>${esc(a)}</button>`).join("")}</div><p role="status">${esc(comprehensionCorrect?t("compGood"):errorMessage)}</p>${comprehensionCorrect?button("after-question",t("next"),true):""}</section>`;
}
function settings():string{return `<section class="reader-settings">${heading(t("settings"),"")}<div class="settings-paper"><p>${esc(t("guide"))}</p><label>${esc(t("ui"))}<select data-setting="ui"><option value="nb" ${progress.ui==="nb"?"selected":""}>Norsk (bokmål)</option><option value="en" ${progress.ui==="en"?"selected":""}>English</option></select></label><label>${esc(t("world"))}<select data-setting="language"><option value="nb" ${progress.language==="nb"?"selected":""}>Norsk (bokmål)</option><option value="en" ${progress.language==="en"?"selected":""}>English</option></select></label><h2>${esc(t("privacy"))}</h2><p>${esc(t("privacyText"))}</p><p>${f(progress.practised)} ${t("practiceCount")} · ${f(progress.assisted)} ${t("assisted")}</p>${button("reset",t("reset"))}</div></section>`;}
function worldView():string{
 if(worldError)return `<div class="world-message" role="alert"><p>${esc(t("worldFail"))}</p>${button("retry-world",t("retry"),true)}</div>`;
 if(worldLoading)return `<div class="world-message" role="status"><p>${esc(t("loading"))}</p></div>`;
 return `<div class="world-footer"><p id="reader-room">${esc(screen==="ship"?t("ship"):t("room"))}</p><strong>${f(banked(progress))} ${t("gold")} · ${f(aboard(progress))} ${t("aboard")}</strong><div class="world-buttons">${progress.cargo.length?button("unload",t("unload"),true):screen==="unload"?button("cave",t("explore"),true):screen==="cave"?button("inspect",t("inspect")):button("cave",t("cave"),true)}</div></div>${screen==="cave"?`<div id="reader-pad" class="reader-move" role="group" aria-label="${esc(t("move"))}"><span id="reader-thumb"></span></div><button id="reader-jump" class="reader-jump">${esc(t("jump"))}</button>`:""}`;
}
function render():void{
 pan?.destroy();pan=null;
 document.documentElement.lang=progress.ui;document.title=title();root.dataset.screen=screen;
 root.innerHTML=`${header()}${screen==="reading"?`<div class="recording-strip">${esc(t(attempt.state==="listening"?"listening":attempt.state==="checking"?"checking":attempt.state==="preparing"?"preparing":attempt.state==="accepted"?"accepted":"reading"))}</div>`:""}${qa?`<span class="qa-badge">${esc(t("qa"))}</span>`:""}${saveFailed||saveWarning?`<p class="save-warning" role="alert">${esc(t(saveFailed?"save":"resetWarning"))}</p>`:""}<main id="reader-content" ${["levels","packs","languages"].includes(screen)?'class="map-content"':""}>${screen==="home"?home():screen==="languages"?languages():screen==="packs"?packs():screen==="levels"?levels():screen==="reading"?reading():screen==="complete"?completion():screen==="comprehension"?comprehension():screen==="settings"?settings():worldView()}</main>`;
 if(screen==="reading"&&shown&&shown.chunk>0)root.querySelector<HTMLElement>(".reading-passage .current")?.scrollIntoView({block:"center",behavior:"auto"});
 if(screen==="packs"||screen==="levels"||screen==="languages"){
  const viewport=root.querySelector<HTMLElement>("[data-map-viewport]"),world=viewport?.querySelector<HTMLElement>("[data-map-world]");
  if(viewport&&world)pan=mountMapPan(viewport,world,{focus:{x:Number(viewport.dataset.focusX),y:Number(viewport.dataset.focusY)},scale:screen==="languages"?.65:screen==="packs"?1:.8,onCenter:screen==="levels"?()=>{page=initialTrailWindow((track()?.cleared??0)+1);render();}:undefined});
 }
}
function stopListening():void{exampleGeneration++;examplePlaying=false;clearTimeout(listenTimer);listenTimer=undefined;attempt.cancel();void speech.cancelSpeech().catch(()=>{});}
function canListen():boolean{return screen==="reading"&&!!shown&&attempt.state!=="accepted"&&!listenPaused&&!examplePlaying&&appActive&&!document.hidden&&!document.querySelector("dialog[open]");}
function scheduleListening(delay=400):void{
 clearTimeout(listenTimer);listenTimer=undefined;
 if(!canListen()||!speech.supportedLocale(cap,progress.language))return;
 const current=epoch;listenTimer=setTimeout(()=>{listenTimer=undefined;if(epoch===current&&canListen())void beginListening();},delay);
}
function navigate(next:Screen):void{epoch++;stopListening();pan?.destroy();pan=null;host?.dispose();host=null;canvas.hidden=true;screen=next;errorMessage="";render();root.querySelector<HTMLElement>("h1")?.setAttribute("tabindex","-1");root.querySelector<HTMLElement>("h1")?.focus({preventScroll:true});}
function viewCurrent():void{if(!run)return;examplePlaying=false;restartDelay=400;shown={item:structuredClone(currentItem(run)),chunk:run.chunk,index:run.index,id:run.id};result=null;attempt.cancel();errorMessage="";}
function openLevel(level:number,replay=false):void{
 run=startRun(progress,progress.language,packId,level,crypto.getRandomValues(new Uint32Array(1))[0]!,replay);if(!run)return;persist();viewCurrent();navigate("reading");void beginListening();
}
async function beginListening():Promise<void>{
 if(!canListen())return;
 clearTimeout(listenTimer);listenTimer=undefined;
 const locale=speech.supportedLocale(cap,progress.language);if(!locale){render();return;}
 const token=attempt.begin(shown!.item.chunks[shown!.chunk]!,progress.language);errorMessage="";render();
 try{await speech.cancelSpeech();if(attempt.token!==token||screen!=="reading")return;await speech.startSpeech(locale,token);attempt.listening(token);restartDelay=400;render();}
 catch(error){if(attempt.token!==token)return;
  if(String(error).includes("CANCELLED")){attempt.cancel();scheduleListening(750);return;}
  attempt.fail(token,true);errorMessage=String(error).includes("PERMISSION")?t("permissions"):t("unavailable");render();
 }
}
function accepted(source:Evidence):void{
 if(screen!=="reading"||result||!run||!shown)return;const out=completeChunk(progress,run,{id:shown.id,index:shown.index,chunk:shown.chunk},source);if(!out.accepted)return;
 clearTimeout(listenTimer);listenTimer=undefined;result=out;attempt.state="accepted";errorMessage="";persist();void speech.cancelSpeech().catch(()=>{});render();root.querySelector<HTMLButtonElement>('[data-action="next"]')?.focus({preventScroll:true});
}
function nextReading():void{if(result?.levelComplete){navigate("complete");return;}viewCurrent();navigate("reading");void beginListening();}
function dialog(kind:"adult"|"reset"):void{
 stopListening();render();const d=document.createElement("dialog");d.className="reader-dialog";d.setAttribute("aria-labelledby","reader-dialog-title");
 d.innerHTML=`<h2 id="reader-dialog-title">${esc(t(kind==="adult"?"adultTitle":"resetTitle"))}</h2><p>${esc(t(kind==="adult"?"adultText":"resetText"))}</p><div>${button("dialog-confirm",t(kind==="adult"?"confirm":"resetConfirm"),true)}${button("dialog-close",t("close"))}</div>`;
 const returnAction=kind==="adult"?"adult":"reset";
 document.body.append(d);d.addEventListener("close",()=>{d.remove();root.querySelector<HTMLButtonElement>(`button[data-action="${returnAction}"]`)?.focus();},{once:true});
 d.addEventListener("click",e=>{const action=(e.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;if(action==="dialog-close")d.close();if(action==="dialog-confirm"){d.close();if(kind==="adult")accepted("adult");else {host?.dispose();host=null;progress=freshProgress(progress.ui);persist();navigate("home");}}if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.showModal();
}
async function openWorld(next:"ship"|"cave"|"unload"):Promise<void>{
 if(!["ship","cave","unload"].includes(screen))worldReturn=screen==="reading"&&result?.levelComplete?"complete":screen;
 navigate(next);worldLoading=true;worldError=false;render();canvas.hidden=false;const current=epoch;
 try{const {ReadingPirateHost}=await import("./pirateHost");if(epoch!==current)return;
  host=new ReadingPirateHost(canvas,progress,p=>saveProgress(p,storage),()=>{if(epoch===current){worldLoading=false;render();}},()=>{if(epoch===current){worldLoading=false;render();}},()=>{if(epoch===current){worldLoading=false;worldError=true;render();}},!qa);
  host.show(next,area());if(next==="cave")worldLoading=false;render();
 }catch{if(epoch!==current)return;worldLoading=false;worldError=true;host?.dispose();host=null;render();}
}
function back():void{
 if(document.querySelector("dialog[open]"))return;
 if(["ship","cave","unload"].includes(screen)){navigate(worldReturn);if(screen==="reading"){viewCurrent();render();void beginListening();}return;}
 navigate(screen==="reading"||screen==="complete"||screen==="comprehension"?"levels":screen==="levels"?"packs":screen==="packs"?"languages":"home");
}
root.addEventListener("click",e=>{
 const el=(e.target as Element).closest<HTMLButtonElement>("button");if(!el||el.disabled)return;
 if(el.dataset.language){progress.language=el.dataset.language as Language;packId=1;progress.chosen=true;persist();navigate("packs");return;}
 if(el.dataset.pack){packId=Number(el.dataset.pack);page=initialTrailWindow((track()?.cleared??0)+1);navigate("levels");return;}
 if(el.dataset.level){openLevel(Number(el.dataset.level),Number(el.dataset.level)<=(track()?.cleared??0));return;}
 if(el.dataset.answer!==undefined){const q=shown!.item.question!;comprehensionCorrect=Number(el.dataset.answer)===q.correct;errorMessage=comprehensionCorrect?"":t("compRetry");render();return;}
 switch(el.dataset.action){
  case "back":back();break;case "play":navigate("languages");break;case "packs":navigate("packs");break;case "settings":navigate("settings");break;
  case "resume":{run=Object.values(progress.tracks).map(t=>t.run).filter((r):r is Run=>!!r).sort((a,b)=>b.id-a.id)[0]??null;if(run){progress.language=run.language;packId=run.pack;viewCurrent();navigate("reading");void beginListening();}break;}
  case "listen":listenPaused=false;void beginListening();break;case "cancel-reading":listenPaused=true;stopListening();render();break;
  case "example":{if(run)run.helped=true;persist();stopListening();examplePlaying=true;const current=epoch,exampleId=exampleGeneration;render();void speech.speak(shown!.item.chunks[shown!.chunk]!,progress.language).catch(()=>{if(epoch===current&&exampleGeneration===exampleId){errorMessage=t("voiceFail");render();}}).finally(()=>{if(epoch===current&&exampleGeneration===exampleId){examplePlaying=false;scheduleListening();}});break;}
  case "adult":dialog("adult");break;case "reset":dialog("reset");break;
  case "next":if(!result)accepted("self");if(!result)break;if(result.itemComplete&&shown?.item.question){comprehensionCorrect=false;navigate("comprehension");}else nextReading();break;
  case "after-question":nextReading();break;case "next-level":openLevel((run?.level??0)+1);break;
  case "ship":void openWorld("ship");break;case "cave":void openWorld("cave");break;case "unload":void openWorld("unload");break;case "inspect":host?.inspect();break;
  case "retry-world":void openWorld(screen as "ship"|"cave"|"unload");break;
  case "trail-earlier":page=extendTrailWindow(page,"earlier");render();break;case "trail-further":page=extendTrailWindow(page,"further");render();break;
 }
});
root.addEventListener("change",e=>{const select=e.target as HTMLSelectElement;if(select.dataset.setting==="ui"||select.dataset.setting==="language"){progress[select.dataset.setting]=select.value as Language;progress.chosen=true;persist();render();}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!document.querySelector("dialog[open]")&&!["cave","unload"].includes(screen)){e.preventDefault();back();}});
const interrupted=()=>{if(screen==="reading"&&attempt.state!=="accepted"){stopListening();errorMessage="";render();}};
window.addEventListener("resize",()=>{
 if(screen==="languages")render();
 else if(screen==="packs"||screen==="levels"){const viewport=root.querySelector<HTMLElement>("[data-map-viewport]");if(viewport)pan?.center({x:Number(viewport.dataset.focusX),y:Number(viewport.dataset.focusY)});}
});
document.addEventListener("visibilitychange",()=>{if(document.hidden)interrupted();else scheduleListening();});window.addEventListener("pagehide",()=>{stopListening();host?.dispose();host=null;});
if(speech.isNative())void App.addListener("appStateChange",({isActive})=>{appActive=isActive;if(!isActive)interrupted();else scheduleListening(750);});
void speech.listen(r=>{
 if(screen!=="reading"||r.token!==attempt.token)return;
 if(r.kind==="level"){root.querySelector<HTMLElement>(".listening-indicator")?.style.setProperty("--sound",String(r.level??0));return;}
 if(r.kind==="transcript"){if(attempt.transcript(r.token,r.text??"",r.final??false))accepted("independent");else if(r.final){attempt.cancel();scheduleListening();}}
 else {attempt.cancel();restartDelay=Math.min(4000,restartDelay*2);scheduleListening(restartDelay);}
});
render();
void speech.capabilities().then(value=>{cap=value;capLoaded=true;if(!progress.chosen){const selected=preferredLanguage(value.preferredLanguages);progress.language=selected;progress.ui=selected;}if(screen!=="reading")render();else if(canListen())void beginListening();}).catch(()=>{capLoaded=true;});
if(qa){
 if(params.get("safe")==="1")for(const [edge,value] of Object.entries({top:"24px",bottom:"20px",left:"12px",right:"12px"}))document.documentElement.style.setProperty(`--pirate-safe-${edge}`,value);
 const p=Number(params.get("pack"));if(p>=1&&p<=10)packId=p;
 const language=params.get("language");if(language==="nb"||language==="en"){progress.language=language;progress.ui=language;progress.chosen=true;}
 if(params.get("fresh")==="1"){progress=freshProgress(progress.language);progress.chosen=true;}
 if(params.get("banked")){progress.bank[0]=Math.min(1_000_000,Math.max(0,Number(params.get("banked"))||0));}
 if(params.get("cleared")){const cleared=Math.min(1_000_000,Math.max(0,Number(params.get("cleared"))||0));progress.tracks[trackKey(progress.language,packId)]={cleared,seed:91};}
 if(params.get("cargo")){const r=startRun(progress,progress.language,packId,(track()?.cleared??0)+1,91)!;while(track()?.run===r)completeChunk(progress,r,{id:r.id,index:r.index,chunk:r.chunk},"adult");}
 const view=params.get("view");if(view==="reading"){openLevel((track()?.cleared??0)+1);const state=params.get("state");if(state==="preparing"||state==="listening"||state==="checking"||state==="retry"||state==="unavailable"){attempt.state=state;render();}}else if(view==="packs"||view==="languages"||view==="settings")navigate(view);else if(view==="levels"){page=initialTrailWindow((track()?.cleared??0)+1);navigate("levels");}else if(view==="ship"||view==="cave"||view==="unload")void openWorld(view);else render();
}

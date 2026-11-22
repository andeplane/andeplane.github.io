import { App } from "@capacitor/app";
import { languagePickerMarkup, bindLanguagePicker, languageSettingLabel } from "../ui/languagePicker";
import { deviceLanguages, languageOption, isLanguage, readLanguagePreference, saveLanguagePreference, watchMenuLanguage } from "../i18n/languages";
import { createI18n } from "../math/i18n";
import { createLocale } from "../i18n/locale";
import { readerCatalogs } from "./messages";
import { difficultyMap } from "../ui/difficultyMap";
import { pirateMenu, settingsDesk } from "../ui/homeMenu";
import { installMenuPreview } from "../ui/menuPreview";
import { installButtonHaptics } from "../ui/buttonHaptics";
import { adventureChart, sailToShore } from "../ui/adventureChart";
import { backButton, chartAction, chartHeader, menuHeader } from "../ui/menuChrome";
import { caveHeader, caveNotice, caveTally } from "../ui/caveHud";
import { icon } from "../ui/icons";
import { holdLedger, rewardLedger, shipRecoveryLedger } from "../ui/rewardLedger";
import { atlasRenderer, atlasView, worldAsset, worldIsland } from "../ui/worldAtlas";
import { mountMapPan, type MapCamera, type MapPanController } from "../ui/mapPan";
import { PACKS, READING_LANGUAGES, isReadingLanguage, packFor, preferredLanguage, type ReadingItem } from "./content";
import { freshProgress, readProgress, saveProgress, startRun, currentItem, currentText, completeChunk, banked, aboard, trackKey, type Run, type ReadingProgress, type Evidence } from "./progress";
import { INTEREST_IDS, readInterests } from "./interests";
import { ReadingAttempt, heardPrefix } from "./recognition";
import * as speech from "./nativeSpeech";
import type { ReadingPirateHost } from "./pirateHost";
import "./style.css";

type Screen="home"|"languages"|"packs"|"levels"|"reading"|"complete"|"comprehension"|"settings"|"ship"|"cave"|"unload";
installButtonHaptics();
installMenuPreview();
const root=document.querySelector<HTMLDivElement>("#reader")!;
const canvas=document.querySelector<HTMLCanvasElement>("#reader-world")!;
const params=new URLSearchParams(location.search),qa=import.meta.env.DEV&&params.get("qa")==="true";
let storage:Storage|undefined;try{storage=qa?sessionStorage:localStorage;}catch{}
const initial=readProgress(storage,preferredLanguage(deviceLanguages()));
let progress=initial.progress,saveFailed=false,saveWarning=initial.warning;
const legacyMenuKey = "reader.menu.language";
let menuPreference = readLanguagePreference(storage, legacyMenuKey);
let locale = createLocale(readerCatalogs, menuPreference, deviceLanguages());
let screen:Screen="home",packId=1,run:Run|null=null,worldReturn:Screen="home",epoch=0;
let pan:MapPanController|null=null,host:ReadingPirateHost|null=null;
let cap:speech.SpeechCapabilities={preferredLanguages:[],locales:[]},capLoaded=false;
const readerTheme=()=>progress.language==="nb"?"subtract":"add";
const cameras = new Map<string,MapCamera>();
const cameraKey = () => [screen,progress.language,screen==="levels"?packId:0].join("/");
const attempt=new ReadingAttempt();
let shown:{item:ReadingItem;chunk:number;index:number;id:number}|null=null;
let result:{itemComplete:boolean;levelComplete:boolean;gold:number}|null=null;
let listenTimer:ReturnType<typeof setTimeout>|undefined,listenPaused=false,examplePlaying=false,exampleGeneration=0,appActive=true,restartDelay=400;
let advanceTimer:ReturnType<typeof setTimeout>|undefined;
let heardWords=0;
let errorMessage="",worldLoading=false,worldError=false,comprehensionCorrect=false;
let lastStoryAnswer: number | undefined;
const t: typeof locale.t = (key, values) => locale.t(key, values);
const esc=(s:string)=>s.replace(/[&<>"']/gu,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const f=(n:number)=>locale.format(n);
const navGold = (amount: number) => new Intl.NumberFormat(locale.language, {
 notation: "compact", maximumFractionDigits: 1,
}).format(amount);
const title=()=>t("brand");
const area=()=>progress.language==="nb"?0:1;
const track=()=>progress.tracks[trackKey(progress.language,packId)];
const persist=()=>{saveFailed=!saveProgress(progress,storage);};
const button=(action:string,label:string,primary=false)=>`<button class="wood-button${primary?" primary":""}" data-action="${action}">${esc(label)}</button>`;

const heading=(h:string,sub:string)=>`<div class="page-heading"><h1>${esc(h)}</h1><p>${esc(sub)}</p></div>`;
const readerMapActions=()=>chartAction({action:"ship",icon:"ship",label:t("shipShort")})+chartAction({action:"cave",icon:"chest",label:t("caveShort")});
function header():string{
 if(screen==="home"||screen==="levels"||screen==="languages"||screen==="packs")return "";
 if(screen==="cave"||screen==="unload") {
  const amount=banked(progress);
  return caveHeader(backButton({action:"back",label:t("back")}),t("caveShort"),{
   amount, accessible:`${f(amount)} ${t("gold")} ${t("banked")}`, currency:t("gold"), locale:locale.language,
  });
 }
 if(screen==="complete"||screen==="ship")return backButton({action:"back",label:t("back")});
 if((screen==="reading"||screen==="comprehension")&&run&&shown)return menuHeader({className:"reader-topbar",brand:"",back:backButton({action:"back",label:t("back")}),actions:`<span class="reading-location">${esc(t(`packName${packFor(run.pack).id}`))}<small>${esc(t("level",{count:f(run.level)}))}</small></span>`});
 return menuHeader({className:"reader-topbar",brand:"",back:backButton({action:"back",label:t("back")}),actions:`<button class="pirate-nav-link" data-action="ship" aria-label="${esc(t("yourShip"))}, ${f(aboard(progress))} ${esc(t("gold"))}">${icon("ship")}<span>${esc(t("shipShort"))}<small>${navGold(aboard(progress))} ${t("gold")}</small></span></button><button class="pirate-nav-link" data-action="cave" aria-label="${esc(t("yourCave"))}, ${f(banked(progress))} ${esc(t("gold"))}">${icon("chest")}<span>${esc(t("caveShort"))}<small>${navGold(banked(progress))} ${t("gold")}</small></span></button>`});
}
function home():string{
 const active=Object.values(progress.tracks).map(t=>t.run).filter((r):r is Run=>!!r).sort((a,b)=>b.id-a.id)[0];
 return `<section class="reader-cabin"><h1><span>${esc(title().split(" ")[0]!)}</span> ${esc(title().split(" ").slice(1).join(" "))}</h1>
  ${pirateMenu({title:t("home"),theme:"reader-actions",play:{action:"play",label:t("play")},
    resume:active?{action:"resume",label:t("continue"),detail:`${t(`packName${packFor(active.pack).id}`)} · ${t("level",{count:f(active.level)})}`}:undefined,
    ship:{action:"ship",label:t("yourShip"),detail:`${f(aboard(progress))} ${t("gold")}`},cave:{action:"cave",label:t("yourCave"),detail:`${f(banked(progress))} ${t("gold")}`},
    settings:{action:"settings",label:t("settings")},language:{action:"ui-language",label:languageOption(locale.language).flag,accessible:t("ui")}})}
 </section>`;
}
function languages():string{
 const shores=READING_LANGUAGES.map(id=>{
   const language=languageOption(id);
   return {id,label:language.name,art:`<span class="reading-flag" aria-hidden="true">${language.flag}</span>`,
     accessible:language.name,moored:progress.language===id};
 });
 return `${chartHeader({back:backButton({action:"back",label:t("back"),destination:t("home")}),actions:readerMapActions()})}<nav class="reading-overview" aria-label="${esc(t("languages"))}">${adventureChart("language",shores)}</nav>`;
}
function packs():string{
 const nb=progress.language==="nb";
 const name=t(nb?"readingFjords":"storyIsles");
 return difficultyMap({name,accessibleName:name,instructions:t("choosePack"),
   back:backButton({action:"back",label:t("back")}),actions:readerMapActions(),selected:packId,backdrop:worldAsset(readerTheme()),island:i=>worldIsland(readerTheme(),i),centerLabel:t("currentIsland"),firstArt:nb?4:9,
   stops:PACKS.map(({id})=>({id,label:t(`packName${id}`),ariaLabel:`${t(`packName${id}`)}: ${t(`packDescription${id}`)}`}))});
}
function levels():string{
 const p=packFor(packId),tr=track(),current=(tr?.cleared??0)+1;
 return atlasView(readerTheme(),languageOption(progress.language).name,backButton({action:"back",label:t("back")}),current,locale,{title:t(`packName${p.id}`)});
}
function statusText():string{
 if(errorMessage)return errorMessage;
 if(examplePlaying)return t("examplePlaying");
 if(speech.isNative()&&!capLoaded)return t("preparing");
 if(listenPaused)return t("paused");
 if(attempt.state==="accepted")return t("accepted");
 if(["preparing","listening","checking"].includes(attempt.state))return t(attempt.state as "preparing"|"listening"|"checking");
 if(attempt.state==="retry")return t("uncertain");
 if(!speech.isNative())return t("browser");
 if(capLoaded&&!speech.supportedLocale(cap,progress.language))return t("unavailable");
 return t("ready");
}
function listeningProblem():boolean{return !!errorMessage||(speech.isNative()&&capLoaded&&!speech.supportedLocale(cap,progress.language));}
function readingSupport(accepted:boolean):string{
 return `<div class="reading-support">${accepted?`<p class="hands-free-note">${esc(t("autoNext"))}</p>`:listeningProblem()?button("listen",t("tryListening")):`${button(listenPaused?"listen":"cancel-reading",t(listenPaused?"resume":"pause"))}${screen==="reading"?button("example",t("help")):""}`}</div>`;
}
function reading():string{
 const r=run!,v=shown!,p=packFor(r.pack),accepted=attempt.state==="accepted",handsFree=speech.isNative();
 const marked=(text:string)=>text.split(/(\s+)/u).map(part=>/\s/u.test(part)?part:`<span data-reading-word>${esc(part)}</span>`).join("");
 const prompt=p.kind==="word"?`<div class="reading-word" lang="${r.language}" style="--word-size:${Math.max(1.2,Math.min(4.5,22/v.item.text.length))}rem">${marked(v.item.text)}</div>`:`<div class="reading-passage" lang="${r.language}">${v.item.chunks.map((chunk,i)=>`<span class="${i<v.chunk?"read":i===v.chunk?"current":""}">${i===v.chunk?marked(chunk):esc(chunk)}</span>`).join(" ")}</div>`;
 return `<section class="reading-view reading-prompt-view ${handsFree?"hands-free":""} ${listeningProblem()?"has-listening-problem":""}">${heading(t("yourTurn"),`${v.index+1} ${t("of")} ${r.items.length}`)}<div class="reading-progress" role="progressbar" aria-label="${esc(t("progress"))}" aria-valuemin="0" aria-valuemax="${r.items.length}" aria-valuenow="${r.index}">${r.items.map((_,i)=>`<i class="${i<r.index?"done":i===r.index?"current":""}"></i>`).join("")}</div><div lang="${r.language}" class="reading-paper ${accepted?"accepted":""}">${prompt}${v.item.chunks.length>1?`<p class="chunk-count">${t("chunk")} ${v.chunk+1} ${t("of")} ${v.item.chunks.length}</p>`:""}</div><div class="reading-feedback ${accepted?"is-accepted":""}"><div class="listening-indicator ${attempt.state}" aria-label="${esc(t("sound"))}" aria-hidden="true">${icon(accepted?"star":"sound")}<span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div><p role="status" aria-live="polite">${esc(statusText())}${accepted&&result?.gold?`<strong class="earned-gold">+${f(result.gold)} ${t("gold")}</strong>`:""}</p></div>${handsFree?readingSupport(accepted):`<div class="reading-actions">${button("next",t("next"),true)}${!accepted?button("example",t("help")):""}</div>`}<p class="small-note">${esc(t("rule"))}</p></section>`;
}
function completion(): string {
 const i18n = createI18n(locale.language, []);
 const hasCargo = aboard(progress) > 0;
 return `<section class="reader-complete">${rewardLedger({
   title: `<strong>${f(packFor(packId).gold)}</strong> ${esc(t("gold"))}`,
   details: `<p class="ledger-details">${esc(hasCargo ? t("completeText") : i18n.t("alreadyCave", { gold: f(banked(progress)) }))}</p>`,
   actions: [
     { action: "next-level", label: i18n.t("nextIsland"), icon: "ship", primary: true },
     { action: "replay-level", label: i18n.t("replayLevel") },
     { action: hasCargo ? "unload" : "cave", label: i18n.t("returnCave") },
   ],
 })}</section>`;
}
function comprehension():string{
 const q=shown!.item.question!,handsFree=speech.isNative();
 return `<section class="reading-view comprehension-view ${handsFree?"hands-free":""} ${listeningProblem()?"has-listening-problem":""}">${heading(q.text,handsFree?t("sayAnswer"):"")}<div class="reading-paper" tabindex="0"><div class="reading-passage" lang="${run!.language}">${esc(shown!.item.text)}</div></div><div class="reading-actions story-answers">${q.answers.map((a,i)=>handsFree?`<p class="spoken-answer">${esc(a)}</p>`:`<button class="wood-button" data-answer="${i}" data-result="${comprehensionCorrect && i===q.correct ? "correct" : i===lastStoryAnswer ? "wrong" : ""}" ${comprehensionCorrect?"disabled":""}>${esc(a)}</button>`).join("")}</div><p role="status" class="story-status">${esc(comprehensionCorrect?t("compGood"):handsFree?statusText():errorMessage)}</p>${handsFree?readingSupport(comprehensionCorrect):comprehensionCorrect?button("after-question",t("next"),true):""}</section>`;
}
function openInterests(firstPlay: boolean): void {
 const dialog = document.createElement("dialog");
 dialog.className = "reader-dialog reader-interests";
 dialog.setAttribute("aria-labelledby", "reader-interests-title");
 dialog.setAttribute("aria-describedby", "reader-interests-help");
 dialog.innerHTML = `<form method="dialog">
   <h2 id="reader-interests-title" tabindex="-1" autofocus>${esc(t(firstPlay ? "interestsTitle" : "interests"))}</h2>
   <p id="reader-interests-help">${esc(t("interestsHelp"))}</p>
   <div class="reader-interest-options">${INTEREST_IDS.map(id => `<label>
     <input type="checkbox" name="interest" value="${id}"${progress.interests?.includes(id) ? " checked" : ""}>
     <span>${esc(t(id))}</span>
   </label>`).join("")}</div>
   <footer>
     <button class="wood-button" value="${firstPlay ? "skip" : "cancel"}">${esc(t(firstPlay ? "skip" : "cancelChoice"))}</button>
     <button class="wood-button primary" value="save">${esc(t(firstPlay ? "continue" : "saveChoice"))}</button>
   </footer>
 </form>`;
 const form = dialog.querySelector("form")!;
 dialog.addEventListener("close", () => {
  const action = dialog.returnValue;
  if (action === "save") progress.interests = readInterests(new FormData(form).getAll("interest"))!;
  if (action === "skip") progress.interests = [];
  dialog.remove();
  if (action === "save" || action === "skip") {
   persist();
   if (firstPlay) { navigate("languages"); return; }
   render();
  }
  root.querySelector<HTMLButtonElement>(firstPlay ? '[data-action="play"]' : '[data-action="interests"]')?.focus();
 }, { once: true });
 dialog.addEventListener("click", event => {
  if (event.target === dialog) dialog.close();
 });
 document.body.append(dialog);
 dialog.showModal();
}

function play(): void {
 if (progress.interests === undefined && progress.nextRun === 1) openInterests(true);
 else navigate("languages");
}

function settings():string {
 return settingsDesk(t("settings"),`
   <button class="desk-action" data-action="ui-language" aria-haspopup="dialog"><strong>${esc(t("ui"))}</strong>${languageSettingLabel(locale, menuPreference)}</button>
   <button class="desk-action" data-action="practice-language" aria-haspopup="dialog"><strong>${esc(t("world"))}</strong>${languageSettingLabel(locale, progress.language)}</button>
   <button class="desk-action" data-action="interests">${esc(t("interests"))}</button>
   <p class="reader-settings-note">${esc(t("privacyText"))}</p><p class="reader-practice-tally">${f(progress.practised)} ${t("practiceCount")} · ${f(progress.assisted)} ${t("assisted")}</p>
   ${button("reset",t("reset"))}`);
}
let practicePicker=false;
const readerDialog=document.createElement("dialog");
readerDialog.classList.add("reader-language");
document.body.append(readerDialog);
const readerPicker=bindLanguagePicker(readerDialog,{
 markup:failed=>languagePickerMarkup(locale,practicePicker?progress.language:menuPreference,deviceLanguages(),failed,
   practicePicker ? {supported:READING_LANGUAGES,title:t("world"),allowAuto:false} : {}),
 trigger:()=>root.querySelector(practicePicker?'[data-action="practice-language"]':'[data-action="ui-language"]'),
 select:id=>{
   if (practicePicker) {
     if (!isReadingLanguage(id)) return false;
     progress.language=id;
     progress.chosen=true;
     persist();
     render();
     return !saveFailed;
   }
   menuPreference=id;
   locale=createLocale(readerCatalogs,id,deviceLanguages());
   const saved=saveLanguagePreference(id,storage);
   render();
   return saved;
 }
});
function chooseReaderLanguage(practice:boolean):void {practicePicker=practice;readerPicker.open();}
function worldView():string{
 if(worldError||worldLoading){
  const message=worldError?t("worldFail"):t("loading");
  const retry=worldError?button("retry-world",t("retry"),true):undefined;
  if(screen==="ship")return `<section class="ship-recovery">${shipRecoveryLedger(t("yourShip"),message,worldError,
   worldError?[{action:"retry-world",label:t("retry"),primary:true}]:[]
  )}</section>`;
  return caveNotice(message,retry);
 }
 const cargo=aboard(progress);
 if(screen==="unload"){
  const status=host?.unloading;
  const total=status?.total??progress.cargo.length;
  const count=Math.min((status?.delivered??0)+1,total);
  return total?caveTally(createI18n(locale.language,[]).t("unloadProgress",{count,total,gold:f(cargo)})):"";
 }
 const action=progress.cargo.length?button("unload",t("unload"),true):screen==="cave"?`<button class="pirate-cave-inspect" data-action="inspect" hidden>${esc(t("inspect"))}</button>`:button("cave",t("yourCave"),true);
 if(screen==="ship"){
  const i18n=createI18n(locale.language,[]),loaded=progress.cargo.length>0;
  return `<section class="reward-dock pirate-hold">${holdLedger({
   eyebrow:i18n.t("aboardPearl"),title:i18n.t("hold"),
   cargo:loaded?`${f(cargo)} ${i18n.t("goldAboard")}`:i18n.t("noCargo"),
   note:i18n.t("alreadyCave",{gold:f(banked(progress))}),
   actions:[
    {action:loaded?"unload":"cave",label:i18n.t(loaded?"returnCave":"exploreCave"),icon:"chest",primary:true},
    {action:"packs",label:i18n.t("keepPractising"),icon:"ship"},
   ],
  })}</section>`;
 }
 return `<span id="reader-room" class="pirate-cave-sr">${esc(t("room"))}</span><div class="reader-cave-actions">${action}<button class="pirate-nav-link" data-action="ship">${icon("ship")} ${esc(t("shipShort"))}</button></div><div id="reader-pad" class="reader-move pirate-walk-pad" role="group" aria-label="${esc(t("move"))}"><span id="reader-thumb" class="pirate-walk-thumb"></span></div><button id="reader-jump" class="reader-jump pirate-walk-jump" aria-label="${esc(t("jump"))}">↑<small>${esc(t("jump"))}</small></button>`;
}
function render():void{
 const previousAction=(document.activeElement as HTMLElement|null)?.dataset.action;
 const focusedAction=previousAction==="cancel-reading"&&listenPaused?"listen":previousAction==="listen"&&!listenPaused?"cancel-reading":previousAction;
 pan?.destroy();pan=null;
 document.documentElement.lang=locale.language;document.title=title();root.dataset.screen=screen;
 root.innerHTML=`${header()}${screen==="reading"?`<div class="recording-strip">${esc(t(attempt.state==="listening"?"listening":attempt.state==="checking"?"checking":attempt.state==="preparing"?"preparing":attempt.state==="accepted"?"accepted":"reading"))}</div>`:""}${qa?`<span class="qa-badge">${esc(t("qa"))}</span>`:""}${saveFailed||saveWarning?`<p class="save-warning" role="alert">${esc(t(saveFailed?"save":"resetWarning"))}</p>`:""}<main id="reader-content" ${["levels","packs","languages"].includes(screen)?'class="map-content"':""}>${screen==="home"?home():screen==="languages"?languages():screen==="packs"?packs():screen==="levels"?levels():screen==="reading"?reading():screen==="complete"?completion():screen==="comprehension"?comprehension():screen==="settings"?settings():worldView()}</main>`;
 if(focusedAction&&["reading","comprehension"].includes(screen))root.querySelector<HTMLButtonElement>(`[data-action="${focusedAction}"]`)?.focus({preventScroll:true});
 updateHeardWords();
 if(screen==="packs"||screen==="levels"){
  const viewport=root.querySelector<HTMLElement>("[data-map-viewport]"),world=viewport?.querySelector<HTMLElement>("[data-map-world]");
  if(viewport&&world){
   const levels=screen==="levels", tr=track(), r=tr?.run;
   const draw=levels?atlasRenderer(world,readerTheme(),{cleared:tr?.cleared??0,stars:{},runs:r?{[r.level]:{solved:r.index}}:{}},locale,{
    caption:(n,solved)=>n<=(tr?.cleared??0)?t("complete"):`${f(solved)}/${f(packFor(packId).count)} ${esc(t("read"))}`
   }):null;
   pan=mountMapPan(viewport,world,{focus:{x:Number(viewport.dataset.focusX),y:Number(viewport.dataset.focusY)},scale:levels?.94:1,unbounded:levels,coverViewport:!levels,state:cameras.get(cameraKey()),onChange:(state,origin)=>{cameras.set(cameraKey(),state);draw?.(state,origin,viewport.clientWidth,viewport.clientHeight);}});
  }
 }
}
function updateHeardWords():void{
 root.querySelectorAll<HTMLElement>("[data-reading-word]").forEach((word,i)=>word.classList.toggle("heard",i<heardWords));
}
function stopListening():void{clearTimeout(advanceTimer);advanceTimer=undefined;exampleGeneration++;examplePlaying=false;clearTimeout(listenTimer);listenTimer=undefined;attempt.cancel();void speech.cancelSpeech().catch(()=>{});}
function canListen():boolean{return (screen==="reading"||screen==="comprehension")&&!!shown&&attempt.state!=="accepted"&&!listenPaused&&!examplePlaying&&appActive&&!document.hidden&&!document.querySelector("dialog[open]");}
function scheduleListening(delay=400):void{
 clearTimeout(listenTimer);listenTimer=undefined;
 if(!canListen()||!speech.supportedLocale(cap,progress.language))return;
 const current=epoch;listenTimer=setTimeout(()=>{listenTimer=undefined;if(epoch===current&&canListen())void beginListening();},delay);
}
function navigate(next:Screen):void{epoch++;stopListening();pan?.destroy();pan=null;host?.dispose();host=null;canvas.hidden=true;screen=next;errorMessage="";render();root.querySelector<HTMLElement>("h1")?.setAttribute("tabindex","-1");root.querySelector<HTMLElement>("h1")?.focus({preventScroll:true});}
function viewCurrent():void{if(!run)return;heardWords=0;listenPaused=false;examplePlaying=false;restartDelay=400;shown={item:structuredClone(currentItem(run)),chunk:run.chunk,index:run.index,id:run.id};result=null;attempt.cancel();errorMessage="";}
function openLevel(level:number,replay=false):void{
 run=startRun(progress,progress.language,packId,level,crypto.getRandomValues(new Uint32Array(1))[0]!,replay);if(!run)return;persist();viewCurrent();navigate("reading");void beginListening();
}
async function beginListening():Promise<void>{
 if(!canListen())return;
 clearTimeout(listenTimer);listenTimer=undefined;
 const locale=speech.supportedLocale(cap,progress.language);if(!locale){render();return;}
 const expected=screen==="comprehension"?shown!.item.question!.answers[shown!.item.question!.correct]!:shown!.item.chunks[shown!.chunk]!;
 const token=attempt.begin(expected,progress.language);heardWords=0;errorMessage="";render();
 try{await speech.cancelSpeech();if(attempt.token!==token||!["reading","comprehension"].includes(screen))return;await speech.startSpeech(locale,token);attempt.listening(token);render();}
 catch(error){if(attempt.token!==token)return;
  if(String(error).includes("CANCELLED")){attempt.cancel();scheduleListening(750);return;}
  attempt.fail(token,true);errorMessage=String(error).includes("PERMISSION")?t("permissions"):t("unavailable");render();
 }
}
function accepted(source:Evidence):void{
 if(screen!=="reading"||result||!run||!shown)return;const out=completeChunk(progress,run,{id:shown.id,index:shown.index,chunk:shown.chunk},source);if(!out.accepted)return;
 clearTimeout(listenTimer);listenTimer=undefined;result=out;attempt.state="accepted";errorMessage="";persist();void speech.cancelSpeech().catch(()=>{});render();if(speech.isNative())scheduleAdvance();else root.querySelector<HTMLButtonElement>('[data-action="next"]')?.focus({preventScroll:true});
}
function scheduleAdvance():void{
 clearTimeout(advanceTimer);advanceTimer=undefined;
 if(!speech.isNative()||!appActive||document.hidden||attempt.state!=="accepted")return;
 const current=epoch;
 advanceTimer=setTimeout(()=>{advanceTimer=undefined;if(epoch===current&&appActive&&!document.hidden&&attempt.state==="accepted")advanceReading();},1100);
}
function advanceReading():void{
 if(screen==="comprehension"){nextReading();return;}
 if(!result)return;
 if(result.itemComplete&&shown?.item.question){comprehensionCorrect=false;lastStoryAnswer=undefined;navigate("comprehension");void beginListening();}else nextReading();
}
function nextReading():void{if(result?.levelComplete){navigate("complete");return;}viewCurrent();navigate("reading");void beginListening();}
function dialog(kind:"adult"|"reset"):void{
 stopListening();render();const d=document.createElement("dialog");d.className="reader-dialog";d.setAttribute("aria-labelledby","reader-dialog-title");
 d.innerHTML=`<h2 id="reader-dialog-title">${esc(t(kind==="adult"?"adultTitle":"resetTitle"))}</h2><p>${esc(t(kind==="adult"?"adultText":"resetText"))}</p><div>${button("dialog-confirm",t(kind==="adult"?"confirm":"resetConfirm"),true)}${button("dialog-close",t("close"))}</div>`;
 const returnAction=kind==="adult"?"adult":"reset";
 document.body.append(d);d.addEventListener("close",()=>{d.remove();root.querySelector<HTMLButtonElement>(`button[data-action="${returnAction}"]`)?.focus();},{once:true});
 d.addEventListener("click",e=>{const action=(e.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;if(action==="dialog-close")d.close();if(action==="dialog-confirm"){d.close();if(kind==="adult")accepted("adult");else {host?.dispose();host=null;progress=freshProgress(progress.language);persist();navigate("home");}}if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.addEventListener("click", event => {
  if (event.target !== d) return;
  const box = d.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) d.close();
 });
 d.showModal();
}
async function openWorld(next:"ship"|"cave"|"unload"):Promise<void>{
 if(!["ship","cave","unload"].includes(screen))worldReturn=screen==="reading"&&result?.levelComplete?"complete":screen;
 navigate(next);worldLoading=true;worldError=false;render();canvas.hidden=false;const current=epoch;
 try{const {ReadingPirateHost}=await import("./pirateHost");if(epoch!==current)return;
   const changed=()=>{if(epoch===current&&screen==="unload")render();};
  const ready=()=>{
   if(epoch!==current)return;
   worldLoading=false;
   if(screen==="unload"&&host?.unloading.done){
    host.finishUnloadForWalk();
    screen="cave";
   }
   render();
  };
  const failed=()=>{if(epoch===current){worldLoading=false;worldError=true;render();}};
  host=new ReadingPirateHost(canvas,progress,t,p=>saveProgress(p,storage),changed,ready,failed,!qa);
  host.show(next,area());worldLoading=next==="ship";render();
 }catch{if(epoch!==current)return;worldLoading=false;worldError=true;host?.dispose();host=null;render();}
}
function back():void{
 const interests = document.querySelector<HTMLDialogElement>(".reader-interests[open]");
 if(interests){interests.close();return;}
 if(document.querySelector("dialog[open]"))return;
 if(["ship","cave","unload"].includes(screen)){navigate(worldReturn);if(screen==="reading"){viewCurrent();render();void beginListening();}return;}
 navigate(screen==="reading"||screen==="complete"||screen==="comprehension"?"levels":screen==="levels"?"packs":screen==="packs"?"languages":"home");
}
root.addEventListener("click",e=>{
 const el=(e.target as Element).closest<HTMLButtonElement>("button");if(!el||el.disabled)return;
 if(sailToShore(e,root))return;
 if(isReadingLanguage(el.dataset.language)){progress.language=el.dataset.language;packId=1;progress.chosen=true;persist();navigate("packs");return;}
 if(el.dataset.pack){packId=Number(el.dataset.pack);navigate("levels");return;}
 if(el.dataset.level){openLevel(Number(el.dataset.level),Number(el.dataset.level)<=(track()?.cleared??0));return;}
 if(el.dataset.answer!==undefined){const q=shown!.item.question!;lastStoryAnswer=Number(el.dataset.answer);comprehensionCorrect=lastStoryAnswer===q.correct;errorMessage=comprehensionCorrect?"":t("compRetry");render();return;}
 switch(el.dataset.action){
  case "ui-language":chooseReaderLanguage(false);break;
  case "practice-language":chooseReaderLanguage(true);break;
  case "center-pack":{const v=root.querySelector<HTMLElement>("[data-map-viewport]");if(v)pan?.center({x:Number(v.dataset.focusX),y:Number(v.dataset.focusY)},{smooth:true});break;}
  case "back":back();break;case "play":play();break;case "interests":openInterests(false);break;case "packs":navigate("packs");break;case "settings":navigate("settings");break;
  case "resume":{run=Object.values(progress.tracks).map(t=>t.run).filter((r):r is Run=>!!r).sort((a,b)=>b.id-a.id)[0]??null;if(run){progress.language=run.language;packId=run.pack;viewCurrent();navigate("reading");void beginListening();}break;}
  case "listen":listenPaused=false;stopListening();errorMessage="";render();void speech.capabilities().then(value=>{cap=value;capLoaded=true;if(canListen())void beginListening();}).catch(()=>{errorMessage=t("unavailable");render();});break;case "cancel-reading":listenPaused=true;stopListening();render();break;
  case "example":{if(run)run.helped=true;persist();stopListening();examplePlaying=true;const current=epoch,exampleId=exampleGeneration;render();void speech.speak(shown!.item.chunks[shown!.chunk]!,progress.language).catch(()=>{if(epoch===current&&exampleGeneration===exampleId){errorMessage=t("voiceFail");render();}}).finally(()=>{if(epoch===current&&exampleGeneration===exampleId){examplePlaying=false;render();scheduleListening();}});break;}
  case "adult":dialog("adult");break;case "reset":dialog("reset");break;
  case "next":if(speech.isNative())break;if(!result)accepted("self");advanceReading();break;
  case "after-question":nextReading();break;case "next-level":openLevel((run?.level??0)+1);break;
  case "replay-level":if(screen==="complete"&&run)openLevel(run.level,true);break;
  case "ship":void openWorld("ship");break;case "cave":void openWorld("cave");break;case "unload":void openWorld("unload");break;case "inspect":host?.inspect();break;
  case "retry-world":void openWorld(screen as "ship"|"cave"|"unload");break;

 }
});
watchMenuLanguage(storage, legacyMenuKey, preference => {
 if (preference !== undefined) menuPreference=preference;
 else if (menuPreference !== "auto") return;
 locale=createLocale(readerCatalogs,menuPreference,deviceLanguages());
 render();
 if (readerDialog.open) readerPicker.draw();
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!document.querySelector("dialog[open]")&&!["cave","unload"].includes(screen)){e.preventDefault();back();}});
const interrupted=()=>{
 clearTimeout(advanceTimer);advanceTimer=undefined;
 if(["reading","comprehension"].includes(screen)&&attempt.state!=="accepted"){stopListening();errorMessage="";render();}
};
const resumeListening=()=>{void speech.capabilities().then(value=>{cap=value;capLoaded=true;if(canListen())scheduleListening(750);}).catch(()=>{});if(attempt.state==="accepted")scheduleAdvance();else scheduleListening(750);};
window.addEventListener("resize",()=>{
 if(screen==="languages")render();
 else if(screen==="packs"||screen==="levels"){const viewport=root.querySelector<HTMLElement>("[data-map-viewport]");if(viewport)pan?.center({x:Number(viewport.dataset.focusX),y:Number(viewport.dataset.focusY)});}
});
document.addEventListener("visibilitychange",()=>{if(document.hidden)interrupted();else resumeListening();});window.addEventListener("pagehide",()=>{stopListening();host?.dispose();host=null;});
if(speech.isNative())void App.addListener("appStateChange",({isActive})=>{appActive=isActive;if(!isActive)interrupted();else resumeListening();});
void speech.listen(r=>{
 if(!["reading","comprehension"].includes(screen)||r.token!==attempt.token||attempt.state==="accepted"||!appActive||document.hidden)return;
 if(r.kind==="level"){root.querySelector<HTMLElement>(".listening-indicator")?.style.setProperty("--sound",String(r.level??0));return;}
 if(r.kind==="transcript"){if(attempt.transcript(r.token,r.text??"",r.final??false)){
   if(screen==="comprehension"){comprehensionCorrect=true;clearTimeout(listenTimer);void speech.cancelSpeech().catch(()=>{});render();scheduleAdvance();}
   else accepted("independent");
  }else {
    heardWords=heardPrefix(r.text??"",attempt.expected,progress.language);updateHeardWords();
    if(r.final){attempt.fail(r.token);render();scheduleListening(1400);}
   }}
 else {attempt.fail(r.token);render();restartDelay=Math.min(4000,restartDelay*2);scheduleListening(restartDelay);}
});
render();
void speech.capabilities().then(value=>{cap=value;capLoaded=true;if(!progress.chosen){const selected=preferredLanguage(value.preferredLanguages);progress.language=selected;}if(screen!=="reading")render();else if(canListen())void beginListening();}).catch(()=>{capLoaded=true;errorMessage=t("unavailable");render();});
if(qa){
 if(params.get("safe")==="1")for(const [edge,value] of Object.entries({top:"24px",bottom:"20px",left:"12px",right:"12px"}))document.documentElement.style.setProperty(`--pirate-safe-${edge}`,value);
 const p=Number(params.get("pack"));if(p>=1&&p<=10)packId=p;
 const language=params.get("language");if(isReadingLanguage(language)){progress.language=language;progress.chosen=true;}
 const menu=params.get("menu")??language;if(isLanguage(menu)){locale=createLocale(readerCatalogs,menu,[]);menuPreference=locale.language;}
 if(params.get("fresh")==="1"){progress=freshProgress(progress.language);progress.chosen=true;}
 if(params.get("banked")){progress.bank[0]=Math.min(1_000_000,Math.max(0,Number(params.get("banked"))||0));}
 if(params.get("cleared")){const cleared=Math.min(1_000_000,Math.max(0,Number(params.get("cleared"))||0));progress.tracks[trackKey(progress.language,packId)]={cleared,seed:91};}
 if(params.get("cargo")){const r=startRun(progress,progress.language,packId,(track()?.cleared??0)+1,91)!;while(track()?.run===r)completeChunk(progress,r,{id:r.id,index:r.index,chunk:r.chunk},"adult");}
 const view=params.get("view");if(view==="reading"){openLevel((track()?.cleared??0)+1);const state=params.get("state");if(state==="preparing"||state==="listening"||state==="checking"||state==="retry"||state==="unavailable"){attempt.state=state;render();}}else if(view==="packs"||view==="languages"||view==="settings")navigate(view);else if(view==="levels"){navigate("levels");}else if(view==="ship"||view==="cave"||view==="unload")void openWorld(view);else render();
}

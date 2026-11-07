export type Language = "nb" | "en";
export type PromptKind = "word" | "sentence" | "paragraph";
export const CONTENT_VERSION = 1;
export interface Pack { id:number; kind:PromptKind; count:number; gold:number; name:Record<Language,string>; description:Record<Language,string>; }
const names = [
  ["Første ord","First words"], ["Ord som vokser","Growing words"], ["På ordjakt","Word adventures"],
  ["Lange ord","Long word lagoon"], ["Ordkaptein","Word captain"], ["Første setninger","First sentences"],
  ["Setninger på seilas","Sentence voyages"], ["Kapteinens beskjeder","Captain’s messages"], ["Små fortellinger","Little stories"], ["Historiekaptein","Story captain"],
];
const descriptions = [
  ["Korte, kjente ord","Short, familiar words"], ["Litt lengre ord og nye lyder","Longer words and new sounds"],
  ["Flere stavelser og kjente ord","More syllables and familiar words"], ["Lange ord og sammensatte ord","Longer words and compounds"],
  ["Ord med mer krevende lyder","More demanding word patterns"], ["Én kort setning om gangen","One short sentence at a time"],
  ["Lengre setninger om livet på sjøen","Longer sentences about life at sea"], ["Les kapteinens lengre beskjeder","Read the captain’s longer messages"],
  ["En liten fortelling, setning for setning","A little story, sentence by sentence"], ["Lengre fortellinger fra sjørøverskuta","Longer stories from the pirate ship"],
];
export const PACKS:readonly Pack[]=names.map(([nb,en],i)=>({id:i+1,kind:i<5?"word":i<8?"sentence":"paragraph",count:i<5?10:i<8?5:2,gold:(i+1)*100,name:{nb:nb!,en:en!},description:{nb:descriptions[i]![0]!,en:descriptions[i]![1]!}}));
export const packFor=(id:number):Pack=>PACKS.find(p=>p.id===id)??PACKS[0]!;
export interface ReadingItem { id:string; text:string; chunks:readonly string[]; question?:{text:string; answers:readonly string[]; correct:number}; }
const words=(text:string)=>text.trim().split(/\s+/u);
const banks:Record<Language,readonly string[][]>={
  nb:[
    words(`is sol mus rev lam lim lys lus ris ros rim rom rad rot rar ren ro sen se si sa sy ny nå ni
      du de da do din den det der dem en et ei er to tre ti tå ta te tur tun tak tap tog tom`),
    words(`fisk hest båt bok ball katt kopp kake kiste kost korn krabbe krone lue luke land lampe laste
      lås måne mat melk molo mose måke nese nøtt ost pære pose post pute rake reir ring rose sand
      salt seil seng sil sko skål snø stol sopp sol suppe tang telt`),
    words(`banan kanin appelsin papegøye pirat kaptein anker havn havet øya øyer øgle solskinn sommer
      vinter regnbue lekeplass fugler skogen båter bølger venner familie stjerne himmel strand
      skjell sjøen skattekart sovepose hytte hunden katten fuglen ballong barnet blomst eple pærer
      hagen gulrot tomat potet agurk jakke bukse genser votter støvler sokker`),
    words(`fyrtårn seilbåt sjørøver skattekiste skipsdekk havnekant solnedgang soloppgang sommerdag vinterdag
      fiskebåt redningsvest bølgeskvulp måneskinn stjernehimmel sjøstjerne sandstrand steinstrand
      skogssti fjelltopp regnjakke gummistøvel matpakke eplekake bokhylle bokmerke lesestund fortelling
      eventyr vennskap oppdager kompass teleskop utkikk utkikkspost taustige skipsklokke sjøfugl
      havfrue sjøhest havskilpadde undervann småstein skjellstrand hemmelig skattekammer trebro
      skipsmast styrmann matros`),
    words(`sjørøverkaptein oppdagelsesreise solnedgangen stjernehimmelen havskilpadder redningsvester
      bibliotek fortellinger nysgjerrig forunderlig selvfølgelig overraskelse oppmerksom tålmodighet
      samarbeid vennlighet takknemlig forsiktig øyeblikk muligheter hemmelighet eventyrbok leseglede
      utforske forsvunnet undersøke forskjellige fantastisk spennende behagelig bølgebevegelse
      kystlandskap havneinngang skipsbesetning navigasjon ekspedisjon horisonten øygruppen
      undervannsverden sjøfartshistorie reisefortelling papegøyefjær kompassnål skipstegning
      kveldsfortelling stjerneskinn morgendisen skattekammeret krystallklar sjømannskap`),
  ],
  en:[
    words(`cat sun map dog pig hen fox log bed red pen ten net wet pet leg peg egg bug mug rug
      cup pup cut nut hut hat bat mat rat sat fat pat tap cap nap gap lap lip tip zip sit hit bit fit
      fin bin pin tin win`),
    words(`fish ship hand sand lamp tent nest best rest belt milk silk pond frog flag crab clap drum
      drop plum plug rock sock duck luck back pack sack bell shell hill fill doll mist grin spin
      stop step swim twin wind wing king ring sing song long soft gift lift`),
    words(`rabbit sunset picnic kitten puppet basket pocket rocket button carrot parrot lemon melon
      seven eleven cabin robin candle ticket magnet helmet ladder summer winter velvet ribbon
      napkin happen sudden muffin bucket market garden carpet silver golden cotton wooden blanket
      captain anchor island sailor ocean pebble turtle bottle little happy window`),
    words(`sunshine sailboat seashell starfish sandcastle lighthouse shipwreck treasure compass telescope
      waterfall rainbow moonlight moonbeam starlight driftwood shoreline seabird seahorse
      jellyfish butterfly dragonfly sunflower afternoon morning adventure discover explorer
      friendship playground storybook bookmark bookshelf backpack raincoat footprint coastline
      countryside underwater breakwater harbour rowboat lifeboat deckhand lookout sailmaker
      storyteller sailingboat seafarer goldfish`),
    words(`extraordinary mysterious imagination discovery expedition navigation constellation
      responsibility cooperation curiosity magnificent unforgettable adventurous comfortable
      thoughtful courageous determined delightful surprising sparkling shimmering
      underwater lightkeeper shipbuilding craftsmanship storytelling perseverance
      vocabulary understanding description conversation paragraph question answer knowledge
      whisper laughter daughter enough through although island adventure journey beautiful
      wonderful carefully together tomorrow yesterday`),
  ],
};
const people=["Pip","Ada","Leo","Mia","Ola"];
const actions:Record<Language,readonly string[][]>={
 nb:[
  ["ser en båt","finner en stein","har et kart","ser en fisk","leser en bok","finner en skatt","har en hatt","ser en øy","løfter et seil","finner et skjell"],
  ["finner et lite skjell på stranden","ser en liten båt ved kaia","legger det nye kartet på bordet","leser en spennende bok om sjøen","hjelper en venn med det tunge tauet","finner en blå stein i sanden","ser en hvit fugl over båten","henter en varm jakke fra lugaren","tegner et stort skip på papiret","bærer en liten kiste til havnen"],
  ["finner et gammelt kart som viser veien til en liten øy","hjelper den nye matrosen med å knytte tauet før båten legger fra kai","leser en fortelling om en snill kaptein som leter etter et fyrtårn","ser at den lille krabben har gjemt seg under en flat stein","legger alle skjellene i en kurv slik at ingen av dem blir borte","venter på at vinden skal snu før seilet blir heist på den store båten","tegner et merke på kartet slik at alle kan finne veien tilbake","finner en tørr plass til bøkene når det begynner å regne på dekket","hører en fugl som synger mens solen stiger opp over havnen","forteller vennene om den hemmelige stien som går helt ned til stranden"],
 ],
 en:[
  ["sees a boat","finds a shell","has a map","sees a fish","reads a book","finds a coin","has a hat","sees an island","lifts a sail","finds a pebble"],
  ["finds a little shell on the beach","sees a small boat near the harbour","puts the new map on the table","reads a lovely book about the sea","helps a friend with the heavy rope","finds a blue pebble in the sand","sees a white bird above the boat","gets a warm coat from the cabin","draws a big ship on the paper","carries a little chest to the harbour"],
  ["finds an old map that shows the way to a little island","helps the new sailor tie the rope before the ship leaves the harbour","reads a story about a kind captain who is looking for a lighthouse","sees that the little crab has hidden underneath a smooth flat stone","puts all the shells in a basket so that none of them get lost","waits for the wind to change before raising the sail on the little boat","draws a mark on the map so that everyone can find the way back","finds a dry place for the books when rain begins falling on the deck","hears a little bird singing as the sun rises slowly above the harbour","tells the crew about the secret path that leads down to the sandy beach"],
 ],
};
const objects={nb:["kartet","ankeret","skjellet","kompasset","tauet","seilet","flagget","brevet","skrinet","bildet"],en:["map","anchor","shell","compass","rope","sail","flag","letter","box","picture"]};
export function itemsFor(language:Language,packId:number):readonly ReadingItem[]{
 const p=packFor(packId);
 if(p.kind==="word")return banks[language][p.id-1]!.map((text,i)=>({id:`${language}-${p.id}-${i}`,text,chunks:[text]}));
 return people.flatMap((name,person)=>Array.from({length:10},(_,i)=>{
  let text:string;
  if(p.kind==="sentence")text=`${name} ${actions[language][p.id-6]![i]}.`;
  else if(language==="nb"){
   const object=objects.nb[i];
   text=p.id===9?`${name} finner ${object} ved havnen. Det ligger bak en kasse. Kapteinen har lett etter det hele dagen. Nå kan alle dra ut på en ny seilas sammen.`:
    `${name} leter etter ${object} som ble borte i går. Først ser hele mannskapet etter det på skipet. Ingen finner det der, så de går ned til havnen. Ved en gammel kasse oppdager ${name} noe som glitrer i solen. Der ligger det, trygt og tørt. Alle blir glade og hjelper hverandre med å gjøre skipet klart. Snart kan den nye reisen begynne.`;
  }else{
   const object=objects.en[i];
   text=p.id===9?`${name} finds the ${object} near the harbour. It is behind a box. The captain has been looking for it all day. Now the crew can sail away together.`:
    `${name} is looking for the ${object} that went missing yesterday. First, the whole crew searches carefully on the ship. Nobody finds it there, so they walk down to the harbour together. Beside an old box, ${name} notices something shining in the sunlight. There it is, safe and dry. Everyone feels happy and helps to get the little ship ready. Soon their next adventure can begin.`;
  }
  const chunks=text.match(/[^.!?]+[.!?]?/gu)!.map(x=>x.trim());
  const question=p.kind!=="paragraph"?undefined:language==="nb"?{text:"Hvor finner de det som var borte?",answers:["Ved havnen","På et fjell","I skogen"],correct:0}:{text:"Where do they find the missing item?",answers:["Near the harbour","On a mountain","In the forest"],correct:0};
  return {id:`${language}-${p.id}-${person*10+i}`,text,chunks,question};
 }));
}
export function preferredLanguage(languages:readonly string[]):Language {
 for(const raw of languages){const lang=raw.toLowerCase().split(/[-_]/u)[0];if(["nb","no","nn"].includes(lang!))return "nb";if(lang==="en")return "en";}
 return "en";
}
export function normalize(text:string):string{return text.normalize("NFC").toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/gu," ").trim();}
// Recognizers can format spoken number words as digits or choose US spelling.
// These explicit written variants preserve the expected sounds; no fuzzy word matching.
const spokenVariants:Readonly<Record<Language,Readonly<Record<string,string>>>>={
 en:{harbour:"harbor",one:"1",two:"2",to:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",ten:"10",eleven:"11"},
 nb:{en:"1",to:"2",tre:"3",ti:"10",ett:"et"},
};
const spokenTokens=(text:string,language:Language)=>normalize(text).split(" ").map(word=>spokenVariants[language][word]??word).join(" ");
export const matches=(heard:string,expected:string,language:Language="en")=>spokenTokens(heard,language)===spokenTokens(expected,language);

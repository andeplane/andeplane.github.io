import type { Language, ReadingItem } from "./content";

interface ThemeReading {
  words: readonly [string, string, string, string, string];
  story: readonly [string, string, string, string, string, string];
  question: { text: string; answers: readonly [string, string, string]; correct: number };
}

interface ReadingInterest {
  reading: Record<Language, ThemeReading>;
}

export const INTERESTS = {
  football: {
    reading: {
      nb: {
        words: ["mål", "kamp", "keeper", "målstang", "straffespark"],
        story: [
          "Mia ser en ball.",
          "Ballen triller mot det åpne målet.",
          "Selv om Mia er nær målet, spiller hun ballen til Ada, som står helt alene.",
          "Ada skyter ballen i nettet.",
          "Begge løper tilbake til midten før det andre laget får sparke i gang.",
          "På vei hjem snakker de om hvordan den lille pasningen åpnet hele banen.",
        ],
        question: { text: "Hvem skyter ballen i mål?", answers: ["Mia", "Ada", "Leo"], correct: 1 },
      },
      en: {
        words: ["run", "kick", "keeper", "goalpost", "championship"],
        story: [
          "Mia sees a ball.",
          "The ball rolls towards the open goal.",
          "Although Mia is close to the goal, she passes to Ada, who is standing all alone.",
          "Ada kicks the ball into the net.",
          "They both run back to the middle before the other team kicks off.",
          "On the way home, they talk about how that little pass opened up the whole pitch.",
        ],
        question: { text: "Who kicks the ball into the goal?", answers: ["Mia", "Ada", "Leo"], correct: 1 },
      },
    },
  },
  minecraft: {
    reading: {
      nb: {
        words: ["ull", "jord", "fakkel", "steinblokk", "diamantgruve"],
        story: [
          "Leo vil ha et hus.",
          "Han setter en fakkel ved døra.",
          "Før sola går ned, bygger Leo ferdig taket med de siste blokkene av tre.",
          "Nå kan han finne huset i mørket.",
          "Fra toppen av bakken ser han at lyset skinner helt ned til vannet.",
          "Når det blir morgen, vil han bygge en bro til den andre siden av elva.",
        ],
        question: { text: "Hva gir lys ved døra?", answers: ["En lyktestolpe", "Et bål", "En fakkel"], correct: 2 },
      },
      en: {
        words: ["dig", "block", "torch", "pickaxe", "underground"],
        story: [
          "Leo wants a hut.",
          "He puts a torch beside the door.",
          "Before the sun goes down, Leo finishes the roof with the last of his wooden blocks.",
          "Now he can find his hut in the dark.",
          "From the top of the hill, he sees the light shining all the way down to the water.",
          "When morning comes, he plans to build a bridge across the river.",
        ],
        question: { text: "What lights up the door?", answers: ["A street lamp", "A fire", "A torch"], correct: 2 },
      },
    },
  },
  peppa: {
    reading: {
      nb: {
        words: ["våt", "gris", "sølepytt", "regnstøvel", "sølespruten"],
        story: [
          "En gris ser en pytt.",
          "Den lille grisen hopper i den dype pytten.",
          "Søla spruter helt opp på magen hennes når hun lander med begge beina på én gang.",
          "Hun ler og hopper en gang til.",
          "Vennen hennes finner en mindre pytt, så de kan hoppe ved siden av hverandre.",
          "Ved porten setter de fra seg de sølete støvlene før de går inn til lunsj.",
        ],
        question: { text: "Hva spruter opp på magen til grisen?", answers: ["Søle", "Melk", "Maling"], correct: 0 },
      },
      en: {
        words: ["mud", "splash", "puddle", "rainboots", "waterproof"],
        story: [
          "A pig sees mud.",
          "The little pig jumps into the deep puddle.",
          "Mud splashes right up to her tummy when she lands with both feet at once.",
          "She laughs and jumps again.",
          "Her friend finds a smaller puddle so they can jump side by side.",
          "At the gate they take off their muddy boots before going inside for lunch.",
        ],
        question: { text: "What splashes onto the pig’s tummy?", answers: ["Mud", "Milk", "Paint"], correct: 0 },
      },
    },
  },
  fire: {
    reading: {
      nb: {
        words: ["ild", "brann", "slange", "brannbil", "brannstasjonen"],
        story: [
          "Ada ser røyk.",
          "En rød brannbil stopper ved porten.",
          "Mens de voksne venter sammen med Ada, går brannfolkene inn for å se hvor røyken kommer fra.",
          "De finner en brødrister med brent brød.",
          "Brannfolkene slår av brødristeren og åpner et vindu for å få ut røyken.",
          "Når rommet er klart igjen, kan Ada og de voksne gå inn sammen.",
        ],
        question: { text: "Hvor kommer røyken fra?", answers: ["Ovnen", "Brødristeren", "Peisen"], correct: 1 },
      },
      en: {
        words: ["hot", "hose", "rescue", "firetruck", "firefighter"],
        story: [
          "Ada sees smoke.",
          "A red fire engine stops at the gate.",
          "While the grown-ups wait with Ada, the firefighters go inside to find out where the smoke is coming from.",
          "They find a toaster with burnt toast.",
          "The firefighters switch off the toaster and open a window to let the smoke out.",
          "When the room is clear again, Ada and the grown-ups can go back inside together.",
        ],
        question: { text: "Where does the smoke come from?", answers: ["The oven", "The toaster", "The fireplace"], correct: 1 },
      },
    },
  },
  frozen: {
    reading: {
      nb: {
        words: ["snø", "frost", "skøyte", "snøkrystall", "vinterlandskap"],
        story: [
          "Mia ser snø.",
          "Hun legger et grønt skjerf rundt snømannen.",
          "Når vinden blåser skjerfet bort, følger Mia sporene i snøen helt til den store grana.",
          "Skjerfet har satt seg fast i en lav grein.",
          "Mia knyter skjerfet litt bedre før hun går inn for å varme hendene.",
          "Fra kjøkkenvinduet kan hun se den grønne knuten lyse mot all den hvite snøen.",
        ],
        question: { text: "Hvor finner Mia skjerfet?", answers: ["På isen", "Ved døra", "I en grein"], correct: 2 },
      },
      en: {
        words: ["ice", "snow", "skates", "snowflake", "icicles"],
        story: [
          "Mia sees snow.",
          "She puts a green scarf on the snowman.",
          "When the wind blows the scarf away, Mia follows the tracks in the snow all the way to the big fir tree.",
          "The scarf is caught on a low branch.",
          "Mia ties the scarf more tightly before going indoors to warm her hands.",
          "From the kitchen window she can see the green knot against all the white snow.",
        ],
        question: { text: "Where does Mia find the scarf?", answers: ["On the ice", "By the door", "On a branch"], correct: 2 },
      },
    },
  },
  dinosaurs: {
    reading: {
      nb: {
        words: ["egg", "spor", "fossil", "dinosaurfot", "planteeter"],
        story: [
          "Ola ser et spor.",
          "Sporet i steinen har tre brede tær.",
          "Guiden forteller at sporet ble til da en dinosaur satte foten i myk søle for lenge siden.",
          "Ola tegner sporet i boka si.",
          "Han holder hånda over tegningen og ser at alle fingrene får plass inni foten.",
          "Neste gang han går på tur, vil han se om det finnes dyr som lager lignende spor i søla.",
        ],
        question: { text: "Hvor mange tær har sporet?", answers: ["Tre", "Fire", "Fem"], correct: 0 },
      },
      en: {
        words: ["big", "claw", "fossil", "dinosaur", "prehistoric"],
        story: [
          "Ola sees a mark.",
          "The track in the rock has three broad toes.",
          "The guide explains that the track formed when a dinosaur stepped into soft mud long ago.",
          "Ola draws the track in his book.",
          "He holds his hand over the drawing and sees that all his fingers fit inside the footprint.",
          "On his next walk he plans to look for animals that leave similar tracks in the mud.",
        ],
        question: { text: "How many toes does the track have?", answers: ["Three", "Four", "Five"], correct: 0 },
      },
    },
  },
  animals: {
    reading: {
      nb: {
        words: ["dyr", "hale", "valpen", "dyrespor", "veterinæren"],
        story: [
          "Ada ser en valp.",
          "Den lille valpen gjemmer seg bak benken.",
          "Ada setter seg stille på bakken, slik at valpen kan komme ut når den er klar.",
          "Snart kommer den fram og snuser på skoen hennes.",
          "Ada lar valpen bli kjent med henne før hun klapper den forsiktig på ryggen.",
          "Da eieren kommer tilbake, ligger valpen rolig ved siden av den nye vennen sin.",
        ],
        question: { text: "Hvor gjemmer valpen seg?", answers: ["Bak et tre", "Bak benken", "Bak døra"], correct: 1 },
      },
      en: {
        words: ["vet", "tail", "puppy", "pawprint", "hedgehog"],
        story: [
          "Ada sees a pup.",
          "The little puppy hides behind the bench.",
          "Ada sits very still on the ground so the puppy can come out when it is ready.",
          "Soon it comes out and sniffs her shoe.",
          "Ada lets the puppy get to know her before she gently strokes its back.",
          "By the time the owner comes back, the puppy is resting beside its new friend.",
        ],
        question: { text: "Where does the puppy hide?", answers: ["Behind a tree", "Behind the bench", "Behind the door"], correct: 1 },
      },
    },
  },
  space: {
    reading: {
      nb: {
        words: ["gass", "jord", "rakett", "romdrakt", "verdensrommet"],
        story: [
          "Leo ser en rakett.",
          "Den hvite raketten står klar bak vinduet.",
          "Før motorene starter, ser Leo ned på den gule hjelmen han holder med begge hender.",
          "Han tar hjelmen på før han setter seg.",
          "Gjennom det lille vinduet ser han at husene blir mindre og mindre.",
          "Til slutt ser han bare en smal stripe med lys der byen lå da de lettet.",
        ],
        question: { text: "Hvilken farge har hjelmen?", answers: ["Rød", "Blå", "Gul"], correct: 2 },
      },
      en: {
        words: ["jet", "moon", "planet", "spacesuit", "weightlessness"],
        story: [
          "Leo sees a rocket.",
          "The white rocket is ready beyond the window.",
          "Before the engines start, Leo looks down at the yellow helmet he is holding in both hands.",
          "He puts on the helmet before sitting down.",
          "Through the small window, he watches the houses grow smaller and smaller.",
          "In the end he can see only a thin strip of light where the city was when they lifted off.",
        ],
        question: { text: "What colour is the helmet?", answers: ["Red", "Blue", "Yellow"], correct: 2 },
      },
    },
  },
  music: {
    reading: {
      nb: {
        words: ["lyd", "sang", "tromme", "trommestikke", "musikkstykke"],
        story: [
          "Mia slår på ei bøtte.",
          "Bøtta blir til ei tromme i hagen.",
          "Når Ada finner to pinner, spiller de den samme rytmen på hver sin bøtte.",
          "Leo kommer ut og synger til rytmen.",
          "De øver til alle klarer å stoppe på nøyaktig samme slag.",
          "Når naboen vinker over gjerdet, spiller de hele sangen en gang til.",
        ],
        question: { text: "Hva bruker Mia som tromme?", answers: ["Ei bøtte", "En kopp", "En kasse"], correct: 0 },
      },
      en: {
        words: ["hum", "beat", "rhythm", "drumstick", "instrument"],
        story: [
          "Mia taps a pot.",
          "The pot becomes a drum in the garden.",
          "When Ada finds two sticks, they play the same rhythm on a pot each.",
          "Leo comes outside and sings to the beat.",
          "They practise until everyone can stop on exactly the same beat.",
          "When their neighbour waves over the fence, they play the whole song again.",
        ],
        question: { text: "What does Mia use as a drum?", answers: ["A pot", "A cup", "A box"], correct: 0 },
      },
    },
  },
  mysteries: {
    reading: {
      nb: {
        words: ["tyv", "spor", "avtrykk", "detektiv", "fingeravtrykk"],
        story: [
          "Ola ser et spor.",
          "Små poteavtrykk går helt bort til kurven.",
          "Da Ola løfter teppet forsiktig, ser han at katten har lagt seg oppå votten som har vært borte.",
          "Han henter et mykt håndkle som katten kan ligge på.",
          "Katten flytter seg til håndkleet, og Ola kan dra votten ut av kurven.",
          "Neste gang han kommer hjem, legger han begge vottene på hylla.",
        ],
        question: { text: "Hva ligger under katten?", answers: ["En sokk", "En vott", "Et skjerf"], correct: 1 },
      },
      en: {
        words: ["spy", "clue", "missing", "detective", "fingerprint"],
        story: [
          "Ola sees a track.",
          "Little pawprints lead right up to the basket.",
          "When Ola gently lifts the blanket, he sees that the cat is asleep on top of the missing mitten.",
          "He fetches a soft towel for the cat to lie on.",
          "The cat moves to the towel, and Ola can pull the mitten out of the basket.",
          "Next time he comes home, he puts both mittens back on the shelf.",
        ],
        question: { text: "What is under the cat?", answers: ["A sock", "A mitten", "A scarf"], correct: 1 },
      },
    },
  },
} satisfies Record<string, ReadingInterest>;

export type InterestId = keyof typeof INTERESTS;
export const INTEREST_IDS = Object.keys(INTERESTS) as InterestId[];

export function readInterests(value: unknown): InterestId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return INTEREST_IDS.filter(id => value.includes(id));
}

export function mixInterests(
  items: ReadingItem[], language: Language, pack: number, level: number, interests: readonly InterestId[],
): void {
  const story = pack >= 9;
  // One extra story every other level keeps the pirate stories in rotation.
  if (!interests.length || (story && level % 2 === 0)) return;
  const turn = story ? (level - 1) / 2 : level - 1;
  const slot = 1 + turn % (items.length - 1);

  for (let offset = 0; offset < interests.length; offset++) {
    const interest = interests[(turn + offset) % interests.length]!;
    const reading = INTERESTS[interest].reading[language];
    const chunks = pack <= 5 ? [reading.words[pack - 1]!]
      : !story ? [reading.story[pack - 6]!]
      : reading.story.slice(0, pack === 9 ? 4 : 6);
    const text = chunks.join(" ");
    // Some simple theme words also appear in the standard bank.
    if (items.some(item => item.text === text)) continue;
    const question = story ? reading.question : undefined;
    items[slot] = structuredClone({ id: `${language}-interest-${pack}-${interest}`, text, chunks, question });
    return;
  }
}

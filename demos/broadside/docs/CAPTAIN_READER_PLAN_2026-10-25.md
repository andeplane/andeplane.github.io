# Captain Reader reading game proposal

> Updated 26 October after playtesting: listening now runs automatically and accepts live matching words. Next always trusts self-confirmation, including in the browser; the earlier adult/final-result gates below are superseded. See DESIGN_REVIEW_2026-10-26_READER.md.

Captain Reader is a pirate reading adventure for iPhone and iPad, with a browser practice version. Children sail through Norwegian and English worlds, read aloud to collect treasure, and return to their ship and cave. Each world has ten packs: five for individual words, three for sentences, and two for paragraphs. Gold increases with reading complexity, giving children a visible reason to try more advanced packs.

The release scope is two worlds with ten packs each. Target 50 reviewed prompts per pack: 500 individual words across both worlds, 300 sentence prompts, and 200 paragraph prompts. Each pack has an endless level trail. Levels contain ten words, five sentences, or two paragraphs so longer reading does not create excessively long sessions. The first implementation milestone is smaller: one complete voyage in each language, including real speech feedback and a saved reward.

## Name and visual identity

Use **Captain Reader**, with the Norwegian display name **Kaptein Leselyst** and localized subtitles “A Pirate Reading Adventure” and “Et leseeventyr med pirater.” The name makes the reading focus explicit while keeping the connection to Captain Calculus. An open book and a little pirate captain establish the visual identity. This is a working name; check store and naming availability before release.

Keep the existing parchment, teal sea, gold, ship, and treasure-room style. Use a plain, highly readable font for reading prompts, including clear lowercase letterforms and æ, ø, and å. Reserve decorative lettering for headings. Show one word on a quiet panel, without an answer-revealing picture beside it; optional pictures and pronunciation belong behind Help or after completion.

## Language selection and the two worlds

Read the ordered iOS language preferences on first launch. Apple provides `Locale.preferredLocales` on iOS 26 and `Locale.preferredLanguages` for earlier systems. Choose the first supported language in that order, with English as the fallback. This requires no location access or microphone use. [Apple multilingual guidance](https://developer.apple.com/videos/play/wwdc2025/222/)

Initially, Norwegian means **Norsk (bokmål)**. Map `nb` and generic `no` to that world. A Nynorsk preference can suggest the same world, but must clearly show “Norsk (bokmål)”; it does not imply Nynorsk content. English variants enter the English world. Start with British English spelling and select a compatible recognition locale during device testing.

The first Play screen shows the chart with the suggested language highlighted. The child can tap either destination. Remember their explicit choice; do not replace it on every launch. Keep interface language separate from practice language so a Norwegian-speaking family can practise English with Norwegian instructions. Both remain changeable in Settings. Keep progress and unfinished voyages separately for each world and pack.

The chart covers northern Europe, the North Atlantic edge, Britain, and Scandinavia. Place a Norwegian destination by Norway and an English destination by Britain, with small flag markers and localized language names on a pannable map with larger country geography. These are adventure destinations, not claims that a language belongs to only one country. Both worlds are available immediately. The Norwegian pack map uses fjords, lighthouses, and coastal villages; the English map uses harbors, cliffs, and castles.

### Imagegen art brief

Generate the chart during the visual implementation milestone using the built-in imagegen tool. Proposed prompt:

> Original antique pirate nautical chart, overhead cartographic illustration of northern Europe and the North Atlantic, recognizable Britain to the southwest and Norway with its long coastline to the northeast, Scandinavia and surrounding European coastline in believable relative positions. Delicate sepia copperplate engraving, muted teal watercolor seas, warm aged parchment, restrained gold, tiny coastal castles, fjords, a small sailing ship and a compass rose. Calm clear areas around Britain and Norway for interactive destination pins. No text, letters, numbers, flags, labels, logos, or baked-in interface. Full-bleed flat map illustration, no tabletop or rolled scroll. Geographic readability takes priority over ornament.

Review geography before accepting the asset. Store the prompt and source asset following `docs/MAP_ART.md`. Render labels, selection, routes, and buttons in code. Anchor pins in the chart's coordinate system so pan, zoom, and rotation keep them aligned. Keep the flag itself small while its full labelled marker remains at least 44 CSS pixels in each direction after map scaling. Keep both initial destinations usable, allow pan and zoom for future worlds, and match the other games’ map controls.

## Reading packs and endless levels

Length generally increases between packs, but the admission rule is reading complexity. For example, a short irregular English word can be harder than a longer word made from familiar sounds. Norwegian and English need independently reviewed banks rather than translations of the same list. The examples below illustrate the direction, not completed bank assignments.

| Pack | Reading focus | Prompts per level | Complexity weight | Gold per prompt | Gold per level |
| --- | --- | --- | --- | --- | --- |
| 1, First Words | Very short, familiar words with simple sound patterns, such as sol / cat | 10 words | 1 | 10 | 100 |
| 2, Growing Words | Slightly longer words and selected consonant groups, such as fisk / ship | 10 words | 2 | 20 | 200 |
| 3, Word Adventures | Familiar words with more syllables, such as kanin / rabbit | 10 words | 3 | 30 | 300 |
| 4, Long Word Lagoon | Longer words, compounds, and more demanding sound combinations | 10 words | 4 | 40 | 400 |
| 5, Word Captain | The most complex individual words, including language-specific irregular patterns | 10 words | 5 | 50 | 500 |
| 6, First Sentences | Simple sentences of roughly 3–5 words | 5 sentences | 6 | 120 | 600 |
| 7, Sentence Voyages | Sentences of roughly 6–9 words with broader vocabulary | 5 sentences | 7 | 140 | 700 |
| 8, Captain's Messages | Sentences of roughly 10–16 words with richer syntax | 5 sentences | 8 | 160 | 800 |
| 9, Little Stories | Coherent paragraphs of roughly 20–40 words | 2 paragraphs | 9 | 450 | 900 |
| 10, Story Captain | Coherent paragraphs of roughly 50–80 words with richer vocabulary and syntax | 2 paragraphs | 10 | 500 | 1,000 |

Pack names and reward weights are proposed tuning values; the ten-pack structure and increasing rewards are the requested scope. Length ranges guide content review rather than replacing phonics and vocabulary assessment. Use the same complexity bands and reward schedule in both languages, with independently authored content. The reward schedule rises from 100 gold per completed level in Pack 1 to a maximum of 1,000 in Pack 10. The level total is split evenly across its prompts, so each sentence or paragraph earns more than an individual word. The cap applies to each level chest, not lifetime savings.

All ten packs are freely selectable in the completed release; each starts at level one. Completing a level opens the next level within that pack. Difficulty stays fixed until the player chooses another pack. During staged development, show only playable packs. Display the gold per prompt and per completed level before starting so the incentive is clear.

Use a seeded shuffle bag for each 50-word bank: five ten-word levels expose the whole bank before another cycle. Avoid duplicates within a level and immediate repeats across cycle boundaries. Later cycles can bring previously difficult words earlier while retaining full-bank coverage. Endless levels mean new arrangements and deliberate practice; they do not promise infinitely many unique words.

Apply the same selection rules to sentence and paragraph banks, using five and two prompts per level respectively. Each 50-prompt sentence bank covers ten levels per cycle; each paragraph bank covers 25. Restarting or replaying can provide fresh practice at the same difficulty, with no daily earning cap.

Persist the actual selected item IDs, content version, and current position so closing the app or updating a bank cannot replace an unfinished voyage's prompts. Replay starts a fresh arrangement; Continue resumes the existing one. Store recent performance summaries and compact completion ranges rather than allocating a screen or save object for every future level.

Sentence generation should combine reviewed templates and compatible vocabulary slots with explicit grammar rules. Paragraphs should come from reviewed original stories, with compatible variants where useful. Do not generate unchecked text during a child's session. Paragraph packs include a simple comprehension activity with feedback and retries; recognizing speech alone does not establish understanding. Award the reading gold for completing the reading, without deducting it for comprehension retries.

## Reading aloud and feedback

The child sees the word, sentence, or paragraph. Entering a reading prompt starts listening when native capabilities and permissions allow it; there is no large microphone button. A glowing ring and small waveform show that the app is listening. The waveform reflects sound level only. It must not imply pronunciation accuracy. Sentence and paragraph layouts use comfortable line lengths and spacing; longer passages can scroll without hiding the microphone state or Back action.

On an accepted reading, the word or completed passage lights up, a gold trail reaches the ship, and the captain celebrates. The child taps Next when ready. Sentence and paragraph modes can highlight recognized words in sequence, without pulling the reading position around as provisional results change. Transcription does not provide reliable letter-by-letter pronunciation feedback, so avoid presenting that as a measured skill.

Use these explicit states:

| State | What the child sees and can do |
| --- | --- |
| Ready | Reading prompt, Read aloud, Help, progress, gold value, and Back |
| Preparing | Language download or audio preparation with progress where available, Cancel, and practice alternative |
| Listening | Visible recording indicator, sound animation, and Stop; no countdown pressure |
| Checking | Brief feedback preparation and Cancel; a bounded wait returns to Retry if the engine stalls |
| Accepted | Gold animation, a clear success cue, and Next |
| Uncertain or different reading | “Let's try that again,” with Retry and Help; keep the prompt |
| Silence or noisy room | Explain what happened; offer Retry and adult help |
| Unavailable or denied | Explain microphone/recognition readiness and offer practice with an adult |

Help can play a reviewed recording or a suitable system voice, reveal syllables, and let an adult confirm the reading. Stop recognition before any example audio or spoken feedback plays, discard pending results, and require a new listening attempt afterward. This prevents the app from rewarding its own voice. Do not use synthesized letter names as a substitute for reviewed phonics guidance.

Back saves the current prompt and stops capture. Changing world, leaving the screen, interruptions, backgrounding, and locking the phone also stop capture and cancel pending recognition. Returning shows Ready; it never resumes a hidden microphone session. Orientation changes preserve the prompt and keep the recording state visible. Every result carries a session and prompt identifier so a late callback cannot solve the next word.

### Recognition and fairness

Use native Apple Speech through a small Capacitor bridge. On iOS 26, evaluate `SpeechAnalyzer` with `SpeechTranscriber`, plus `DictationTranscriber` where appropriate. Check hardware, locale, and installed assets at runtime. `DictationTranscriber` supports on-device dictation models and does not add languages available only through server recognition. [Apple Speech overview](https://developer.apple.com/videos/play/wwdc2025/277/), [DictationTranscriber](https://developer.apple.com/documentation/speech/dictationtranscriber)

For the existing iOS 18.3 minimum, evaluate `SFSpeechRecognizer`. Before starting, require both locale support and `supportsOnDeviceRecognition`; only then set `requiresOnDeviceRecognition`. Setting the latter flag alone is insufficient. Do not silently send audio to a server when local support is missing. [On-device capability](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition), [Request configuration](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)

Neither Norwegian availability nor child-speech accuracy is established by these API descriptions. The first device experiment decides the engine and supported-device policy. If Norwegian local recognition is inadequate, adult practice is a useful fallback but does not fulfill the automatic Norwegian speech requirement; resolve that gap before promising the release feature.

Accept a finalized result that matches the target after case, whitespace, and punctuation normalization. Preserve meaningful Norwegian letters. Explicitly reviewed homophone aliases can accommodate indistinguishable sounds, but should not be described as proving spelling knowledge. Avoid broad edit-distance acceptance that confuses different words. Partial results may animate listening but never award gold.

For sentences and paragraphs, align finalized spoken words to the passage in order. Handle repetitions and self-corrections without counting them as extra progress; do not accept a passage just because a few expected words occurred. Keep omissions visible and offer a retry of the unresolved phrase. A paragraph may be read in sentence-sized chunks, with accepted chunks saved for resume. Its gold is awarded once when all required chunks are complete. Define language-specific matching cases and validate them with real longer readings before declaring these packs ready.

Test retries, sounding-out, pauses, and self-corrections. Context hints may help with the bank, but must be evaluated against wrong words and silence: excessive bias toward the displayed answer can manufacture apparent success. Recognition confidence is not a calibrated pronunciation score. Do not display percentage accuracy without a separately validated method.

Speech can support the claim that the expected word was heard. It cannot prove who spoke, that the child decoded rather than memorized it, or that they understood it. The game should celebrate practice without claiming diagnostic assessment.

## Rewards and local progress

Retain the familiar ship, chests, coin pouring, and cave. Set `goldPerLevel = 100 × complexityWeight` and `goldPerPrompt = goldPerLevel / promptsPerLevel` using the pack table. A level's chest contains the sum of its completed prompt rewards: 100 gold in Pack 1, increasing by 100 per pack to 1,000 gold in Pack 10. The most complex level therefore awards and animates at most 1,000 individual gold coins.

Animate one physical coin for each unit of gold during the chest pour. Use overlapping streams so animation duration stays enjoyable without making coins stand for multiple gold. Reduced motion can shorten movement while preserving the exact reward count. Validate the 1,000-coin reveal on the target phone, including an interruption and resume; the larger accumulated cave remains a separate performance review.

Retries, hints, recognition errors, and time taken do not reduce rewards. Adult-confirmed readings receive the same pack rate, with their assistance status retained. This intentionally differs from Captain Calculus's current first-attempt reward rule because speech uncertainty should not cost the child treasure. Display “More challenging reading earns more gold” alongside a welcoming reminder that every pack counts. Measure actual session effort during playtesting and tune the intermediate rewards within the 1,000-gold level cap so advanced reading offers a meaningful incentive; do not tie rewards to speaking quickly.

Provide adult-confirmed completion when speech is unavailable or repeatedly fails. Save whether an item was completed independently, with a hint, or with adult confirmation. All can earn encouragement; the parent view distinguishes the evidence. A skipped item remains for later and does not silently count as completed. Progress emphasizes words practised and voyages completed rather than pronunciation scores or timed streaks.

Use a new save namespace, provisionally `broadside.reading.v1`, with independent language tracks and cargo. Credit each prompt once per run and create each chest once. A deliberately started replay is a new run and can earn new gold. Store the reward schedule version and each prompt's value when the run starts; an update must not reprice accepted prompts or saved cargo. Make chest delivery idempotent and preserve an interrupted reveal or unload on relaunch. Save accepted completion before showing its reward. Report storage failures clearly while keeping the current session playable.

## Architecture and privacy

The maintained game is `demos/broadside/` in `andeplane/andeplane.github.io`. This proposal uses fetched `main` at `48359d55c5f9e0b242d634765b16c0543902e10a`, including the game release preparation in `ae96420`. The standalone Broadside folder attached to the original chat has no configured remote and contains older local work.

Proposed additions:

- `reading/index.html` and `src/reading/main.ts`: separate game entry and screens.
- `src/reading/content/nb.ts` and `en.ts`: stable item IDs, display text, accepted forms, pack, syllables or passage chunks, comprehension activities, and optional audio. Pack definitions include prompt type, prompts per level, and complexity weight.
- `src/reading/session.ts`, `progress.ts`, and `recognition.ts`: pure session rules, validated saves, and a speech state machine with an injectable test adapter.
- `src/reading/nativeSpeech.ts` and a Swift Capacitor plugin: capabilities, locale preferences, microphone capture, final/partial results, cancellation, and native lifecycle cleanup. Keep raw audio inside native memory.
- A separate `ios-reading` target and bundle, provisionally `com.andeplane.captainreader`, with its own icon, permissions, privacy text, and packaging scripts. Extend the current two-app selection deliberately rather than adding another overlapping boolean switch.

Reuse `ui/homeMenu.ts`, `menuChrome.ts`, `mapPan.ts`, and the trail windowing. The current `ui/expeditionTrail.ts` imports math operators and worlds; give it explicit presentation data before sharing it with reading. Keep the reading screen free of a running 3D scene until rewards or exploration need one.

### Shared cave ship and animation library

Broadside, Captain Calculus, and Captain Reader must consume one shared internal TypeScript library for the cave, ship presentation, and reward animations. Use `src/shared/pirate-world/` as the public module boundary in the current repository. A fix or improvement to its source must reach all three games on their next build, without copying files or separately applying the same change to each game. Do not fork these experiences for Captain Reader.

There is already useful sharing: Broadside and Captain Calculus both use `render/cave.ts`, `render/shipHold.ts`, `render/chest.ts`, and related coin components. However, `math/goldCave.ts` owns a math-specific experience controller, and the common scene classes still import sailing progress, rewards, and voyage definitions. Complete the separation instead of adding a reading-specific copy of that controller or merely wrapping the same coupled classes in a new export file.

The library owns the following implementations and their assets:

- Cave rooms, lighting, treasure and coin placement, collection display, navigation, camera, and touch controls.
- Ship and hold presentation, cargo display, chest selection, and the handoff between ship and cave. Broadside's sailing simulation remains game logic and supplies the shared presentation with the required ship data.
- Chest geometry, reveal, carrying, opening, tipping, coin pouring and physics, settling, effects, and applicable sound cues. Normal coin pouring preserves one animated coin per gold.
- The common presentation controller, cargo animation queue, loading and error states, pause/resume/cancel behavior, reduced motion, phone rendering limits, and disposal of scenes and listeners.

Give each game a small adapter that supplies presentation configuration and a view of its treasure state. Configuration includes game identity, localized labels, theme, optional relic definitions, and supported display areas. State includes banked gold, pending chests with stable IDs and actual gold values, and any game-specific collectibles. Persistence callbacks handle saving settled coin poses and committing a delivered chest. The shared controller reports completion; the game's adapter validates and saves it exactly once. Keep the core independent of math operators, reading packs, and sailing save schemas. Share art and animation assets through the same source paths.

Each game retains its own reward rules, progression, save namespace, and coin-pose namespace. Switching games must not read or credit another game's gold. Defaults and labels are explicit configuration, not branches scattered through the renderer. An interrupted animation must preserve pending cargo and restart or resume safely through the same shared lifecycle in all games.

Migrate Broadside and Captain Calculus to this boundary before integrating Captain Reader's ship and cave. Their entry points should contain game rules and adapters rather than duplicate scene construction, input handling, or animation orchestration. Improvements to the cave, ship, chest, controls, or coin animation then have one owning implementation. Share behavior fixes by default; keep only deliberate product differences in configuration.

Validate the library's lifecycle, exact coin counts, delivery, cancellation, and resource cleanup once at the common boundary, then run adapter and save-isolation checks for every game. Add an import-boundary check to prevent the shared core from importing game-specific progress modules or apps from introducing their own replacement cave/ship/animation implementations. After any shared change, build all available game entry points and native packages and perform the affected design review across all three games. Use the same source revision for the release set. Existing installed apps receive the improvement through an app update; sharing source does not hot-update already installed packages.

Ship the banks and artwork in the bundle. Plan for offline reading once required language assets are installed. Provide recorded examples for the first bank if suitable downloaded voices cannot be relied upon. The browser version offers adult-guided practice; native iOS speech is the release acceptance surface. A mock browser recognizer is for tests and must be visibly identified.

Default to local processing with no retained recordings, saved transcripts, accounts, advertising, or external AI service. Save only the item IDs and bounded practice summaries needed for progress. Request microphone access in context; request speech authorization only for the API path that needs it. Give adult-facing explanations, local reset controls, and an explicit practice alternative. The existing privacy copy names only Broadside and Captain Calculus and assumes no microphone feature; introduce game-specific copy and verify App Store privacy declarations against the actual build. Review Kids Category requirements before release. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#kids-category)

## Implementation sequence and acceptance

1. **Prove speech on a real iPhone.** Build a small native harness for Norwegian and English with representative words, sentences, and paragraphs from the proposed complexity bands. Compare available engines, test installed and missing assets, and test airplane mode. Include deliberate wrong words, similar words, silence, background voices, child-like pauses, self-correction, and the app's own playback. Use voluntary family testing and discard audio. A provisional pilot target is at least 90% of intended readings accepted within two attempts in each language, no false rewards in the scripted negative set, and median feedback within 1.5 seconds after Stop. These are product targets, not measured results or population accuracy claims. Record device, OS, engine, locale, and limitations. Change the scope or engine if the core behavior fails.
2. **Establish the shared pirate library.** Move cave, ship presentation, and reward-animation ownership behind the common module boundary and game adapters. Migrate Broadside and Captain Calculus, preserve their saves and behavior, and review both running games. Captain Reader must consume this same library, including its experience controller and animation lifecycle.
3. **Deliver one complete voyage per language.** Curate the first 50-word bank in each world, implement language defaults and overrides, the chart, one pack, speech states, resume, and one saved chest through the shared library. Adult practice must work without permission. Confirm that example playback, stale callbacks, and repeated taps cannot award a word.
4. **Complete the five word packs in each world.** Curate 50 words per pack, add endless trails and the increasing gold schedule, and complete both world maps, parent summaries, and ship/cave integration through the shared library. Review Norwegian and English content independently. Verify bounded navigation and storage with large progress fixtures.
5. **Complete sentence and paragraph packs.** Add Packs 6–8 with reviewed sentence templates and Packs 9–10 with coherent paragraphs and comprehension activities. Target 50 prompts per pack and use the shorter level sizes in the table. Validate ordered speech matching, self-correction, passage scrolling, chunk resume, and the larger rewards. All ten packs in each language are part of the release scope.
6. **Package and review.** Build the separate native app and the browser entry. Verify public subpath asset loading and the native root entry. Build and review Broadside, Captain Calculus, and Captain Reader together after shared-library changes. Check the packaged shared-library source revision, content and reward versions against the reviewed builds.

Run heavy TypeScript checks, unit tests, and supported builds through `codex-home` on `home-mini`; use `home-m1` for memory-heavy work. Use the host with the required SDK or attached phone for native and device checks, and inspect actual job exit status and results.

The mandatory design review covers Home/Continue, both language choices, all ten packs and trails per language, word/sentence/paragraph layouts, comprehension activities, all listening/error/help states, parent dialogs, complexity and reward labels, completion, pending cargo, small and large chest reveals, unloading, and empty/large caves. Review at 390×844, 320×568, and 844×390 with simulated safe areas on all edges, plus iPad and physical iPhone rotation. Check text contrast, 44×44 touch targets, map gestures, keyboard/focus, Back destinations, outside-tap/Escape dismissal, reduced motion, and first-person camera directions in every reused scene. Save representative screenshots and the state/viewport matrix.

Unit tests should target locale precedence and overrides, all ten pack definitions, bank integrity, deterministic selection and resume, variable level lengths, transcript matching and rejected near-matches, ordered passage matching and chunk resume, cancellation and stale results, save isolation, and exactly-once rewards. Check that rewards increase by complexity, no level exceeds 1,000 gold, each chest equals the sum earned, each unit of poured gold corresponds to one animated coin, retries and assistance preserve value, and updates preserve saved reward versions. Device checks must cover permissions, offline recognition, interruptions, microphone routes, pronunciation playback, and actual child speech across words, sentences, and paragraphs. Browser screenshots and passing tests do not establish these device behaviors.

Implementation began on 25 October 2026 after the shared library merged in PR #120. The reading game now uses the actual Captain Calculus pack-map component and shared level trail, with game-specific content and an independent PirateWorld adapter. The native on-device capability report is positive for Norwegian and US English on the available phone; actual speech and physical interaction acceptance remain separate from capability and browser checks. See the implementation design review for performed checks and outstanding acceptance.

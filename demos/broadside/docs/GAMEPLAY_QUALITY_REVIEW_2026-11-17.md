# Broadside gameplay quality review — 17 November 2026

## Source and visual direction

The maintained game is `demos/broadside/` in `andeplane/andeplane.github.io`.
This work starts at fetched `origin/main` revision
`584d038` on `codex/broadside-gameplay-cinematic`, in the managed checkout
`/Users/anderhaf/.codex/worktrees/broadside-gameplay-cinematic/homepage`.
The original `homepage` checkout was at `6e62ba4` with concurrent Captain
Calculus and unrelated Orbital Compute changes; those files were left intact.
The shared external project drive was not mounted locally, so the parent chat
explicitly selected this app-managed checkout.

The user's generated gameplay video and four reference images define a
cinematic tropical pirate direction: deep teal water, luminous shallows,
irregular lush islands, readable timber and dark cloth, brass, warm lanterns,
and an earned chest as the reward scene's focal point. The implementation
refines the running Babylon.js game, retaining real sailing, collisions,
combat, deck walking, fishing, progression and chest delivery. The generated
video is visual direction, not evidence of current gameplay or a promise of
frame-for-frame parity with an offline render.

The reference assessment is stored outside the maintained repository at
`/Users/anderhaf/projects/personal/games/broadside/output/audit/broadside-2026-11-17/reference-quality-bar.md`.
Its original baseline captures came from the previous maintained checkout;
its early clean-worktree captures already contain partial implementation.
Neither set is final acceptance evidence.

## Runtime and review routes

Development server: `http://127.0.0.1:5198/`, launched from the new checkout with
`npm run dev -- --host 127.0.0.1 --port 5198 --strictPort`.

Useful development fixtures, which disable player-save writes:

| Route | Surface |
| --- | --- |
| `/?qa=free&seed=81723&still=true` | Stable open sea; the simulation is held while rendering continues |
| `/?qa=free&seed=81723&view=captain` | First-person sailing; V enters deck walking |
| `/?qa=free&seed=81723&pack=2` | Storm-world appearance |
| `/?qa=0` through `/?qa=39` | Campaign sailing and combat regions |
| `/?qa=hold-4`, `/?qa=reveal-4` | Cargo hold and reward reveal |
| `/?qa=unload-4` | Shared chest delivery |
| `/?qa=menu`, `/?qa=collection` | Full-progress navigation and cave |
| `/math/?qa=true&view=reward` | Captain Calculus reward using the shared presentation |
| `/math/?qa=true&view=ship` or `view=cave` or `view=unload` | Shared Calculus ship/cave/delivery |

Portrait safe-area simulation uses `safe=44,0,34,0`; landscape uses
`safe=0,44,21,44`, in top/right/bottom/left order. `renderDpr=3` requests a real
3× drawing buffer in Broadside development fixtures. Production ignores the
QA parameters. Browser viewport emulation does not verify physical touch,
Safari/WKWebView behavior, or iPhone performance.

The public CC-BY Black Pearl is available. The previous checkout's ignored
`.private` link points to a missing directory; the optional purchased model
was unavailable and was not copied or reconstructed.

## Automated validation

Dependencies installed cleanly from the existing lockfile. The library
boundary checker passed for 62 modules. The full cloud `npm run check`
completed with exit zero: TypeScript passed; 75 test files passed, one was
skipped; 464 tests passed and two optional purchased-model tests were skipped.
Coverage was 98.37% statements/lines, 97.61% branches and 98.68% functions.
The production build passed. The job is
`/home/anderhaf/.cloud-ci/jobs/20261117-173017-96446-27771`, with `log` and
`exit` records, on `bazel-box-anderhaf`. Its source copy is
`/home/anderhaf/src/broadside-7208dbab`.

The independent runtime review subsequently found that the shifted helm's
floor sample differed from the walking spawn, disabling Take helm after
leaving it. The fix samples the same deck surface for the helm, eye and wheel.
A new regression loads the actual public Black Pearl GLB and the procedural
fallback and settles each walking spawn for 180 frames before verifying helm
readiness. After this narrowly scoped fix, TypeScript and ten focused tests
across `shipDeck`, `deckWalk` and `captainCamera` passed, followed by a local
production build.

The fresh visual review then found dark canvas obscuring the captain corridor
and landscape map controls covering the wheel. The canvas correction splits
only the known public model's mislabeled planar cloth faces onto its existing
canvas material and gathers every low corner continuously above eye height.
The real-GLB regression verifies the original triangle count and multiset,
retained iron geometry, eye clearance and unstretched seams. After these final
refinements, the boundary check, TypeScript and 20 focused tests across seven
ship/deck/camera/chest files passed, followed by the exact final production
build in 3.23 seconds. The last 320px portrait change was CSS only; the exact
production bundle was rebuilt in 2.67 seconds and independently exercised
again. The full suite was not redundantly repeated after these bounded fixes;
its earlier snapshot and the final focused checks are distinct.

One combined Impeccable detector run over 18 changed runtime TS/CSS files
returned exit zero and an empty findings array. It preceded the narrow helm
fix and was not rerun. Final `git diff --check` passed. There is no separate
format or lint script in this package.

The final full-check route is the existing `bazel-box-anderhaf` cloud-ci VM.
Home mini is reachable, but its configured external worker disk has only
6.1 GiB free, below the helper's 10 GiB reserve. Home M1 SSH timed out. The
existing cloud VM has Node 22.20.0, npm 10.9.3 and 240 GiB available; its
`~/.local/bin` must be added to PATH. No storage was deleted and no VM was
provisioned or resized.

## Packaged source provenance

The final production preview is `http://127.0.0.1:5199/`, served from `dist/`
with `npm run preview -- --host 127.0.0.1 --port 5199 --strictPort`. Both
Broadside and Captain Calculus entry points are in this build. Production
does not accept development QA query parameters.

`dist/pirate-world-build.json` was compared against a fresh SHA-256 digest of
the current source, shared runtime and common assets before final review:

| Field | Value |
| --- | --- |
| Base revision | `584d0387db15b2c8dd1fb249a8c468441703dfbf` |
| Source hash | `36e86ecd44294cc3e6c52d8ed2f19bbf1a53b8de84b921a43ce637dea28626a0` |
| Shared hash | `ebd61b37df865a1d0a1426344f2b98b402f30141319aaba6cbb7dedfded7983e` |
| Common assets hash | `6c51d97187c5b883b5f17566e646cf9ebe5cee7c24957c9de689cadb3457f37b` |
| Private ship | `false` |

The earlier cloud build matched all three pre-fix local hashes. Its revision
is `unknown` because the Mac-only worktree Git pointer was deliberately not
copied; that metadata probe is caught and does not fail the build. The final
bounded fixes change only the complete source hash; shared and asset hashes are
unchanged. The revision field records checkout HEAD when packaging; the
content hashes identify the exact implementation independently of the commit
stamp. Delivery also rebuilds the same source after the final commit so the
revision field records the delivered commit.

Validation logs and manifests are outside Git under
`/Users/anderhaf/projects/personal/games/broadside/output/audit/broadside-2026-11-17/`:
`cloud-full-check.log`, `final-refinement-check-build.log`, `final-css-build.log`,
`impeccable-final.json` and `production-provenance-final.json`.

## Visual review record

Independent headless browser checks use factual game fixtures and real
interactions. They are separate from the generated target images. The fresh
visual reviewer accepted the final material, canvas and narrow-layout fixes.
The independent runtime reviewer passed the exact final production candidate,
fetching its manifest and confirming that `broadside-BGZCdFZR.js` and
`broadside-_z7ndJQN.css` were actually loaded. No blocking review finding
remained within this browser scope.

| Surface | Checks performed |
| --- | --- |
| Sailing and weather | Daylight overhead/captain at 390×844, storm captain at 844×390, moonlight at 320×640, with simulated safe areas; water follows shoreline contours and browser error list was empty |
| HUD and rewards | 390×844, 320×568 and short landscape; visible toolbar controls at 320 were at least 44px, reward actions at least 48px high; loss/retry rows inspected |
| Landscape captain controls | 844px and 667px safe-area layouts after the overlap fix; top Sea chart remains available and opens/closes; 90×44 Ahead resets actual look yaw from .353 to .000; returning to portrait restores the minimap |
| Combat | Fort attack in campaign fixture 11 reduced hull from 100 to 96; player fire/cooldown and a visible water splash were exercised |
| Calculus loading/recovery | 390×844 delayed reward explains Boarding your ship and disables progression until ready; scene failure preserves safe-chest recovery copy and Back returns to level map |
| Shared delivery | Actual one-chest Calculus reward under reduced motion returned to cave, banked 1,000 gold, cleared cargo and settled 1,000 coins; Explore your cave and 844/320 cave layouts were exercised |
| Empty/large cargo | Empty hold at 320 and 20-chest hold at 844 retained bounded count/actions; reduced-motion hold camera stayed fixed over 60 frames |
| Pause and chart navigation | Focus moved to Keep sailing, Tab cycled the modal, Escape/outside tap dismissed it and restored focus; charts opened/closed at 320 portrait and 844 landscape |
| Direction and orientation | Deck screen-right increased local X, forward followed the view, ArrowUp raised the rendered look direction and ArrowRight turned toward screen-right; 390→320→844 deck/helm returns and return to overhead passed |
| Exact production package | Normal menus at final 320: Play→Open world→Captain→Walk deck→Take helm→chart open/close; minimap hidden and Ahead 90×44; 390 portrait restores its 88px map; no QA badge or browser errors |

HUD foreground/background calculations were: toolbar 10.63:1, title 13.88:1,
weather 12.79:1, primary action 6.94:1, secondary action 12.03:1 and hints
10.78:1. The top wash anchors these labels over the changing rendered world.
These calculations cover those concrete combinations; they do not substitute
for a complete physical-device accessibility review.

The independent review caught two problems before delivery: the helm floor
sample described above, and the landscape map/Ahead controls covering the
rendered helm. The landscape correction keeps the top Sea chart action and
moves Ahead clear of the wheel; portrait keeps its map. A subsequent fresh
visual pass also required more readable dark canvas and a continuous furl
transform. The final source and portrait/landscape day/moon captures passed
after those corrections.

Runtime evidence is stored outside Git at
`/Users/anderhaf/Documents/Codex/2026-11-17/broadside-runtime-review/`.
The detailed performed matrix is in `runtime-acceptance.md`. Representative
captures include `production-captain320-final.png`, `final-sailing390-safe.png`,
`final-deck390-safe.png`, `final-reward390-safe.png`,
`final-calculus-delivered844-safe-reduced-motion.png` and
`final-fort-impact844.contact-sheet.png`. The production narrow capture is
the exact final CSS build; some earlier production deck/Calculus captures use
the same runtime before that last captain-only CSS adjustment.
Development HUD captures and their measured rectangles are in the ignored-for-
commit `.impeccable/review/hud/` review packet. No screenshot binaries are part
of the source change.

## Technical and performance limits

The final ocean compiled on actual WebGL2 and forced WebGL1 contexts. Reopening
the Calculus 20-cargo hold twice retained one scene, 380 meshes, 29 materials,
nine textures and ten lights; delivery retained one cave scene. No new browser
or asset-load error was observed. Generated textures and the two deck lights
are scene-owned and bounded; player material clones isolate enemies.

An immutable `584d038` archive and final runtime were compared at the same
390×844 DPR1, seed 81723, frozen open-sea fixture over 120 frames. Draws rose
from 339 to 385 (about 13.6%); both samples stayed at 60 FPS. Mean browser CPU
submission time rose from 3.12 to 4.39 ms, with p95 from 3.60 to 5.70 ms. These
are variable desktop-browser CPU samples, not GPU timings or phone benchmarks.
The last change was CSS only and did not alter that measured scene.

Physical touch feel, device safe areas, WebKit GPU behavior, long-session
memory/thermal behavior and the purchased private ship remain unverified.
Every campaign level, combat balance, all save permutations, every chest
position, 100-coin reward framing, fishing catch behavior and physical
cave/harbour first-person direction were not independently retested in this
bounded review. The result is a concrete improvement to the real game; it
does not establish visual parity with a generated cinematic video.

No native package, physical-device installation or deployment is included in
this review. Those outcomes require their own observed acceptance.

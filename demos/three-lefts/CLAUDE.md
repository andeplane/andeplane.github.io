# Three Lefts — working notes

A first-person game about houses with non-trivial holonomy. See [PRD.md](./PRD.md) (what and why), [SPEC.md](./SPEC.md) (how), [LEVELS.md](./LEVELS.md) (levels 4–8 design plan).

---

## Rules for working on this repo

### Never leave a browser tab making noise

The game synthesises continuous audio. A tab left open keeps looping voices running **forever**, survives the dev server being killed (the JS is already loaded), and is untraceable noise on the owner's machine. This has happened twice and both times the owner had to report it.

**Always test with `?mute`** — `http://localhost:PORT/?mute` prevents the `AudioContext` from ever being created, so the page is guaranteed silent. Not "quiet": silent.

When finished with a browser session: `agent-browser close --all`. Don't rely on closing the dev server — it does nothing to a loaded page.

The game also suspends audio on `visibilitychange`/`pagehide`, but that does not help a *visible* background window, so `?mute` is the rule.

### Audio taste

The owner's verdict on the first audio pass was "TERRIBLE". Cause: eleven simultaneous looping noise voices (ten lamp hisses plus a room tone) added up to a hiss carpet. PRD §8 says **near-silence**, and that is a real constraint, not a mood. Anything continuous must justify itself; when in doubt, remove it. Assume I cannot hear the result and the owner has to judge it.

### Verify headlessly before touching the browser

Portal maths can be checked without rendering, and it is far faster. Write a probe that imports `World` and asserts, then:

```bash
cat > ./probe.tmp.ts <<'EOF'
import { World } from './src/world/world'
// ... build a LevelSpec, then new World(spec).checkAssertions()
EOF
SP=<scratchpad>
npx esbuild ./probe.tmp.ts --bundle --platform=node --format=esm --outfile="$SP/probe.mjs" --log-level=warning \
  && node "$SP/probe.mjs"; rm -f ./probe.tmp.ts
```

The entry file must live in the repo root (esbuild resolves `three` and `./src` from there). `three` runs fine in node — no DOM is needed for `Matrix4`/`Vector3` or for `buildCell`.

### Driving the game from the browser

`rAF` does **not** fire in an automated/background window, so the game will sit at frame 0. Pump it manually:

```js
for (let i = 0; i < 40; i++) { window.game.frame(); await new Promise(s => setTimeout(s, 16)) }
```

`window.game` is exposed in DEV only. TypeScript `private` is compile-time only, so `game.audio`, `game.player`, `game.world` are all reachable from `eval`.

Other gotchas: wrap every `agent-browser eval` in an IIFE (the eval context persists, so `const x` redeclaration throws). `agent-browser console` streams and will hang a foreground command. `agent-browser click <sel>` is a trusted input event; `.click()` from `eval` is not, so only the former will start audio or pointer lock.

### Git

This is a **worktree** (`.claude/worktrees/weird-3d-game`) sharing a stash stack with other checkouts — never bare `git stash`/`git stash pop`. Stage specific files by name, never `git add .`. Commit only when asked.

---

## Engine constraints that bite when authoring levels

These are not bugs; they are the shape of the system. Levels that ignore them fail at load.

| Constraint | Consequence |
|---|---|
| `Wall = 'N' \| 'S' \| 'E' \| 'W'` | **No floor or ceiling doors.** "Look down through a grille onto the room below" is not buildable. The Ascent's belfry-to-court view is a *wall* grille pair whose transform makes it read as a drop. |
| Walls are axis-aligned | **Every portal rotation is a multiple of 90°.** All ring holonomies are multiples of a right angle. |
| Paired doors must match `width`, `height`, and `sillRel` | `sillRel` is sill *above the local floor*. Absolute sills may differ — that is exactly how The Ascent puts rise into a transform. |
| Vertical translation comes only from ramps | A portal between two flat-floored cells has **zero** rise. Vertical holonomy needs `floor: { kind: 'ramp' }`. |
| Every door must have exactly one portal | Otherwise `World` throws at construction. |
| Holonomy cannot gate access | Where you can walk is decided by the cell graph alone. Walking a loop returns you to the *same cell*. The only real gate is a **grille** — visible, not passable. |
| `bookshelf`/`painting`/`window` are wall-mounted | Free-standing barriers must be built from `crate` (box collision) or `column` (post collision). |
| Renderer tracks no winding parity | No mirror (`det < 0`) or scale portals without engine work. |

Confirmed working, in case it looks doubtful: **a cell portalled to itself**. `World` accepts it and the stencil renderer recurses it correctly (9 cell draws, depth 3, for one cell).

## Useful facts established by probing

- 8-room ring, one left turn each: four lefts land you in **r5** — a different room — with holonomy *exactly identity*. The dead-reckoning map closes perfectly and is still wrong.
- 12-room ring: 4 lefts → r5, 8 → r9, 12 → home, all identity. A triple cover.
- Helix of 6 flights (ramp) + 6 landings (90° each): one lap = 180° + rise; **two laps = pure vertical translation**, horizontal drift cancels exactly.
- One cell glued `N↔E`, `S↔W`: four norths = identity, but the commutator `N,S,E,W` is a translation of ~(24.9, 0, 24.9). Non-abelian.
- Three Lefts already has hidden non-commutativity: west-then-east ring lands the map at (32.8, 0, −20.7); east-then-west at (−20.7, 0, −32.8).

## Performance

The renderer is **fill-rate and bandwidth bound, not geometry bound** — 115 draw calls and 23k triangles per frame, but 14 cell draws onto a half-float 4×-MSAA target. If it is slow, the levers are resolution scale, MSAA samples, and portal recursion depth, in that order. `render/quality.ts` does this automatically.

Do not try to benchmark in the automated browser: `rAF` does not fire, GPU timings come back implausible (0.69 ms for 14 cell draws), and `resize()` reads the real window so forcing a canvas size does nothing. Draw-call and triangle *counters* are trustworthy; timers are not. Set `renderer.info.autoReset = false` before counting, or you will only see the last of the many `render()` calls a portal frame makes.

## Commands

```bash
npm run dev      # vite
npm run build    # tsc + vite build
npm run check    # typecheck only
```

Holonomy assertions run at level load and print to the console every time. They are the safety net — trust them over reasoning.

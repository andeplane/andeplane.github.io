# IDEAS — uncommitted idea dump

Nothing in here is scheduled. It's raw material, much of it borrowed from the
TD canon (Bloons TD, Kingdom Rush, Defense Grid, Creeper World, Warcraft 3 TD
maps) and bent around our one unique asset: **the map is a real fluid**. Every
idea should answer "what does water make different about this?"

## Economy

- **Water royalties — money proportional to water flowing.** Passive income
  scales with actual intake at the base (full river = full trickle, strangled
  river = nothing). The carrot matching thirst's stick: players are paid to
  keep the river open, not just punished for closing it. Could replace or
  scale the flat gold trickle.
- **Bounty carried by the current:** kills drop physical gold motes that ride
  the flow and must reach your outlet to be banked — kill far upstream and a
  blockade can cost you your own income.
- **Interest between waves** (Kingdom Rush-style): small % on banked gold at
  wave clear, rewarding lean builds over hoarding… or the opposite of what we
  want — needs thought against the farm exploits.

## Towers

- **Warcraft-style build menu.** Replace the numeric tool row with a proper
  build palette: icon grid, hotkeys, hover cards showing cost/stats/what it
  does, click-to-place with a ghost preview showing range ring and (for flow
  towers) the force field it will exert. Upgrade path shown on the card.
- **Tower upgrades** (Kingdom Rush/Bloons): each tower has 2–3 tiers bought
  in place — range, rate, or a tier-3 specialization that changes behavior.
- **Slow tower (Frost/Congeal):** thickens the water in its radius (locally
  raises viscosity / drag on spores). Uniquely fluid: it doesn't slow the
  spore, it slows the *river*, so it also protects downstream walls from
  shear. Counter-play: it reduces your intake if overused.
- **Splash tower (Depth-charge / Mortar):** lobs a charge at the densest
  spore cluster; the detonation is a real pressure pulse in the sim — kills
  in a radius AND shoves survivors + water outward (can breach your own
  walls if placed carelessly).
- **Chain-lightning tower (Arc):** water conducts. Hits one spore, arcs to
  the N nearest through the water; arcs refuse to jump across walls/air.
  Upgrades: +chain count, +damage per jump instead of decay, stun.
- **Detection tower (Sonar):** pings a radius; required to reveal invisible
  spores (below). Ping is visible as a real ripple ring in the dye.
- **Sniper tower:** unlimited range, slow single-target, prioritizes the
  spore nearest the outlet. The panic-button tower.
- **Barrage/anti-swarm tower:** weak, very fast, hits everything in a small
  ring — the answer to splitter swarms.
- **Amplifier/support tower:** no damage; buffs rate/range of towers within
  its ring (classic support archetype, encourages clusters that our spacing
  rule then makes expensive — interesting tension).
- **Filter wall / net:** a buildable porous wall that lets water through but
  not spores (or damages them as they squeeze). The anti-thirst wall — but it
  clogs: each spore caught degrades it toward solid, so an unattended net
  becomes a dam and triggers everything dams trigger.
- **Whirlpool drain (consumable):** one-shot placeable that swallows spores
  in a radius for a few seconds, then collapses in a burst of backwash.
- **Unique sprites per tower type** — every tower needs its own generated
  sprite so you can tell them apart at a glance (today they're abstract
  glyphs). We'll generate the art.
- **Unique visual effects per tower** — especially the flashy ones: chain
  lightning arcs crawling through the water spore-to-spore, sonar ripple
  rings, mortar splash plumes, frost sheen over slowed water. The effect IS
  the readability: you should know what a tower does by watching it fire.

## Spores

- **Many more spores.** Waves of hundreds of small motes instead of dozens —
  the GPU particle system already scales; the fun of a fluid map is watching
  a *shoal* split around your walls. Big waves + splash/barrage towers.
- **Splitter spore:** on death, bursts into 2–4 smaller, faster spores
  (Bloons MOAB/ceramic pattern). In a fluid the burst has real recoil —
  children are flung outward and can jump lanes, so killing a splitter right
  at a junction is a mistake.
- **Invisible spore:** no glow, no dot — only its wake (a faint dimple in
  the dye) betrays it. Revealed inside Sonar range or while jet-blasted.
- **Armored spore:** immune to neutralizer beams until its shell is cracked
  by physical force — shear, jet, splash concussion. Makes the flow towers
  (impeller/vortex/jet) mandatory, not optional.
- **Fast swimmer:** actively swims upstream-of-lane toward the outlet,
  cutting corners the current wouldn't take; weak hp. Punishes pure-wall
  routing, rewards kill zones.
- **Heavy sinker:** slow, huge hp, barely affected by jet/impeller shoves
  (high inertia). The "tank" that parks in your kill zone and soaks beams.
- **Healer/spawner spore:** regenerates nearby spores, or trickle-spawns
  motes while alive — priority target that forces triage.
- **Egg/mine spore:** if it survives X seconds in your half, anchors and
  becomes a spawner until scoured off by fast water or erased.
- **Bloater:** on death releases a slick that temporarily lubricates walls
  (raises local erosion) — killing it next to your dam is a trap.
- **Shoal boss:** one giant spore that IS a soft body of many particles —
  splits under jet pressure, re-merges in calm water; only sustained
  turbulence kills it. Creeper-World-style "the enemy is a fluid too".
- **Wave modifiers:** cold snap (whole map more viscous), flood wave
  (spawns with a genuine surge front), night wave (dye barely visible, glow
  only — pure legibility play).

## Meta / structure

- **Endless mode** with scaling waves and a leaderboard (deterministic seed →
  shareable runs; the Q8/self-play infrastructure from Wall Defence is prior
  art for keeping it fair).
- **Challenge mutators** (Bloons-style): no walls, jet only, half intake,
  double erosion — one-off medals per level.
- **Replay/ghost:** the command log already exists in spirit (seeded RNG +
  input stream); record it and let players share replays or race ghosts.
- **Co-op canal:** two players, one river — split the outlet into two bases,
  shared water budget. Blocking your lane floods your partner's.

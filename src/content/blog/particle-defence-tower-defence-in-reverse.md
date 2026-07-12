---
title: "Particle Defence: tower defence, but the particles fight back"
date: "2026-04-12"
description: "What happens when two tower-defence players attack each other with autonomous particles? A* pathfinding, maze warfare, and an AI opponent with a threat heuristic."
tags: ["Game", "AI", "Pathfinding", "TypeScript", "Phaser"]
---

I love tower defence games — always have. And I've spent a career loving particles (ask my [molecular dynamics simulations](#/blog/webgpu-md-two-million-atoms-in-a-browser-tab)). With Joachim, those two loves finally collided: [Particle Defence](https://andeplane.github.io/particle-defence/) is tower defence *inverted*. You don't place turrets to stop a scripted wave — you **are** the wave. Two bases on opposite sides of a procedurally generated maze, each spawning autonomous particles that navigate toward the enemy base, in 2-player local or against an AI.

The design twist that makes it a real game: **walls are weapons**. You build obstacles to reroute *enemy* particles into long detours while keeping corridors clean for your own. Every wall placement is simultaneously defence and route-sabotage.

## Every particle is a tiny navigator

Each spawned particle runs **A\*** over the maze grid: expand the node minimising

$$
f(n) = \underbrace{g(n)}_{\text{cost so far}} + \underbrace{h(n)}_{\text{estimate to goal}}, \qquad h(n) = |\Delta \mathrm{col}| + |\Delta \mathrm{row}|
$$

![Every particle plans its own route](/blog/particle-defence/astar-maze.svg)

*An actual A\* run on a maze layout — the shaded cells are what the search expanded before finding the route. The Manhattan heuristic never overestimates on a 4-connected grid, so the path found is provably shortest.*

The heuristic being *admissible* (never overestimating) is what guarantees optimal paths; being *tight* is what keeps the search cheap — notice how the expansion cloud hugs the corridor instead of flooding the map. That efficiency matters at gameplay scale: dozens of particles re-plan whenever the maze changes, mid-game, sixty times a second in the worst moments. When a wall goes up, affected particles recompute from their current cell — you can watch a stream of particles bend around your fresh obstacle like water finding a new channel, which is quietly the most satisfying visual in the game.

Kill an enemy particle, earn gold. Spend it on the **upgrade tree** — faster particles, shields, homing behaviour — or bank toward the specials: area blasts, and a nuclear strike that erases a chunk of the maze (both players' walls; use with feelings).

## The AI opponent

The AI controller was the most fun system to build. It plays the same game you do — no cheating information — driven by a **threat-score heuristic** over map regions: if its particles keep dying in the same area, that region's score rises, and the AI responds by rerouting (building walls to shift its particles' A\* solutions elsewhere), or, past a threshold, deciding the region is a fortified kill-zone and saving for a nuke. Difficulty tuning is honest, too: harder AIs don't get more gold, they just spend it with less latency and better timing.

It's a nice little case study in emergent difficulty — the AI has no scripted strategies, but "notice where you're bleeding, then either go around or blow it up" reads as intent when you're playing against it.

## Engineering notes

Built on **Phaser 3** for rendering and arcade physics. Two decisions paid for themselves many times over:

- **Every game constant lives in one `config.ts`** — spawn rates, upgrade costs, particle speeds, AI reaction times. Balancing a 2-player game is endless knob-turning; making every knob one file means a rebalance is a diff, not an archaeology dig.
- **The post-game stats screen** shows nine dual-series timeline graphs — gold, spawns, kills, walls, for both players — as canvas line charts with a glow pass. It started as a debugging tool for AI tuning and got promoted to a feature: the post-mortem argument about *when exactly the game turned* is half the fun of a 2-player match.

Tower defence taught me to love mazes; physics taught me to love particles. Turns out the natural way to combine them is to let the particles do the pathfinding and let your friend build the maze against you.

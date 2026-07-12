---
title: "Particle Defence: tower defence, but the particles fight back"
date: "2026-04-12"
description: "What happens when two tower-defence players attack each other with swarms of bouncing particles? A physics-particle game where you shape a chaotic flow with walls instead of routing smart units."
tags: ["Game", "Physics", "TypeScript", "Phaser", "AI"]
---

I love tower defence games — always have. And I've spent a career loving particles (ask my [molecular dynamics simulations](#/blog/webgpu-md-two-million-atoms-in-a-browser-tab)). With Joachim, those two loves finally collided: [Particle Defence](https://andeplane.github.io/particle-defence/) is tower defence *inverted*. You don't place turrets to stop a scripted wave — you **are** the wave. Two bases on opposite sides of a procedurally generated maze, each spawning particles that stream toward the enemy base, in 2-player local or against an AI.

The design twist that makes it a real game: **walls are weapons**. You build obstacles to deflect the enemy swarm into dead ends while keeping open lanes for your own. Every wall is simultaneously defence and sabotage.

## The particles are actually particles

Here's the thing I want to be precise about, because it's the whole soul of the game. The units do **not** pathfind. There's no A\*, no Dijkstra, no flow field — nothing computes a route. Each particle is a little ballistic body:

- it **launches** from your base at a random angle within ±72° of "toward the enemy," at a fixed speed;
- every frame it gets a tiny **random drift**, biased 65% of the time toward the enemy side — this exists purely to stop particles getting stuck, not to navigate;
- when it hits a wall it **reflects** specularly, like light off a mirror (the velocity component normal to the wall flips), plus a small random kick;
- top and bottom edges **wrap** around.

![No pathfinding: launch, drift, bounce](/blog/particle-defence/particle-motion.svg)

*A faithful trace of the real model — same launch spread, drift, and specular bounces the game runs. Most particles are still ricocheting around; occasionally one threads the gaps to the enemy base.*

That's it. It's closer to a gas of particles in a box — or a billiard-ball simulation — than to a strategy game's unit AI. Which means the maze doesn't get *solved*; it gets *shaped*. You aren't outsmarting a router by building a longer path — there is no router. You're changing the geometry that a chaotic swarm bounces around inside, tilting the odds of how many particles reach the far wall per second. That emergent, statistical feel is exactly why building it scratched the physics itch and not the algorithms itch.

## Where the depth actually lives

With movement this simple, the game gets its richness from everything the particles *do* along the way:

- **Combat on contact.** When opposing particles collide they fight, and the damage model has real texture: a speed-difference bonus (fast particles hit harder), anti-tank HP scaling so swarms of cheap units can bring down a few fat ones, and a defense stat that blunts it.
- **Territory.** Particles claim the grid cells they pass through. Captured cells slow enemy particles and give your own a defense bonus, so the map slowly stains with ownership and the middle becomes contested ground.
- **Destructible walls.** The walls you build aren't permanent — enemy particles chip away at them on each bounce, so a defensive line decays under pressure and has to be maintained.
- **Economy.** Kills pay gold; gold buys the eight upgrade types (health, attack, radius, spawn rate, speed, defense, max particles, and an interest rate on banked gold) plus researched **towers** — Laser (damage) and Slow (area control) — and the **nuke**, which wipes every enemy particle and tower on a five-minute cooldown.

Seven procedurally generated map types (percolation fields, recursive-backtracker mazes, hourglass chokepoints, lanes, islands, rooms, fortresses) change the bounce geometry enough that strategies don't transfer between them.

## The AI opponent

The AI plays the same game you do, with the same information — but note what it *can't* do: reroute its units, because nothing routes them. So its intelligence is entirely **economic and tempo-based**. It scores the eight upgrades against the current game state (weighted by a difficulty profile) and buys the best one, researches and places towers, and decides when to fire the nuke — triggering when it's losing badly, when the enemy particle count floods past a few hundred, or out of desperation. Harder AIs don't cheat on gold; they just evaluate and react faster.

It reads as intent without any scripted strategy — but the intent is "manage my economy and pick my moment," never "find a clever path," because paths aren't a thing here.

## Engineering notes

Built on **Phaser 3** for rendering and the game loop. Two things I'd call out:

- **Balance is simulation-tested.** There's a whole headless harness — tournament runner, ablation runner, a balance calculator — that plays AI-vs-AI matches across profiles and maps to catch dominant strategies before a human ever does. Balancing a 2-player game by hand is guesswork; balancing it by running thousands of matches is engineering.
- **The post-game screen** shows ten dual-series timeline graphs — army size, military power, kills per minute, base HP, gold banked and produced, upgrade levels, population-cap pressure, damage per second — for both players at once. The post-mortem about *when exactly the game turned* is half the fun of a local match.

Tower defence taught me to love mazes; physics taught me to love particles. Particle Defence is what happened when I stopped trying to make the particles smart and just let them bounce — and let you, and your friend, bend the swarm with walls.

---
title: "teslacode.dev: continuing my coding agents from the car"
date: "2026-06-28"
description: "Tesla's browser blocks video while the car is in use — so here's how I stream my Mac's screen into the car anyway, over a WebRTC DataChannel, one JPEG at a time."
tags: ["WebRTC", "Claude Code", "TypeScript", "SaaS", "Hack"]
---

A confession about how I work now: my coding sessions don't really *end*, they just change rooms. I kick off a Claude Code session, it churns away on something for twenty minutes, and life happens in between — including a lot of time sitting in the car, parked outside a kindergarten or plugged in at a charger. And every time, the agent is back home asking me a question I could answer in five seconds. Squinting at a phone screen while mirroring a Mac is technically possible and spiritually miserable.

Meanwhile the car has a gorgeous fifteen-inch touchscreen with a web browser in it, doing nothing.

So: [teslacode.dev](https://teslacode.dev) — share your Mac's screen into your Tesla's browser and keep the session going properly while you're parked or charging, eyes-up on a big screen instead of hunched over a phone. (Yes, parked. The whole point of coding *agents* is that the car time is mostly reading and nudging — but it's reading and nudging from a proper screen, hehe.)

## The constraint that makes it interesting

The obvious implementation is a WebRTC video track into a `<video>` element. Ten minutes of work. It also doesn't work: **Tesla's browser blocks video playback whenever the car is "in use"** — anything short of parked-in-Theatre-mode kills a `<video>` element.

But it doesn't block images. And that asymmetry is the whole product:

![Frames without video: the DataChannel workaround](/blog/teslacode/pipeline.svg)

*If you can't play video, play a lot of images with confidence.*

The Mac side captures the screen with `getDisplayMedia()`, draws each frame to an offscreen canvas, encodes JPEGs, and ships the raw bytes over a **WebRTC DataChannel**. The Tesla side is almost embarrassingly simple: receive bytes, blob them, swap the `src` of an `<img>`. Ten to twenty frames a second, with quality and rate adapting to the car's connection. It's a video codec's dumbest cousin — no inter-frame compression at all — and for reading terminal output it's *fine*, because a Claude Code session is mostly static text that changes in bursts.

The server never sees a frame. A little Hono + WebSocket service brokers the SDP/ICE handshake and gets out of the way; frames flow peer-to-peer, or through a TURN relay when the car's network demands it (it demands it — in-car connectivity is NAT all the way down).

## Closing the loop: talking back

Watching your agent is half the job; the other half is answering it. The Tesla viewer has mic and send controls that travel *backwards* — Tesla touchscreen → DataChannel → the share page on the Mac → a small local daemon (`npx teslacode.dev`) that synthesises the actual keystrokes into whatever app you're sharing. Combined with Claude Code's voice mode, the loop closes completely: the agent asks, I answer out loud from the driver's seat, work continues.

Note what's *not* in that path: the server. Keystrokes are peer-to-peer too. Given that this thing is typing into a terminal on my Mac, "the relay infrastructure cannot inject input even in principle" felt like a design requirement, not a feature.

## The unglamorous 80%

The hack was a weekend; the product was not. Turning it into something other people can use meant the whole adult checklist — Firebase auth with anonymous sessions that just work out of the box, Google sign-in for more weekly minutes, Stripe billing for 1080p and faster refresh, Postgres on Railway, Metered's TURN fleet, and an amount of WebRTC reconnection-state debugging that I will not be romanticising in a blog post. Connection state machines across a car's flaky LTE are where optimism goes to die.

But the core of it still makes me grin: the entire product exists because one platform blocked one HTML tag, and `<img>` walked through the door `<video>` couldn't. Constraint-driven design at its pettiest and finest.

Now if you'll excuse me, the charger's at 80% and my agent has a question.

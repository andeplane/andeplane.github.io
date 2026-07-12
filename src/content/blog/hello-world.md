---
title: "Hello, World"
date: "2026-03-14"
description: "Launching my personal site — what it's built with, why I built it, and what's coming next."
tags: ["Meta", "React", "TypeScript"]
---

After years of maintaining an increasingly stale portfolio and scattering project links across GitHub READMEs and LinkedIn, I finally sat down and built a proper personal site.

## What's here

The site has three main sections:

- **Projects** — detailed writeups of things I've built, from molecular dynamics simulations running in WebAssembly to an augmented reality iOS app for Norwegian lighthouse navigation
- **Blog** — longer-form posts on topics I find interesting: simulation, web performance, TypeScript patterns, and the occasional detour into mathematics
- **About** — a bit about who I am and what I work on

## The stack

I wanted something minimal that I'd actually enjoy maintaining. The choice fell on:

- **Vite 7 + React 19 + TypeScript** — fast dev loop, excellent DX
- **Tailwind CSS v4** — the new `@import "tailwindcss"` approach with CSS custom properties for theming is elegant and requires zero config files
- **React Router v7 (hash mode)** — hash routing means no server-side redirect tricks needed for GitHub Pages
- **react-markdown + remark-gfm** — blog posts are plain markdown files; adding a new post is just creating a new `.md` file

No CMS, no database, no build-time static rendering. Just a fast SPA deployed to GitHub Pages.

## A note on the archive

You'll notice posts dated before this one. When launching the site I imported writeups of earlier projects — Atomify, FyrLysAR, the WebGPU experiments — and backdated them to when the work actually happened, so the blog reads as the history it describes rather than a launch-day dump.

## What's coming

I plan to write regularly about things I'm building and thinking about. Some topics in the queue:

- The physics model behind the curling simulator — velocity-dependent friction and why curl strengthens late in the shot
- The gory details of compiling LAMMPS to WebAssembly: the CMake + Emscripten toolchain, dev containers, and embind memory leaks
- Porting Lunar Explorer's procedural terrain to Apple Vision Pro

Thanks for stopping by.

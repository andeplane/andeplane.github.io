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

## What's coming

I plan to write regularly about things I'm building and thinking about. Some topics in the queue:

- How I compiled LAMMPS to WebAssembly and got it running at near-native speed in the browser
- The physics model behind the curling simulator — velocity-dependent friction and why curl strengthens late in the shot
- WebGPU neighbour lists: spatial hashing on the GPU for molecular dynamics

Thanks for stopping by.

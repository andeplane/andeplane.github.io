# Research

Everything the reconstruction was built from, and everything needed to take the
project further. The viewer is one floor up; this is the floor below it.

```
MANIFEST.md          the archive: what was found, what was checked, what the rights are
fetch-sources.mjs    re-downloads the source PDFs, verified against recorded hashes
sources/             where those PDFs land — NOT committed, see below
dai-project-pages/   DAI project pages, archived as text
models/              metadata for the one public 3D asset that exists, and why it is useless
outreach/            drafted, unsent emails to the people who may hold better source files
```

## Getting the sources

```bash
node research/fetch-sources.mjs
```

The PDFs are **not committed.** They are ~68 MB of third-party material licensed
for private scientific use only — the DAI terms embedded in the files expressly
prohibit redistribution and commercial use — and this repository is public. So
the archive is reproduced on demand, and every file is verified against the
SHA-256 it had when the model was built.

Five of the seven sit behind proof-of-work bot walls and cannot be scripted; the
script prints their URLs, target paths and hashes so you can save them from an
ordinary browser and re-run to verify. It is idempotent — files already present
and correct are left alone.

If this ever moves to a private repository, committing the PDFs directly becomes
reasonable and the script becomes unnecessary.

## Read MANIFEST.md first

It records four places where the original research brief did not survive
verification, and will save you repeating the same dead ends:

- the one "public downloadable 3D model of the Heraion" is a 5,240-face
  automated terrain patch built from NASADEM and OpenStreetMap, with no
  archaeological content at all
- the DAI / University of Cyprus 3D reconstruction work is scoped to the **Early
  Bronze Age settlement**, not the temple
- the two projects have different directors, so the routing for a files request
  is not what it looks like
- neither DAI plan set contains a measured plan of the Polykratean temple. §5a
  lists the three publications that would close that gap, one of them free

## State of play

Documentary sources: **good enough to build from**, and that is what happened.

3D assets: **none exist.** So the parametric reconstruction in `../src/` is the
primary path, not a fallback, and the outreach below is the upside case.

The highest-value single change to the model is adding antae to the pronaos:
Kienast & Furtwängler excavated the anta wall foundation, so the cella walls
demonstrably ran east to terminate in antae flanking the porch, and the model
leaves that end open. That is a known error rather than an open question.

## Outreach

`outreach/` holds four drafted emails, **none sent**. `outreach/README.md`
explains the send order and why the Ephorate letter should be held rather than
fired off with the rest. Contact details were verified against live institutional
pages except where explicitly marked inferred.

## Before any of this goes further public

Two open rights questions, both cheap to ask now and expensive to be told about
later:

1. **DAI plans and plates.** Fine for building an internal reconstruction; not
   fine for shipping redrawings in a sponsored, ticketed or contracted product
   without written permission.
2. **The ODAP site plan.** The monument coordinates in `../src/monuments.js` were
   read off it. The measurements are facts about where buildings stand, but the
   drawing is ODAP's — see MANIFEST §5c.

Neither blocks a personal, non-commercial demo. Both need settling before a
visitor-facing deployment.

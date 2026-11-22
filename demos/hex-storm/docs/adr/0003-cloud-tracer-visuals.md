# ADR 0003 — Cassini-style cloud tracer as the default view

**Status:** accepted

## Decision

The default view is a passive scalar advected by the flow, continuously seeded with fine
noise and slowly forgotten, so streaks stretch into streamlines — the same thing the real
cloud decks do. A second channel carries concentric "bands" that are advected and never
re-seeded; where they stay sharp the jet is acting as a barrier. Vorticity and speed
colour maps and a ψ-contour overlay are one keystroke away for the science view.

A DFT of vorticity around the jet, read back every few frames, drives a live "sides"
readout so the polygon count is measured rather than eyeballed.

## Alternatives

- Particles — flashy, but a point cloud does not read as an atmosphere and needs its own
  render pass and buffers.
- Vorticity only — honest but grey-on-grey for anyone who has not seen a vorticity map.

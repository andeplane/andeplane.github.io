# Bucket LLM — connected Ax + b

A separate experiment at `/demos/water-buckets/`. The existing `water-gpt` and
`water-tanks` demos are unchanged. The page currently supports rectangular
matrices with 1–4 rows and columns, editable weights, inputs and biases.

## What actually moves

Before Pour, all connections are visible and stationary. Input buckets contain
`|x_j|` litres, bias buckets contain `|b_i| / S` litres, and intermediate/output
buckets are empty. There are no supply taps during a run.

Choose `S = max(1, max_j sum_i |A_ij|)`. Each input outlet divides its water into
fractions `|A_ij| / S`, delivering them through visible pipes into intermediate
product buckets. The remaining fraction goes to a visible spare-water bucket.
After that pour settles, intermediate and bias buckets drain into the positive
or negative output buckets according to the product/bias sign. Every output
component has two actual buckets. Their height rulers have a shared calibration:
one litre represents S numerical units. Thus the final reading is
`S * (V_positive - V_negative) = Ax + b`.

The topology and splitter fractions are configured from A, not from the expected
answer. Rendering uses bucket volumes and transported packets. The digital
reference is used only in the optional arithmetic check. Input and bias water,
including in-transit packets and spare water, is conserved throughout the run.
A reset explicitly restores the initial loaded state. Changing dimensions or
values rebuilds the stationary circuit before another pour.

This is an ideal hydraulic network model, with ideal splitters and sequenced
valves. Pipe transport follows the displayed paths; the drain rate is
Torricelli-like. It is not a CFD or hardware validation. Fixed matrix coefficients
permit passive fraction splitting plus calibration. A general two-variable
multiplier or future layer-to-layer conversion is a separate design problem.

## Interface and scope

Hover, focus or select a bucket to trace the connected paths and corresponding
matrix cell. Fit shows the entire system; zoom and pan allow larger matrices to
be inspected. Pause freezes both transport and levels. Calc-GPT and matrix chains
remain future work. The small welcome modal contains conceptual operation previews.

## Validation

`npm ci && npm run build` runs TypeScript, 30 Vitest tests and Vite. Tests cover
conservation during transport, real intermediate stages, no movement before Pour,
measured-source dependence, signed and zero values, cancellation, spare water,
reset/replay and all 16 shapes from 1×1 through 4×4.

Browser review: ready, flowing, paused, settled, edited-negative and resized
rectangular states; path selection, fit/zoom and replay. Reviewed default desktop,
390px and 320px portrait, 844×390 landscape, and simulated 24px top / 20px bottom /
12px side safe areas. Mobile diagrams can be zoomed and panned; physical-device
touch feel and actual hydraulic hardware remain unverified.

# Pendulum Writer

Open `/#/experiments/pendulum-writer` in the homepage. Project metadata registers it in
the existing Projects catalogue. This feature uses the homepage's React and Three.js
dependencies and is lazy-loaded.

The page has two sections: **The simulator** and **How it works**. Typing a name refits
the amplitudes after a short debounce. The mode spectrum shows both axes, supports
horizontal scrolling/zooming, and lets visitors select and edit amplitude and phase.
Edits recompute the free response without refitting the target; restoring coefficients
returns to the saved fit. The drawing supports drag/pinch pan/zoom and zoom buttons.

Names use vendored public-domain Hershey centreline script glyphs from
https://github.com/techninja/hersheytextjs. The default Anders is the original connected
stroke. Latin letters, punctuation and common Latin accents are supported; unsupported
characters produce a visible error rather than disappearing. Custom drawings can have
multiple strokes. Pen lifts are represented throughout sampling, rendering and exports.

The explanation draws a simplified A with the **same coupled-frame model**, using 2,
4, 6 or 12 pendulums in total. Its three-second drawing window and magnified schematic make the
motion easier to inspect. It does not apply a force that follows the target letter.

## Model

The frame translates in two horizontal directions without rotating. Each direction has
a bank of `n` planar, point-mass pendulums. Along x, the y bank is part of the moving
frame mass (and conversely along y). For one axis, use absolute coordinates
`q = [X, b_1, ..., b_n]`:

```
M = diag(M_frame + n m, m, ..., m)
V = 1/2 k X² + Σ 1/2 (m g / l_i) (b_i - X)²
k = (M_frame + 2 n m) g / L_suspension
```

`createSystem` diagonalizes `M^-1/2 K M^-1/2`. This produces `n+1` coupled modes,
including the frame's suspension mode. `fitPath` fits cosine/sine coefficients at
those actual frequencies to an arc-length parameterized target over a finite drawing
window. Positions and velocities at release follow from those coefficients. The
trajectory is then the closed-form free response of this linear mechanical system;
it is not a pen driven directly along the target.

Uniform modal damping is equivalent to `C = 2 gamma M`. The damped frequencies are
`sqrt(omega_j² - gamma²)` and velocities include the envelope derivative. A conservative
triangle-inequality bound on relative bob amplitudes scales the entire solution to
keep all angles at most 10 degrees. Exported writing dimensions include this scale.

The target's DC component is provided by positioning the paper, not by statically
deflecting the freely moving frame. The target has a smooth return segment after
82% of the drawing window. Pen lift is a separate timed action; disabling it shows and
exports all travel marks. A physical drawing window is not an exact period of the
coupled oscillators: replay resets the launch conditions.

The ideal comparison uses `n` exact harmonics per axis and provides wave parameters,
not purported physical initial conditions.

## Limits

This is a small-angle feasibility simulation, not a fabrication design. The 3D apparatus
magnifies frame travel, compresses lengths, and separates the bob banks schematically.
The solver omits rotation, collision/contact, finite bob dimensions, nonlinear pendulum
motion and pencil friction. A real machine would need synchronized initial velocities,
accurate pivots, suitable bob clearances and a pen-lift mechanism.

## Validation

`npm run test:pendulum-writer` checks eigenvectors against the coupled matrix,
reaction-force balance, undamped energy conservation, damping dissipation, angle
bounds, fitting quality and target normalization. It also checks typed names, separate
strokes and coefficient edits. An independent RK4 reference integrates the nonlinear
Newton pendulum equations directly from the fitted initial conditions. For default
Anders, it differs from the small-angle solution by about 0.08% RMS of the reference
drawing span, under the same translating-frame and spring-suspension constraints.
This numerical check does not validate pencil contact or a physical build. These tests
are also wired into CI.

For the default Anders stroke with 24 pendulums in each bank, a 6-second cycle and
zero damping, the model yields about 0.68% shape RMS and 5.5 mm writing width. The
lengths span approximately 1.4 cm–2.24 m and the suspension length is 8.95 m.

Build the homepage with `npx tsc -b` and `npx vite build`. The repository's full
`npm run build` additionally reinstalls and rebuilds all independent demos.

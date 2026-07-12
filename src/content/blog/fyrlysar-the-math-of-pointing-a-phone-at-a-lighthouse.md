---
title: "FyrLysAR: the math of pointing a phone at a lighthouse"
date: "2023-11-19"
description: "Flightradar, but for lighthouses. Given only gravity and a compass, how does a phone know exactly which pixel a lighthouse should appear on? A complete derivation of the AR camera basis."
tags: ["AR", "Math", "Linear Algebra", "iOS", "Navigation"]
---

My good friend Joachim Graff and I share a slightly nerdy love for navigating at sea. Lights, sectors, charts, the whole liturgy of it. And we share a long-standing gripe: lighthouse navigation is a *night* skill. In daylight the coast is mute — the towers are hard to spot against the terrain, and the blinking pattern that identifies them is off.

At some point one of us said: *it's too bad you can't do this in daylight — it would be super with a Flightradar for lighthouses.* Point your phone at the horizon and see every lighthouse, live, overlaid on the camera image with its name, distance, and light characteristic.

That became [FyrLysAR](https://github.com/andeplane/FyrLysAR) ("fyr" is Norwegian for lighthouse). The dataset was the easy part — the Norwegian Coastal Administration publishes every light in the country. The interesting part, and the subject of this post, is a question that sounds trivial and isn't:

> Given the phone's GPS position, its accelerometer, and its magnetometer — **which pixel** should a given lighthouse be drawn on?

No ARKit, no visual tracking, no machine learning. Two sensor vectors and some linear algebra.

## What the sensors actually give you

Everything the phone knows about its own orientation comes from two vectors, both measured in **device coordinates** (the frame glued to the phone: $x_d$ to the right of the screen, $y_d$ toward the top, $z_d$ out of the screen toward your face):

- $\mathbf{g}$ — gravity, from the accelerometer. At rest this points straight down at $9.8\,\mathrm{m/s^2}$, and the OS does a decent job of separating it from hand shake.
- $\mathbf{m}$ — the magnetic field, from the magnetometer.

![What the sensors hand you](/blog/fyrlysar/device-vectors.svg)

*The two measured vectors, drawn in the world. The phone knows their coordinates in its own frame — the goal is to reconstruct the world from them.*

The critical thing about $\mathbf{m}$ — the thing that breaks every naive compass implementation — is that it does **not** point horizontally north. The field lines of the Earth dive into the ground. In southern Norway the *inclination* (dip) is about $72°$: the magnetic field vector points mostly *down*, only weakly north. Tilt the phone and the down-component of $\mathbf{m}$ bleeds into what a naive implementation thinks is the heading.

So we don't use a "compass heading" number at all. We use the raw vectors and build a full 3D basis.

## Building the world from two vectors

We want the local **ENU frame** — East, North, Up — expressed in device coordinates. Up is free:

$$
\hat{\mathbf{u}} = -\frac{\mathbf{g}}{\lVert\mathbf{g}\rVert}
$$

For East, here's the trick. Decompose the magnetic field into a horizontal part and a vertical part. With dip angle $\delta$:

$$
\mathbf{m} = \underbrace{\lVert\mathbf{m}\rVert\cos\delta\,\hat{\mathbf{n}}}_{\text{horizontal, due north}} \;-\; \underbrace{\lVert\mathbf{m}\rVert\sin\delta\,\hat{\mathbf{u}}}_{\text{the annoying dip}}
$$

Now cross it with up. The vertical part dies ($\hat{\mathbf{u}}\times\hat{\mathbf{u}} = \mathbf{0}$), and the horizontal part rotates into East ($\hat{\mathbf{n}}\times\hat{\mathbf{u}} = \hat{\mathbf{e}}$):

$$
\mathbf{m}\times\hat{\mathbf{u}} = \lVert\mathbf{m}\rVert\cos\delta\,(\hat{\mathbf{n}}\times\hat{\mathbf{u}}) = \lVert\mathbf{m}\rVert\cos\delta\;\hat{\mathbf{e}}
$$

$$
\hat{\mathbf{e}} = \frac{\mathbf{m}\times\hat{\mathbf{u}}}{\lVert\mathbf{m}\times\hat{\mathbf{u}}\rVert}
$$

The dip angle cancels *identically* — we never even need to know it. (The construction only degenerates where $\cos\delta \to 0$, i.e. at the magnetic poles, where a compass is useless anyway.) The third axis is then forced by right-handedness:

$$
\hat{\mathbf{n}} = \hat{\mathbf{u}}\times\hat{\mathbf{e}}
$$

![Two cross products build the world basis](/blog/fyrlysar/enu-basis.svg)

*û comes from gravity; crossing m with û kills the dip component and leaves pure East; a final cross product recovers true horizontal North.*

This is the classic *tilt-compensated compass*, but stated as what it really is: reconstructing an orthonormal world basis from two non-parallel reference vectors (aerospace people know it as the TRIAD method).

## The rotation matrix

Stack the three unit vectors — each expressed in device coordinates — as the rows of a matrix:

$$
R \;=\; \begin{pmatrix} \hat{\mathbf{e}}^{\mathsf T} \\[2pt] \hat{\mathbf{n}}^{\mathsf T} \\[2pt] \hat{\mathbf{u}}^{\mathsf T} \end{pmatrix}
\qquad\Rightarrow\qquad
\mathbf{v}_{\mathrm{ENU}} = R\,\mathbf{v}_{d},
\quad
\mathbf{v}_{d} = R^{\mathsf T}\mathbf{v}_{\mathrm{ENU}}
$$

$R$ takes device coordinates to world coordinates; because it's orthonormal, its transpose goes the other way. That transpose is the matrix the renderer wants: *given a direction in the world, what is it in camera coordinates?*

Two practical corrections before moving on. First, $\hat{\mathbf{e}}$ and $\hat{\mathbf{n}}$ point at *magnetic* east/north; true north differs by the local declination (a couple of degrees in Norway — we rotate about $\hat{\mathbf{u}}$ by the value from the World Magnetic Model). Second, raw sensor data is noisy and the magnetometer is slow; FyrLysAR smooths with a complementary filter so the overlay is stable but still snaps quickly when you swing the phone.

## Where is the lighthouse?

The other half of the problem is the target direction. GPS gives the observer $(\varphi_0, \lambda_0, h_0)$; the database gives the lighthouse $(\varphi, \lambda, h)$. For distances up to a few tens of kilometres, a local tangent-plane approximation is plenty:

$$
\Delta E = R_\oplus \cos\varphi_0\,(\lambda-\lambda_0), \qquad
\Delta N = R_\oplus\,(\varphi-\varphi_0)
$$

$$
\Delta U = h - h_0 - \frac{d^2}{2 R_\oplus}, \qquad d = \sqrt{\Delta E^2 + \Delta N^2}
$$

That last term is my favourite detail in the whole app: **the Earth curves away beneath the sightline**. A lighthouse 20 km out sits about 31 m below your local horizontal plane — omit the correction and every distant light floats visibly above the horizon. (FyrLysAR also loads 50 m-resolution elevation rasters so the marker sits on top of the actual terrain, and checks the light's listed range to decide whether it's visible at all.)

## From direction to pixel

Now combine: transform the world-space direction into camera coordinates,

$$
\mathbf{d}_{\mathrm{cam}} = R^{\mathsf T}\,(\Delta E,\, \Delta N,\, \Delta U)^{\mathsf T}
$$

and apply a pinhole projection. The camera looks along $-z_d$, so with focal length $f$ the screen offsets are just similar triangles:

$$
x_s = f\,\frac{d_x}{-d_z}, \qquad
y_s = f\,\frac{d_y}{-d_z}, \qquad
f = \frac{W/2}{\tan(\mathrm{FOV}_h/2)}
$$

![From camera-space direction to screen pixel](/blog/fyrlysar/projection.svg)

*The pinhole model: the ray to the lighthouse crosses the image plane at the focal distance. Similar triangles give the pixel.*

where $W$ is the viewport width in pixels and $\mathrm{FOV}_h$ is the camera's horizontal field of view (calibrated once per device model — vendors publish nominal values that are close but not close enough). A marker is on screen when $-d_z > 0$ and the projected point lands inside the viewport; otherwise we draw an edge arrow hinting where to turn.

The quiet superpower of doing it with the full matrix, rather than the "compute a bearing angle, compare with compass heading" approach you'll find in most tutorials: **roll is free**. Hold the phone level, tilted, upside down, in landscape — the basis captures the complete orientation, and every lighthouse stays glued to its true position while the world swings around in your camera.

## The result

The rendering loop runs at 60 fps in Qt/QML with the camera feed underneath, glowing markers on top, and a tap giving you name, distance, and the light characteristic — so you can check *"Flash, 2 s period"* against the chart even at noon.

Was it necessary? Absolutely not; the chart works fine. Was it *super*? It really is. Two vectors, three cross products, one transpose — and the coast starts talking during the day.

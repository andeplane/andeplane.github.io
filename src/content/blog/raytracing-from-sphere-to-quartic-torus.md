---
title: "Ray tracing by hand: from the sphere to the quartic torus"
date: "2026-06-07"
description: "Every analytic ray tracer is the same three steps: write F(p) = 0, substitute the ray, find the smallest positive root. Derivations for the sphere, cylinder, and the gloriously quartic torus."
tags: ["Ray Tracing", "Math", "GLSL", "WebGL", "Education"]
---

Deep inside every ray tracer — from a 1980s demo to a path tracer burning a render farm — sits the same little question, asked billions of times: *does this ray hit this object, and if so, where?*

I built an [interactive explorer](https://andeplane.github.io/Raytracing/) for exactly that question, because the math deserves better than being scattered across textbook appendices. You pick a surface — sphere, cylinder, torus — and work through it in three tabs: the **Theory** derivation, an **Intuition** view where you drag the ray and watch the intersection polynomial deform live, and a **Code** tab with a live GLSL editor where your formulas render in real time. (The repo also ships a structured [student task](https://github.com/andeplane/Raytracing) — derive on paper, implement in GLSL, watch it appear.)

This post is the theory tab, in blog form.

## The recipe

Every analytic ray–surface intersection is the same three moves:

1. **Write the surface implicitly:** $F(\mathbf{p}) = 0$.
2. **Substitute the ray** $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$ (with $\lVert\mathbf{D}\rVert = 1$) to get a 1D polynomial $f(t) = 0$.
3. **Take the smallest positive root** $t^\ast$; the hit point is $\mathbf{P}(t^\ast)$ and the surface normal is the gradient, $\hat{\mathbf{N}} = \nabla F / \lVert\nabla F\rVert$, evaluated there.

The *degree* of the polynomial is the geometry's personality: it's the maximum number of times a straight line can pierce the surface.

## Warm-up: the sphere (degree 2)

A sphere of radius $R$ at the origin: $F(\mathbf{p}) = \mathbf{p}\cdot\mathbf{p} - R^2$. Substituting the ray and using $\mathbf{D}\cdot\mathbf{D} = 1$:

$$
f(t) = t^2 + 2(\mathbf{O}\cdot\mathbf{D})\,t + \mathbf{O}\cdot\mathbf{O} - R^2 = 0
$$

A quadratic — a line can cross a sphere at most twice. The same result has a beautiful geometric reading, which is how I actually remember it:

![Ray–sphere intersection, geometrically](/blog/raytracing/ray-sphere.svg)

*Project the centre onto the ray to get $t_{ca}$, use Pythagoras to get the miss distance $d$, then Pythagoras again inside the sphere for the half-chord. The discriminant of the quadratic and the test $d > R$ are the same fact wearing different clothes.*

The normal is $\nabla F = 2\mathbf{p}$ — pointing radially out, as it must.

The cylinder ($F = p_x^2 + p_z^2 - R^2$, axis along $y$) is the same story with a twist: $\mathbf{D}$ is unit length in 3D but its $xz$-shadow isn't, so the leading coefficient stops being 1:

$$
f(t) = (D_x^2 + D_z^2)\,t^2 + 2(O_x D_x + O_z D_z)\,t + O_x^2 + O_z^2 - R^2
$$

— and that coefficient can even vanish (a ray parallel to the axis), which is precisely the sort of edge case the live shader editor makes memorable: get it wrong and the screen tells you immediately.

## The main event: the torus (degree 4)

The torus is why this project exists. Ring radius $R$ (centre of the tube to the axis), tube radius $r$, axis along $y$:

$$
F(\mathbf{p}) = \left(\lVert\mathbf{p}\rVert^2 + R^2 - r^2\right)^2 - 4R^2\left(p_x^2 + p_z^2\right)
$$

(Derivation of *that*: the distance from $\mathbf{p}$ to the ring's centre circle must equal $r$; move the square roots to one side and square twice.) Substitute the ray, abbreviating $b = \mathbf{O}\cdot\mathbf{D}$ and $k = \mathbf{O}\cdot\mathbf{O} + R^2 - r^2$, so that $\lVert\mathbf{P}(t)\rVert^2 + R^2 - r^2 = t^2 + 2bt + k$. Squaring and collecting powers of $t$:

$$
f(t) = t^4 + 4b\,t^3 + \left(4b^2 + 2k - 4R^2(D_x^2 + D_z^2)\right)t^2 \\
+\; \left(4bk - 8R^2(O_x D_x + O_z D_z)\right)t + k^2 - 4R^2(O_x^2 + O_z^2)
$$

A **quartic**. And the geometry says it must be: aim a ray through the ring near its plane and it can pierce the tube on the near side (in, out) and again on the far side (in, out) — four real roots:

![f(t) for a ray through a torus](/blog/raytracing/torus-quartic.svg)

*A real trace from the explorer's parameters: the ray crosses the tube twice on each side of the ring. The regions where $f < 0$ are literally the ray's time inside the dough.*

The normal again comes free from the gradient:

$$
\nabla F = 4\left(\lVert\mathbf{p}\rVert^2 + R^2 - r^2\right)\mathbf{p} \;-\; 8R^2\,(p_x,\, 0,\, p_z)
$$

No trigonometry, no parametrisation, no UV seams — one gradient evaluated at the hit point.

## Finding quartic roots without crying

Ferrari's closed-form quartic solution exists and is a numerical horror show in `float32` — catastrophic cancellation everywhere, exactly the precision GLSL gives you. The explorer takes the robust route instead, and makes it a lesson of its own:

- **Scan + bisect:** march $t$ in small steps, watch for sign changes of $f$, then bisect each bracketing interval down to pixel precision. Boring, bulletproof, and easily good enough at fragment-shader rates.
- **Newton's method** as the comparison: $t_{n+1} = t_n - f(t_n)/f'(t_n)$ converges quadratically when it converges — and the explorer lets you watch it shoot off to the wrong root from an unlucky start, which teaches more about Newton than any theorem statement.

The torus is the sweet spot of this whole topic: rich enough to need real care (four roots! numerical traps!), small enough to fit on a napkin. Past degree 4 the analytic road ends — Abel–Ruffini says quintics have no general closed form — and ray tracing switches to iterative machinery like sphere tracing over signed distance fields. The quartic torus is the last surface you can conquer *exactly*.

## Full circle

The reason this math is close to my heart: it's how [Atomify](#/blog/atomify-molecular-dynamics-for-the-rest-of-us) draws millions of atoms. The renderer never tessellates a single sphere — each atom is a flat camera-facing quad, and the fragment shader runs exactly the ray–sphere intersection derived above, per pixel, shading a perfect sphere with exact normals and correct depth. What began as a master's-thesis rendering trick ended up, fifteen years later, as a teaching tool for the trick itself.

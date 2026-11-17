# Water and shore rendering

The visual reference is the supplied Broadside video. Explore Titanic was also inspected read-only at `andeplane/explore-titanic`, source commit `ffe6b436b` (2026-11-17). Its `src/env/ocean.ts`, `fftOcean.ts`, `spectrum.ts`, `webFoam.ts`, `math.ts` and `docs/agents/environment.md` show useful techniques: layered wave scales, filtered ripple normals, Fresnel reflection, broadening distant glints, translucent crests and broken foam. A saved Titanic frame, `shots/issue1378/stern-port-wide.png`, was reviewed alongside the video.

This change uses independently written Broadside geometry, texture generation and GLSL. No Titanic code, purchased models, textures, asset-bank payloads or Noniv-derived GLSL were copied. Titanic's optional `webocean` shading and foam identify Noniv/web-ocean, Copyright 2026 Maksymilian Dendura, under MIT in `src/env/WEB-OCEAN-LICENSE`; a future direct port must retain that exact notice. The private Titanic hull, wake, iceberg, star and weather dependencies are outside this implementation.

The Broadside ocean retains its four existing wave components, underwater surface, weather, whirlpool and gameplay inputs. A radial grid uses 21,505 vertices, compared with the old 25,921; a single 256×256 repeating mipmapped slope texture is generated at construction. There are no FFT, reflection or depth render passes. Surface shading uses a shared sky zenith, water Fresnel, bounded microfacet sun glints, crest tint, and contour-following clear shelves and foam. Surface wake intensity is driven by actual ship speed. The remaining wake particles are smaller and more transparent.

`islandShape.ts` owns the shore harmonics. Both the terrain geometry and GLSL consume those constants; water uniforms carry the original island phase even when the island is rendered across a periodic world seam. Far water skips contour trigonometry outside a conservative shelf bound. The ocean considers at most twelve nearby island uniforms and eight ship uniforms, as before. Rendered shoreline variation does not change collision radii, routes, saves or generated world locations.

Palms share one merged geometry with broader folded fronds; bushes, ferns and shore rocks remain instances. Additional vegetation is capped, and rocky clusters leave open coves instead of evenly circling every beach. Jetty positions use the same coast and treasure chests rest on the rendered terrain when it is available.

## Checks performed

- TypeScript typecheck passed after the final shader changes.
- 24 focused tests passed: coastline, island streaming/resource cleanup/periodic placement, open-sea save and seam behavior, and ship simulation.
- Headless agent-browser captures inspected at 390×844 daylight overhead and captain view, 844×390 storm captain view, and 320×640 moonlight with simulated safe areas. Browser error list was empty. The daylight shore capture shows the turquoise shelf and surf following the terrain coves; the storm view shows continuous ripples to the horizon.
- A first captain capture caught a black model/pose transition. Fresh settled portrait and landscape captures were clean. The transition is retained for the integration review, rather than counted as a passed loading check.

Captures live outside Git in `output/audit/broadside-2026-11-17/` under the user's original Broadside workspace. Physical iPhone touch feel and device GPU performance are not established by these desktop captures. The final integrated test/build, complete UI review and resource benchmarks are recorded by the parent task separately.

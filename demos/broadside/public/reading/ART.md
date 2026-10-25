# Captain Reader artwork

Original assets generated with the built-in imagegen tool on 25 October 2026. Interface text, destination flags, numbered pins, parchment labels, routes, listening status and controls are rendered in code. Captain Calculus's running interface is the reference for layout and map presentation; the shared `ui/difficultyMap.ts` implements both games' pack picker.

- `northern-europe.png`: overhead pirate sea chart, recognizable Britain and Norway, sepia copperplate engraving, muted teal watercolor seas and warm parchment land. No baked-in labels or interface. Used as a pannable language map with small flag markers.
- `english-world.png`: continuous tall painterly pirate map, emerald islands, turquoise passages, waterfalls, harbors, a small library and castle. Ten landing areas, no labels, no detached image tiles. Style reference: `public/math/worlds/addition.webp`.
- `norwegian-world.png`: continuous tall painterly Norwegian coast, green fjord islands, pine trees, wooden harbor houses, waterfalls, library and coastal castle. Ten landing areas, no labels or detached image tiles. Style reference: `public/math/worlds/subtraction.webp`.
- `icon.png`: the Calculus icon's dark teal and warm gold nautical style, with every arithmetic symbol removed. The central motif is an open book, quill and sail mast inside a compass circle. No text or digits. The generated original was resized to an opaque 1024×1024 PNG for the app icon, with the same pixels copied to the native asset catalog.

## Final prompt set

The chart prompt requested an original antique northern-European nautical chart with Britain southwest, Norway northeast, a spacious North Sea, small coastal castles and a compass rose; no text, flags, labels, routes or interface.

For each reading world: match the supplied Captain Calculus world map's rich painterly pirate style, perspective and detail. Create one continuous very tall 1:3 scene, with a winding sea route and ten distinct landing areas alternating left and right from a gentle bottom harbor to more elaborate islands near the top. Use emerald tropical islands for English and green fjord islands with snowy distant peaks and Norwegian timber harbors for Norwegian. Leave quiet water for runtime pins and parchment labels. No text, letters, numbers, flags, markers or UI. No collage, cutout islands, circular thumbnails or copperplate style for these pack maps.

For the icon: preserve the reference's dark teal full-bleed background, gold and parchment palette, clean simple shapes and circular compass border. Replace all arithmetic symbols and digits with an unmistakable large open book and elegant quill, with a subtle sail/boat silhouette. Reading must be immediately apparent. No mathematical signs, app name, fake lettering or busy scenery.

A six-screen concept board and an early isolated-island atlas remain local design history under ignored `artifacts/captain-reader/design/`. They are not shipped interface screens or game assets. The isolated-island approach was replaced after comparison with Captain Calculus.

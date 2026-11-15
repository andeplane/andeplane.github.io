# Playing card assets

- Source: https://github.com/letele/playing-cards
- Immutable source revision: `865a78eb940c1232e4b21523577c8fca52f694fe`
- Original files: `assets/{C,D,H,S}-{A,2,3,4,5,6,7,8,9,10,J,Q,K}.svg`
- Retrieved: 2026-11-11
- Local modifications: none; all 52 SVGs are byte-for-byte downloads.
- License: CC0 1.0 Universal; the complete upstream license is in `LICENSE`.
- Upstream documentation: `UPSTREAM-README.md`, preserved from the same revision.
- Credits: letele's assets adapt Adrian Kennard's playing card designs, https://www.me.uk/cards/ . The original designer also identifies these designs as CC0/public domain. Credit is preserved here for provenance, although CC0 does not require attribution.
- Integrity: `SHA256SUMS` records each SVG's SHA-256 hash.

## Rendering

All SVG roots have `viewBox="-120 -168 240 336"`, `width="2.5in"`, and `height="3.5in"`: a 5:7 width:height ratio. Use a 5:7 container and a full-size image. The originals specify `preserveAspectRatio="none"`, so a container with a different ratio would stretch the artwork.

Filenames use `C` for clubs, `D` for diamonds, `H` for hearts, and `S` for spades, followed by a hyphen and the rank (`A`, `2`–`10`, `J`, `Q`, `K`). Example: `/cards/H-Q.svg`.

## Corner indices and stacking

Measured from the top-left of the 240×336 viewBox:

- Rank viewport: x=5.6, y=12, width=32, height=32.
- Suit viewport: x=8.216, y=49, width=26.769, height=26.769.
- Together they occupy the first 75.769 viewBox units (22.55% of card height).

Leave at least 24% of a card's height exposed when stacking, approximately 0.336 times its width (34px at a 100px card width). This includes clearance below the suit. Bottom-right indices are rotated copies of the same arrangement.

## Verification

On retrieval, every file was parsed as XML and checked against the exact 52-card filename set. All 52 have the same 5:7 viewBox and intrinsic dimensions. Every resource reference resolves to a local fragment within its SVG. The deck contains no scripts, event handlers, foreign objects, raster/external media, DTDs or entity declarations. Representative ace, seven, queen, and king SVGs were rasterized successfully with librsvg for visual inspection.

# Broadside acceptance checks — 2 October 2026

## Current campaign

- Twelve deterministic courses in four packs: steering, pirates, island cannons, kraken.
- Each course reaches a broad exit and unlocks one unique 3D treasure and the next voyage.
- Three stars at ≤15% cumulative damage, two at ≤55%, one for completion with more damage or a rescue. Replays preserve the best score and gem count.
- Manual cannons choose one broadside. Fast taps queue correctly; no automatic firing.
- Once-per-contact grounding damage, hidden gems, physical fortress projectiles and timed kraken damage.
- Local saves validate scores and relic IDs; restricted or corrupt storage does not prevent play.
- Chest reveal: closed chest, anticipation, real lid hinge, warm light burst, rising level-specific treasure, three staggered stars, then enabled continuation buttons. Reduced motion completes the sequence sooner.

## Automated evidence

`npm run check` covers strict TypeScript, simulation tests with coverage thresholds, and the production build. The chest choreography tests cover concealment, completion, long pauses, and reduced-motion timing. Generated routes are exercised with real sailing physics across all twelve levels and multiple seeds.

## Browser evidence

Desktop and small viewport checks: 390×740, 320×568, 844×390 and 1280×720.

- First four voyages completed through the actual browser controls in the production preview; rewards returned to the cave and survived reload. The first voyage was replayed in the final production build and reached the animated chest reveal with three stars and zero damage.
- Manual BOOM changed the pirate hull and displayed real cannonballs and reload feedback. All four ship model classes loaded. Audio unlocked during actual play.
- Fort and kraken development previews checked visually with live simulation. Sea-click steering worked after the picking-ray import and coordinate scaling fix.
- Cave swipes, pack selection, arrows and return-from-reward checked in small windows.
- Final chest and gold reveal checked at 390×740; sapphire ring reveal and cave return checked at 320×568. Labels and actions remain clear of the animated treasure. Screenshots of development fixtures are identified by the on-screen saves-disabled badge.
- QA URLs are development-only and do not read or write player progress. Public production ignores them.

Physical iPhone/Android performance, Safari audio and simultaneous touch steering/fire remain unverified; the user requested browser-window testing for this delivery.

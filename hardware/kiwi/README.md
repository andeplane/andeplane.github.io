# Kiwi

A 29 cm three-wheel indoor robot prototype, documented at [andeplane.github.io/hardware/kiwi/](https://andeplane.github.io/hardware/kiwi/). This repository contains a project workbench, parametric CAD, reference electronics envelopes, print files, and researched procurement/control plans. The physical robot has not been built or commissioned.

## Design files

- `cad/kiwi.py`: authoritative editable CadQuery design. Its parameters and actual generated checks define the prototype revision.
- `public/hardware/kiwi/cad/` at repository root: STEP assembly, named-mesh GLB, individual printable STLs, fit coupons, drawings, assembly guide, validation data, and archives.
- `research/parts.json`: quantities, observed prices, ordering links and constraints. `research/parts.md` provides interface details and the small-parts schedule.
- `research/wiring.md`: power rails, connector parts, GPIO assignment, input levels, stop wiring, and commissioning requirements.
- `research/autonomy.md`: calibrated depth, ROS 2 navigation, and model-decision architecture. This is a design, not implemented robot firmware.
- `research/arm.md` and `research/docking.md`: optional expansion studies. Arm mounts, dock, replacement battery cradle, and charging circuit are absent from Rev A CAD.
- `assets/`: original ImageGen concept and prompt record. Concept imagery is not dimensional evidence.

The frontend lives in `src/features/kiwi/`. `/hardware/` is the category landing page; `/hardware/kiwi/` is the project workbench. The normal site route-shell build publishes direct-loadable GitHub Pages paths.

## Regenerate

Read `cad/README.md` and use its pinned Python requirements for the CAD export. Heavy export and build jobs should run through `codex-home` on a home worker, then their exact outputs must be brought back and inspected.

After research edits, run `node hardware/kiwi/scripts/sync-content.mjs` from repository root. This synchronizes webpage component data, CSV and the downloadable technical notes. Run `node --experimental-strip-types --test tests/kiwi/*.test.ts` for wheel-kinematics checks. The ordinary site CI builds and checks route coverage.

## Scope and evidence

Computer geometry checks establish only the properties listed in `validation.json`. Exact purchased component revisions, print tolerances, screw lengths, motor retention, bumper actuation, electrical behavior, thermal performance, floor traction, camera blind zones, and autonomous navigation require physical verification. Start with the fit coupons and a supervised, manually controlled base on a flat, stair-free floor.

The baseline pack is already rechargeable through the removable balance-charge route. A self-charging dock requires a reviewed protected-pack/charger/power-path revision. The optional arm needs a reinforced chassis load path and a new power/stability assessment. Neither upgrade is represented as built or ready to bolt onto the current lid.

Costs are observed component listings plus explicit planning allowances. No checkout, order, or supplier communication has been performed.

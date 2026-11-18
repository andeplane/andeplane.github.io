# Broadside Lantern Grotto menu

The selected C2 home composition is implemented with live text and buttons. Play opens the existing sea chart, Your ship and Your cave use the existing travel handlers, and Settings retains coin sounds, privacy/support and model attribution. Saved chest/gold values still come from the existing progress adapter; no save format changed. Captain Calculus continues to use its independent home renderer.

## Art and motion

The clean portrait plate was edited from the user-selected C2 image using built-in image generation to remove baked text and the pointer. The wide plate is a derived extension of that clean scene. Optimized WebP files are `public/assets/menu/lantern-grotto.webp` and `lantern-grotto-wide.webp`. Source artwork, prompts and placement notes remain in the original project’s `output/imagegen/menu-proposals/production/` directory. No private ship model is part of this change.

The title and four actions are HTML. Eight intermittent glints are anchored to individual coins in artwork coordinates; their positions change with the portrait/wide plate. Lantern illumination gently fluctuates and the bounded water reflection moves slightly. Nonessential animation stops outside the main screen and is removed for reduced motion. Existing buttons retain keyboard focus and at least 44px targets. Short portrait frames compress the art above the controls to keep Play off the coins; wide frames use the wide plate rather than cropping the portrait scene.

## Validation

Independent runtime review covered 390×844, 320×568, 844×390 and 1440×900, including simulated safe areas, button hit tests, keyboard navigation, saved and empty counters, ship-load failure status and actual navigation. The reviewer recorded 21 seconds of motion, checked glints against coin faces in both plates, and verified that reduced motion suppresses the animations. Final verification passed: all 26 existing VoyageHud tests, `tsc --noEmit`, `vite build` and `git diff --check`. This project defines no formatter or lint script. The scoped final Impeccable detector returned no findings.

Screenshots and review evidence are outside the committed source. Physical iPhone behavior and touch feel were not tested for this menu change; no phone installation was performed.

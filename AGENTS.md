# Mandatory design review

For every UI change, carefully review the complete affected experience before delivery. A passing build, test suite, or one attractive menu screenshot is not a completed design review.

- Inventory all screens and interaction states touched by the change, including live gameplay, navigation, overlays, dialogs, loading, errors, rewards, and empty or large saved-data states. Review shared changes in both Broadside and Captain Calculus.
- Inspect the running UI at normal phone portrait, narrow 320px portrait, and short landscape sizes. Include real or simulated top, bottom, left, and right phone safe areas and check orientation changes.
- Check for overlapping text and controls, clipping, overflow, hidden interception layers, and buttons outside the viewport. Reserve layout space for Back, titles, status, and actions; do not stack unrelated absolute-positioned elements in the same space.
- Keep ordinary text at least 4.5:1 contrast, large text at least 3:1, and touch controls at least 44 by 44 CSS pixels. Check actual foreground/background combinations, including inherited styles on gold or parchment buttons and panels.
- Test navigation and interaction, not just appearance: correct Back destination, usable close action, outside-tap and Escape dismissal for dialogs, focus handling, scroll/pan gestures, and disabled/loading states that accurately explain readiness.
- Inspect first-person controls against the rendered camera: right means screen-right, up means look-up, and forward/strafe movement matches the current view. Check every scene coordinate system.
- Save representative screenshots and record the screen/state/viewport checks actually performed. Explicitly identify any unverified states; never label untested UI, touch feel, or physical-device behavior as verified.
- After integration, verify the final source and packaged build correspond to the reviewed UI. Installation success alone does not establish visual or gameplay correctness on the device.

Fix concrete design failures found in review before delivering the affected change. If a required review surface is unavailable, report that limitation rather than silently treating source inspection or unit tests as visual proof.

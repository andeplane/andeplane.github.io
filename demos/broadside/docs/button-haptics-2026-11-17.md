# Button haptics

Broadside and Captain Calculus install a shared button activation listener. Native apps use Capacitor Haptics 8.0.2 with `ImpactStyle.Light`; supported browsers use a 10 ms vibration. Safari browser practice has no vibration API. See the [Capacitor Haptics API](https://capacitorjs.com/docs/apis/haptics).

The handler captures button readiness before an action disables or replaces its button, then gives feedback during click bubbling. Suppressed map-drag clicks, disabled or inert controls, and programmatic clicks stay quiet. Feedback failures never interrupt the action. Layout, navigation, game rules and saved progress are unchanged.

Captain Reader remains in feature PR #123 and is excluded from this main-branch change. Its haptics integration is retained separately in commit d42527d on `codex/pirate-button-haptics`.

## Validation

- Four focused tests cover dynamic/nested buttons, duplicate installation, menu replacement, disabled and non-user activations, suppressed clicks, immediately disabling buttons, native failure handling, browser fallback and listener removal.
- Main-based validation runs TypeScript, the full game suite with coverage, and the production build on the cloud worker. No formatter or linter scripts are configured for this project; `git diff --check` checks patch whitespace.
- Native web bundles for Broadside and Captain Calculus are built and synced with HapticsPlugin registered. Swift package paths remain portable.
- Headless agent-browser checks menu activation and representative screens at 390×844, 320×568 and 844×390 with simulated phone safe areas. Screenshots are retained outside Git under `/Users/anderhaf/Documents/Codex/2026-11-17/pirate-button-haptics/`.

Physical-device haptic strength and native runtime feedback remain unverified. Browser feedback-call instrumentation verifies activation timing only. No phone installation is included. This scoped interaction check does not establish complete gameplay, accessibility or large-save visual acceptance.

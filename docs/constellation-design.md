# The light we leave

## Intent and art direction

A family story told with light: a nearly black midnight sky, fine wandering paths,
restrained pastel stars, warm ivory serif typography, and gold accents. The stars
and trails are SVG, keeping the core image crisp, editable, and exportable. No
external fonts or generated images are required. The reference is the sequence of
Instagram screenshots supplied by the user, credited to @creaconbruno. All copy,
layout, and implementation here are original.

Desktop pairs a quiet editorial column with a large sky. Phone portrait stacks
the narrative above the sky and retains ordinary page scrolling. The experience
has its own full-width route at `/experiments/constellation` and a project entry.

## Story and future song brief

The default silent story lasts 96 seconds. A user-selected audio file replaces
that duration; narrative and graphics follow its playback clock. No upload or
music service integration is involved. Audio must be selected again on a later
visit. Playback starts only after a user action and pauses when the tab hides.

| Chapter | Cue at 96 seconds | Narrative / visual direction |
| --- | --- | --- |
| Before us | 0:00 | One life begins inside an existing family; intimate, sparse opening. |
| A small world | 0:13 | Childhood paths grow; a gentle motif finds its shape. |
| Paths meet | 0:29 | A partner’s light enters; warmth and harmonic expansion. |
| A new light | 0:40 | A child’s light appears; a restrained emotional lift. |
| The changing sky | 1:02 | Some trails end and their stars remain; space, tenderness, no dramatic sting. |
| Always here | 1:26 | Trails dissolve; stars ease into one constellation; resolve and let the final chord breathe. |

For the later AI song: instrumental piano, soft felt texture, restrained strings,
slow and intimate, wonder rather than tragedy. A melody that can return with more
warmth at the final reveal. Avoid vocals competing with the on-screen writing.
Target approximately 96 seconds, but the app accommodates other lengths. The
user has not yet requested song creation or any interaction with a song service.

## Interaction and privacy

- Explicit play/pause, restart, speed, chapter navigation, and continuous seeking.
- Edit up to eight names and entry/ending ages, expressed in the narrator’s age.
  Endings are optional. Sample ages are illustrative, never predictions. Chapter
  prose is the sample narrative; edits personalize the sky, not generated prose.
- Save names and ages locally using a validated, versioned localStorage record.
  A blocked storage write still permits an in-memory experience.
- The native dialog provides focus containment and Escape dismissal; backdrop
  and close-button dismissal also work. Playback pauses while editing.
- Load a local audio file, mute it, or remove it. Playback follows the actual
  audio clock, including seeking and speed. No audio is sent to a server.
- Export the final constellation as a standalone SVG with a dark background.
- Respect reduced-motion preferences by removing decorative copy transitions;
  the main story animates only on explicit play and supports chapter stepping.

## Verification

See `constellation-review.md` for the checks actually performed and evidence
boundaries. Unit tests cover timeline boundaries, trail/head continuity, saved
data validation, and minimum/maximum constellation sizes.

# Constellation review — passing encounters and continuing lives

## Changes reviewed

Kindergarten friend now crosses the scene near You at age three, moving continuously
from left to right. This brief encounter has an existing trail and leaves offscreen;
it never settles beside You or becomes a memorial. Childhood friend retains the
separate, longer companionship. The passing name keeps one line and its own fixed
tier, fading before the edges instead of becoming pinned there. Existing cast
indices are preserved. Untouched older defaults upgrade; customized families remain.

Grade school and Middle school friends cross briefly; Coworker weaves near You
before leaving. Childhood friend keeps a recognizable green hue and stays close
longer before departing after the partner arrives. Son has a later outward bend
at your ages 68–77, with the older couple staying steady.

Death now has a separate completed trail and rising light. The life path peels
left, stops adding points, and remains in the past. The light lands with one circle
pulse and remains a readable, softly colored cross. Partner dies at 82, You at 85.
From 92.7–97.1 seconds the seven remembered lives connect in sequence; the view
then lowers from 98–114 seconds. Living people and future generations keep moving.

Existing friendships and romances approach from outside the frame, share the
present, and depart without becoming dead endpoints. You are the person leaving
and returning to steady parents. First love is across from Childhood friend;
College friend becomes close as the childhood friendship recedes. Parenthood
moves to 30/32; the brother's death at your age 38 has a distinct held focus.

Opening, love and parenthood captions bring the text budget to six cards / thirty
words. The exact personal dedication remains. The camera holds its position at
your life, tilts to 30 degrees above the time plane, and watches generations move
away. Acceleration begins at year 92. Generations form pairs and branch; they
continue after the score, with ancestry retained and bounded rendering.

## Evidence and limits

- 47 focused model tests cover relationship rank and direction, encounter entry
  and departure, no-falling-behind behavior, child timing, attention, text budget,
  the fixed camera, growing generations, audio recovery and labels.
- Full-timeline label checks run at 20 frames/second on four viewport sizes.
- 258 isolated headless browser states were inspected through actual DOM geometry:
  desktop, 390px phone, 320px phone, short landscape, and simulated safe areas.
  No visible-name overlaps, horizontal overflow, caption clipping or page errors
  were found in those states. This includes orientation/viewport changes and 43 states per size: passing encounters, the coworker weave, death/rise/landing,
  the son's independence, the closing constellation and the perspective future.
  The added checks also rule out label/caption overlap.
- Separate isolated headless audio tests confirm autoplay when allowed and an
  advancing, unmuted media element after a touch release or click when autoplay
  is blocked. Inspections use CDP with userGesture=false, so checking the state
  does not accidentally unlock audio and invalidate the test.
- New production SVG source renders were visually inspected for the passing
  encounters, losses, landing rings, constellation and perspective future in
  phone portrait, narrow portrait and short landscape. Earlier
  production source renders were also inspected at childhood, first love,
  college, parenthood, the brother's loss, and several future stages.
- Focused feature TypeScript checking passes. Full repository CI and the actual
  Pages deployment must pass before delivery; public bundle and MP3 are checked.

The user's screen-capture pause remains respected: no personal browser or desktop
capture was used. Headless DOM checks and source renders do not prove physical
phone/Safari behavior or actual speaker output. Fresh-visit audible autoplay can
still be blocked by browser policy; it cannot be forced by webpage code.

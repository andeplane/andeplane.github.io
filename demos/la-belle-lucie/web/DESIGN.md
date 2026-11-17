---
name: Ingrid’s Solitaire
description: Familiar playing cards and functional controls for the three-deal solitaire.
colors:
  green: "#164b3d"
  page: "#f2f3ef"
  text: "#152c23"
  card: "#fffef9"
  red: "#a12533"
  black: "#17251e"
  button: "#fff"
  button-border: "#c3cdc5"
  selected: "#f1c75b"
  target: "#fff2bd"
  hint: "#eee3b5"
  hint-border: "#b9a66a"
  hint-arrow: "#c9b568"
  successor: "#bcdcf3"
  successor-border: "#68a7d4"
  successor-outline: "#83bde5"
  evaluation-loss: "#b32c35"
  focus: "#d99b25"
  empty-foundation-border: "#97b9aa"
  empty-foundation-symbol: "#d8e7df"
typography:
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
  status:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
  card-corner:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "17px"
    fontWeight: 600
rounded:
  card: "6px"
  control: "7px"
  table: "12px"
spacing:
  compact: "8px"
  control-gap: "12px"
  page-mobile: "16px"
  table-top: "20px"
  page: "24px"
  pile-gap: "28px"
components:
  button:
    backgroundColor: "{colors.button}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.button}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  playing-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.black}"
    rounded: "{rounded.card}"
    aspectRatio: "5 / 7"
---

# Design System: Ingrid’s Solitaire

## Overview

The interface is the game: a familiar green card table, readable playing cards,
and plain controls. Preserve the shipped appearance and prioritize clear moves
and identifiable cards. This record describes the implementation; it does not
introduce an aesthetic concept.

**Key Characteristics:**
- Green table with cream card faces and red or black suit symbols.
- Arial controls and compact, wrapping toolbars.
- Every card remains identifiable and inspectable; only exposed cards can move.

## Colors

The green token supplies both the table and primary action. Page and button
surfaces stay light. Card ink uses red for hearts and diamonds and black for
spades and clubs. Gold outlines show selection and legal targets; target faces
also use the pale target fill. Keyboard focus has its own visible gold outline.
Hint highlights use the muted yellow hint fill and border on every legally
movable source card. The Hint button toggles this state; highlights update as
cards move or are restored with Back and reset on a new game.
Straight muted gold arrows run from each legal source to its target card or foundation.
The selected card's immediate same-suit successor uses a soft blue face, even
when covered. A clear blue outline reinforces that destination; blue takes priority over hint yellow on that successor.
Learning's Foundation targets toggle inverts the full face artwork of the next
required card in each unfinished suit. This remains distinct from yellow legal
move hints and blue successor outlines, and includes buried cards.
Share remains available in the header at every position. History opens a plain
move log with the current position marked, replay navigation and JSON download.

## Typography

Use Arial with Helvetica and sans-serif fallbacks throughout. The title uses the
title token, falling to (23px) on mobile. Status text uses tabular numerals and
falls to (13px) on mobile. Card corners show rank and suit, a central suit is
larger (35px), and the bottom rank is rotated. Visible suit references use
symbols; written suit names belong in accessibility labels. All UI is English.

## Layout

The centered page has a maximum width of (1380px). Header and toolbars wrap.
The green table contains status, four centered foundations, and the pile grid.
Piles use nine columns on wide screens, six up to (1100px), and three up to
(750px). Every card and foundation has an exact 5:7 width-to-height ratio.
Card width is responsive, capped at (104px), and pile overlap is 34% of card
width so both rank and suit remain visible on covered cards. Pile heights grow
with their contents. All 52 faces are self-hosted CC0 SVGs; provenance is in
`public/cards/PROVENANCE.md`.

At the mobile breakpoint, page padding uses the mobile token, table padding is
(14px), and the step controls fill a row. Up to (360px), page and table padding
become (10px).

## Elevation & Depth

Cards have a small static shadow; only the moving card uses a larger shadow and
an overlay above the table. Other sections use flat fills and borders. Preserve
overlap order so a covered card's corner remains visible.

## Shapes

Cards use the card radius, controls and foundations use the control radius, and
the table uses the table radius. Joined mode buttons have square inner corners
and rounded outer corners. Empty piles have a dashed rectangular outline.

## Components

Buttons have a minimum target height of (44px), a thin border, and a pale hover
fill. Primary buttons use green with white text and darken on hover. Disabled
controls have half opacity; cards and foundations remain fully visible when
disabled. Keyboard focus uses a (3px) outline offset by (3px). The Rules control
is an underlined text button.

The two-button mode selector shows the active mode with a pale green fill and
semibold text. Empty foundations have a transparent fill, dashed border, and
muted suit symbol without an ace label. Occupied foundations have a solid pale
face, suit symbol, and current rank. A legal empty foundation uses the same
target fill as other destinations. Playing cards retain
cream faces on hover; selected cards and valid destinations receive outlines.
Learning shows a fixed round target, the still-reachable total, and red losses
for moves that reduce that total. Undo restores the matching position and target.

Single-card moves take (650ms), with easing
`cubic-bezier(.25,.1,.25,1)`, a slight midflight lift and rotation, and an enlarged
shadow. Redeals use a (430ms) fade and scale. With reduced motion requested,
skip these animations and apply the resulting board immediately.

## Do's and Don'ts

- **Do** keep suit symbols visible and written suit names in accessibility labels.
- **Do** preserve portrait 5:7 cards and the nine/six/three responsive pile grid.
- **Do** keep covered cards identifiable and animate one card at a time.
- **Do** respect reduced-motion preferences.
- **Don't** add aesthetic concept prose, decorative themes, or a design selection flow.
- **Don't** obscure cards with interface decoration.

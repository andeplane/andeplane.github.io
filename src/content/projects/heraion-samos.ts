import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'heraion-samos',
  title: 'Heraion of Samos',
  description:
    'The largest temple the Greeks ever attempted, rebuilt parametrically from published dimensions — with every number labelled as evidence or guess.',
  tags: ['Three.js', 'Archaeology', 'Reconstruction', 'Parametric', 'WebGL'],
  liveUrl: '/demos/heraion-samos/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/heraion-samos',
  screenshot: '/projects/heraion-samos/preview.png',
  longDescription: `
Around 530 BC the tyrant Polykrates began a temple to Hera on Samos measuring
55 × 109 metres, with 155 columns twenty metres tall. Herodotus saw it and called it the
largest temple known to him. It was never finished, its cut stone was quarried away for
the city walls, and today one column stands.

This is that building, generated from its published dimensions.

## Parametric, not modelled

Nothing here is a mesh someone pushed vertices around in. Every dimension lives in one
file, tagged with where it came from, and the geometry is generated from those numbers at
load time. Change the column height and the building changes. That matters because the
sources are incomplete: when the measured publications turn up, you edit a parameter
rather than remodel.

The same discipline drives the honesty layer. Each number is marked **attested** (stated
in a source), **derived** (arithmetic from one), or **conjectural** (mine). The UI colours
every layer accordingly, so it is always visible which parts of the building are evidence
and which are a plausible guess. A reconstruction that cannot tell you that is decoration.

## Making 155 columns add up

The sources give the total — 155 columns, in four sizes and types — and describe the
arrangement: 24 along each flank in a double row, triple colonnades at the facades, eight
east and nine west. They do not give the plan.

Those constraints turn out to nearly determine it. The two peristasis rings and the facade
rows are fixed by the description, the porch figures are attested, which leaves the cella
colonnades as the only free variable — and two rows of nine is what closes the sum at
exactly 155. Satisfying, but the arithmetic also means any error in the ring counts gets
absorbed silently by the cella, so that is flagged as the least secure number in the file.

Two traps on the way. German Wikipedia's temple numbering is offset by one from the
excavators', so its figures for "Dipteros II" belong to the *earlier* building. And an
array index sign error put the nine-column rear hall at the entrance front, which is the
sort of thing you only catch by looking at the plan view.

## What the building actually looked like

The distinctive facts are the ones that survive in text. The shafts were **unfluted** —
unusual, and the earlier temple on the same spot *was* fluted. The bases carry horizontal
fluting on spira and torus, the Samian type. There was a carved, painted band at the head
of each shaft. Capitals are Ionic with volutes outside, ovolo-moulded inside.

And the architrave was **wooden**, which is not a detail: it is why the intercolumniations
can be seven metres wide, and why there was never a continuous stone frieze at this scale.

Ionic capitals are directional — the volute faces front their own colonnade and the bolster
runs back into it — so flank and facade columns are rotated differently. Getting that wrong
is one of the more conspicuous errors available in a Greek temple.

## The sanctuary, and the two states that matter

All 34 numbered monuments of the sanctuary are present as footprints: the Rhoikos temple
the great one replaced, the Hekatompedoi buried inside it, the Great Altar the whole
complex faces, the stoas, the basilica, the statue bases, the Sacred Way. Positions were
read off the official site plan by eye and are good to about ±5 m — which two independent
checks support, one of them an attested 42 m offset between the two temples that the
measurement reproduced to within three metres.

Turn every temple layer off except **Foundation** and **Surviving column** and you get what
a visitor sees today: a platform and one column. Turn them back on and you get the
overlay. That pair is the point, and it is why the geometry is built the way it is —
this is the groundwork for an AR experience on the site itself.

The roof is off by default. The building was never finished, and drawing a complete roof
would assert more than anyone knows.
  `.trim(),
}

export default project

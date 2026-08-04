# Heraion of Samos — source archive manifest

Archived 2026-07-31. Every claim below was checked against the live page or the
downloaded file itself, not against a search-result snippet. Where the research
brief and the primary source disagree, the primary source wins and the
discrepancy is called out.

Target of the AR project: the **Polykrates-era Great Temple (Dipteros II)**.

---

## 1. Archived files

| File | Bytes | SHA-256 (first 16) | Source |
|---|---|---|---|
| `publications/samos-21-1-walter-heraion-teil1.pdf` | 34,181,407 | `039889db9affec4f` | iDAI.publications, book 432, "Entire PDF" |
| `dai-plans/samos-21-1-plans.pdf` | 7,809,584 | `fcb258edf9239f28` | iDAI.publications, book 432, "Plans" |
| `publications/samos-29-roemische-tempel-peripteros-naiskos.pdf` | 20,407,559 | `5160b6fb3470b998` | iDAI.publications, book 433, "Entire PDF" |
| `dai-plans/samos-29-plans.pdf` | 3,026,865 | `afdd60d6b6a9d558` | iDAI.publications, book 433, "Plans" |
| `publications/odap-heraion-booklet-en.pdf` | 2,208,936 | `76869e2d649c4642` | ODAP official Heraion booklet (EN) |
| `publications/denker-3d-computer-graphics.pdf` | 344,845 | `a65b666ce17bed14` | DergiPark article file 105382 |
| `sources/dai-project-pages/dai-project-2668.txt` | 12,580 | `23a6dda5cdc5f7f7` | DAI project page, rendered text |
| `sources/dai-project-pages/dai-project-2662.txt` | 9,857 | `2aa40d46cadb1073` | DAI project page, rendered text |
| `models/sketchfab-c1483-metadata.json` | 4,413 | `84d50c63c2c4bde9` | Sketchfab public API v3 |

Source URLs:

```
https://publications.dainst.org/books/dai/catalog/book/432          Samos 21.1 (landing)
https://publications.dainst.org/books/dai/catalog/view/432/653/1654 Samos 21.1 Entire PDF
https://publications.dainst.org/books/dai/catalog/view/432/654/1655 Samos 21.1 Plans
https://publications.dainst.org/books/dai/catalog/book/433          Samos 29 (landing)
https://publications.dainst.org/books/dai/catalog/view/433/655/1656 Samos 29 Entire PDF
https://publications.dainst.org/books/dai/catalog/view/433/656/1657 Samos 29 Plans
https://www.odap.gr/wp-content/uploads/demo_products/163_HRAIO_SAMOY_ENG.pdf
https://dergipark.org.tr/en/download/article-file/105382
https://www.dainst.org/en/research/projects/noslug/2668             Prehistoric Settlement (Kouka)
https://www.dainst.org/en/research/projects/noslug/2662             Heraion von Samos (Henke)
https://sketchfab.com/3d-models/c1483-samos-heraion-d51a9a6ea9c54aaf8d35e333dae53a20
```

Note: `publications.dainst.org` sits behind an Anubis proof-of-work challenge and
`sketchfab.com` behind a bot challenge — plain HTTP clients get a 4 KB interstitial
or an empty 202. Both need a real browser session to re-fetch.

---

## 2. Corrections to the research brief

**2.1 — The Sketchfab model is a terrain tile, not a reconstruction.**
The brief hedged that it was "very likely useful for terrain/context". The public
API settles it. `C1483 Samos: Heraion` is **5,240 faces / 3,056 vertices**,
published 2020-04-04, and its own description states it was machine-generated:

> Generator: DEM Net Elevation API · Elevation: NASADEM · Data: OpenStreetMap ·
> Imagery: ThunderForest

It contains **no temple geometry and no archaeological content whatsoever** — it
is an automated DEM patch with a draped web-map raster. Consequences:

- It is not worth the CC BY-NC-SA encumbrance. You can generate equivalent or
  better terrain yourself from NASADEM or Copernicus DEM 30 m with no
  NonCommercial or ShareAlike obligation attached.
- The draped texture is ThunderForest imagery, a commercial tile product with its
  own terms — a second rights layer the CC licence does not clear.
- **Recommendation: do not build on this asset.** Source terrain directly.

This means the brief's headline finding — "one clearly public, downloadable 3D
model directly relevant to the Heraion" — does not survive contact with the
metadata. There is currently **no public 3D asset of the Heraion temple at all.**

**2.2 — The DAI/UCY 3D work is Early Bronze Age, not Polykrates.**
Verbatim from the DAI project 2668 page (items 17 and 18 of the research programme):

> 17. 3D digital reconstruction of the Early Bronze Age settlement North of the
>     Sacred Road (Angeliki Chalkia, MA University of Cyprus).
> 18. Simulation Model of the of the Early Bronze Age with use of Blender,
>     Autodesk 3ds Max and Unity (Markos Panagiotou, MA University of Cyprus).

Both outputs are scoped to the **Early Bronze Age settlement north of the Sacred
Road**. Neither is a model of the Great Temple. The brief called this "the single
most promising unpublished lead" for AR production; that is only true if your AR
experience covers the prehistoric settlement as well. For the Polykrates temple
specifically, this lead does not deliver the asset — though it is still worth
contacting, because the team has a working Blender→Unity heritage pipeline, site
survey control, and may know of temple-phase models held elsewhere.

**2.3 — Project routing was wrong.** The brief listed Henke as a contact route for
the 3D reconstruction work. The two projects are separate:

- **Project 2668** "The Prehistoric Settlement at Heraion of Samos (Sacred Road)"
  — directed by **Ourania Kouka** (University of Cyprus). This is the project that
  owns Chalkia's and Panagiotou's work. Henke is not its director.
- **Project 2662** "Heraion von Samos" — **Jan-Marc Henke** (DAI Athens) is the
  listed project lead. This is the sanctuary excavation, and therefore the right
  route for the temple.

Address the 3D-files question to Kouka and the temple/sanctuary question to Henke.

**2.4 — No email addresses appear on the DAI 2668 project page.** The brief
presented `ouraniak@ucy.ac.cy` as publicly listed there. It is not. The address is
*inferred* from the UCY directory profile slug `ouraniak`
(`ucy.ac.cy/directory/en/profile/ouraniak`) plus UCY's `username@ucy.ac.cy`
convention. Treat it as probable, not confirmed — `ucy.ac.cy` serves its staff
directory behind Cloudflare and blocked verification. Have a fallback ready
(ARU office, or the Department of History and Archaeology).

---

## 3. Verified contacts

| Person / office | Role | Contact | Verification |
|---|---|---|---|
| Dr. phil. Jan-Marc Henke | Curator of the Photo Archive; **Director of the DAI excavation project at the Heraion of Samos** | `Jan-Marc.Henke@dainst.de` · +49 151 68450016 · Fidiou 1, GR-10678 Athens | Confirmed verbatim on the DAI staff page |
| Prof. Ourania Kouka | **Director of DAI project 2668**; Laboratory Leader, Archaeological Research Unit, University of Cyprus | `ouraniak@ucy.ac.cy` — **inferred, unconfirmed** | Directorship confirmed on the DAI project page; email inferred from directory slug |
| Prof. Ahmet Denker | Author of the published Polykrates temple reconstruction | `ahmet.denker@bilgi.edu.tr` · +90 212 311 7128 | Confirmed on the Bilgi staff page **and** printed in the paper itself |
| Angeliki Chalkia, MA | 3D digital reconstruction (EBA settlement) | via Kouka | Credited verbatim on DAI project page |
| Markos Panagiotou, MA | Simulation model, Blender / 3ds Max / Unity (EBA) | via Kouka | Credited verbatim on DAI project page |

Contacts carried over from the brief and **not** independently verified here:
DAI Athens secretariat, the Ephorate of Antiquities of Samos–Ikaria, the UCY ARU
and department offices, and 3D Path. Confirm before sending anything to them.

---

## 4. Verified content in the archived files

**ODAP booklet — Great Temple (page text, verbatim):** the Polykrates temple
"was dipteral, and measured 55.16x108.63 m"; a further column row brought "the
total number [...] to 155"; "the original height of the columns was 20 m"; columns
were marble, the rest poros; column bases had fluted spirals and torus; columns
were unfluted; exterior capitals Ionic with volutes, interior capitals with an
ovolo moulding. The temple was never completed — work stopped after Polykrates'
death in 522 BC. This is a sound dimensional brief for a parametric build.

**Denker 2015 — full citation now available for the permission request:**
Ahmet Denker, "Digital Cultural Heritage: Applications of 3D Computer Graphics in
Reconstructing the Lost Reality of the Temples of Ionia", *Journal of Naval
Science and Engineering* 2015, Vol. 11, No. 3, pp. 26–42.
**Figure 4 (p. ~15 of the PDF): "Reconstruction of Heraion (Polykrates) Temple".**
The paper covers four great Ionic temples, so any model files he still holds
probably form a set — worth asking for the Heraion one specifically.

---

## 5. Rights position

- **DAI PDFs and plan sheets** — DAI terms restrict use to personal, scientific and
  private purposes; commercial use requires a licence from the rights holder or
  the DAI editorial office. Fine for building an internal reconstruction; not fine
  for shipping redrawings in a sponsored, ticketed or contracted visitor app
  without written permission.
- **Sketchfab C1483** — CC BY-NC-SA 4.0, requirements string verbatim from the API:
  "Author must be credited. No commercial use. Modified versions must have the same
  license." Moot given §2.1 — don't use it.
- **ODAP booklet** — rights not stated in the file. Ask before republishing its
  imagery or text.
- **Denker 2015** — journal copyright. The figure is a preview, not a licence.
- **New site capture** — Greek Ministry of Culture treats filming, drone work and
  electronic products at archaeological sites as permit-governed. Not optional.

---

## 5a. The Dipteros II gap, and what closes it

Checked after the first pass. **Neither archived plan set contains a measured plan
of the Polykrates temple**, so the "build from DAI plans" fallback does not work
as written in the brief:

- **Samos 21.1 Beilagen** (7 sheets) cover early altars, Hekatompedos I and II,
  the terrain north and south of the altars, and find-group distribution. The
  volume discusses Dipteros II ~177 times but as context; it is a book about the
  sanctuary's origins, and its plates stop before the great temple.
- **Samos 29 Beilagen** (6 sheets) are the Roman Peripteros and Naiskos at
  1:75 — Bauaufnahme (top view, sections) and reconstructed plans of two building
  phases. Useful for sanctuary registration, irrelevant to the temple.

Also note both plan PDFs are **A4 digital editions of large fold-out plates**. The
stated scales (e.g. "M. 1 : 75") refer to the original sheets, not the PDF. Rescale
from a drawn scale bar or a known dimension; do not trust page geometry.

The measured documentation of Dipteros II is in three places, none of them in hand:

| Source | Status | Why it matters |
|---|---|---|
| **Gruben, Gottfried (ed. Hermann J. Kienast), *Der Polykratische Tempel im Heraion von Samos*** — Samos series, reviewed *AJA* 120.2 (April 2016) | Print only; not in DAI's digitized Samos set | **The** modern monograph on this building. ~4/5 catalogue of architectural members, with reconstructions of capitals, column shafts, necking ornaments, anta capitals, plus folded plates (Beilagen 2 and 3). Review notes it argues for a **wooden rather than stone entablature** — a first-order decision for any 3D model. |
| **Reuther, Oscar, *Der Heratempel von Samos: Der Bau seit der Zeit des Polykrates*** (Berlin: Gebr. Mann, 1957) | Print only, antiquarian | 75 pp., 8 text figures, 24 plates, 49 drawings, **2 folded plans in a rear pocket**. The classic measured publication. Reviewed *AJA* 64.1, 89–95 (F. E. Winter). |
| **Kienast, Hermann J. & Furtwängler, Andreas E., "Zur Datierung der beiden Dipteroi im Heraion von Samos", *Athenische Mitteilungen*, pp. 59–94** | **Archived** → `publications/kienast-furtwaengler-datierung-dipteroi-AM.pdf`, 44 pp. | From `https://publications.dainst.org/journals/am/article/view/4923`. See §5b for what it does and does not contain. |

Two further free leads, not retrieved:

- **"Die Säulenbasen des zweiten Dipteros von Samos"** — `https://mediatum.ub.tum.de/doc/601000/601000.pdf`. Directly on Dipteros II column-base geometry. mediaTUM is behind an Anubis wall that hard-refused this machine; opens normally in an ordinary browser.
- **Kienast, "Der Südbau im Heraion von Samos – Das Odeion des Heiligtums?"**, *AM* 97–128 — `https://publications.dainst.org/journals/am/article/view/4667`. Sanctuary context.

Only **six** Samos volumes are digitized on iDAI.publications (books 63, 66, 432,
433, 2085, 2116). The temple volumes are not among them.

## 5b. What the Kienast & Furtwängler article actually gives us

Retrieved and read. Set expectations correctly: it is an **excavation and dating
report on the pronaos of Dipteros II**, not an architectural survey. Four
trenches were dug in the pronaos; the argument is about chronology, not geometry.
It contains **no column counts, no stylobate dimensions, and no elevations**.

What it does confirm, and what the model may rely on:

- the Ionic dipteroi of Samos, Ephesos and Didyma form a distinct group,
  characterised by their **"doppelter Säulenkranz"** — the double ring of columns
- Dipteros II's pronaos had an **anta wall** (`Antenwand`) with its own
  foundation, so the cella walls ran east to terminate in antae flanking the porch
- there were distinct **pronaos column foundations** (`Pronaossäulenfundament`),
  separate from the **inner peristasis foundation** (`Innenperistasenfundament`)
- Dipteros I's **cult image base** (`Kultbildbasis`) lies beneath, overlaid by
  Dipteros II's anta foundation
- Fig. 1 reproduces a plan of the pronaos area after Th. Wiegand, drawn by
  A. v. Gerkan — the closest thing to a measured plan of this building in the
  archive, though it covers the pronaos only

Implication for the model: the porch is modelled with free-standing columns and no
antae. Adding anta walls projecting east from the cella is now an evidenced
correction rather than a guess, and is the highest-value next change to the model.

The two monographs in §5a remain the only route to the full column geometry.

## 5c. Coordinates derived from the ODAP site plan

The model places all 34 numbered monuments of the sanctuary. Those
positions were **read by eye off the numbered site plan on p. 5 of the ODAP
booklet**, rendered at 400 dpi and scaled against the Great Temple's known
footprint. `../src/monuments.js` documents the method and its error bars
(±5 m).

Rights note, since this matters before anything ships: the measurements
themselves are facts about where buildings stand, and are not the booklet's to
own. But the plan *drawing* is ODAP's, and a wholesale digital retracing of it
could reasonably be argued to be derivative. What is in the repository is a
coarse list of centre-points and approximate extents — nowhere near a
reproduction of the plan's content — and **the plan image itself is not
redistributed**. If the sanctuary layer ever appears in a public or commercial
release, raise it with ODAP together with the imagery question already flagged
in §5. It is a cheap thing to ask about now and an expensive one to be told
about later.

## 6. Where this leaves the project

The archive gives you a strong **contextual** base — full excavation volumes for
the sanctuary's early and Roman phases, measured plan sheets for those phases, and
an authoritative dimensional summary of the Great Temple. It gives you **no 3D
asset at all**, and, per §5a, **no measured plan of the Great Temple either**.

What you can build today is a massing model: footprint, column grid, column
height. The ODAP figures fix 55.16 × 108.63 m, 155 columns and 20 m height, which
is enough for a silhouette that reads correctly at visitor distance and enough to
settle the AR problems that do not depend on architectural detail — anchoring,
occlusion, scale perception, viewing positions. It is not enough for capitals,
bases, entablature, intercolumniation, or the unfinished portions.

Closing that gap is cheap before it is expensive: the AM article in §5a is free
and unread, and the two monographs are ordinary library requests. Do that before
commissioning anything or writing to anyone about detail-level geometry.

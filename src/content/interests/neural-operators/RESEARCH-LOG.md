# Research provenance and limitations

Research snapshot: 10 September 2026. Scope: a broad orientation for later master's-thesis scoping, seeded by the four user-supplied PDFs. This is not a systematic review and does not establish novelty of a proposed thesis.

## Search and selection

Searches followed the seed papers backward to operator approximation, sparse recovery, empirical interpolation and cubature; forward to sampling theory, geometry-aware operators and scientific foundation models; and sideways to industrial sensing, inverse design, robotics and world models. Primary arXiv records, journal/proceedings records, public manuscripts and institutional pages were used. Recent 2026 preprints were included as frontier items, with no implied peer-review status.

The resulting catalog contains 51 records and 49 PDFs. Chen and Chen (1995) and DEIM are metadata-only entries: a usable public PDF was not obtained. Their source links are retained. The four supplied PDFs were preserved rather than silently replaced with different versions. Downloaded files were checked as PDFs, read with Poppler and hashed; original publisher layout was not edited.

## Review depth

Each reading note and catalog record specifies review depth. Most additions were screened through their abstract and primary bibliographic record. Selected key papers received targeted full-text reading of the methods, relevant results or limitations; the reading location is recorded. This is not a claim to have read every paper in full. None of the numerical experiments, benchmark results or speedups was independently reproduced.

`metadata/<id>.json` stores source URLs, retrieval date, local file, version information where available, PDF page count and SHA-256. `metadata/annotations.json` stores the editorial summaries, relevance/limits, priorities and topic classifications. `metadata/catalog.json` combines them; the per-paper Markdown notes are generated from it.

## Dates and versions

The collection uses first preprint/publication year for chronological browsing and records journal publication separately where verified. The high-level app timeline sometimes groups a multi-year development; those cards explicitly state their date range and source dates.

- The supplied neural-operator framework PDF has a stale journal-year header. The authoritative record is JMLR 24(89), 2023; first arXiv posting was 2021.
- The principled-architectures seed appeared as arXiv:2506.10973 on 12 June 2025, before its 3 July 2026 Nature Machine Intelligence publication. Its journal PDF remains the local copy. A 2025/early-2026 paper can therefore legitimately cite this work.
- The operator-sampling manuscript first appeared in 2024; its September 2026 revision has a different title from older search snippets. Interpretations use the collected current manuscript.
- A citation may name a journal version of a collected preprint. Explicit title variants are recorded in the extraction script, including DeepONet and Dreamer. This treats them as versions of one work, not separate nodes.

## Graph evidence

The graph has four node types: papers, authors, fine topics and broad fields. Broad fields provide the readable overview; fine topics and authors remain accessible in the local graph. Author names are conservatively normalized through an explicit alias table. Remaining name ambiguity is possible. Current affiliation is not inferred from old paper bylines.

- `authored`: primary bibliographic metadata / byline.
- `classified_in` and `bridges_field`: editorial method/application classification. Multiple field memberships do not by themselves prove methodological novelty or equal depth in every field.
- `cites`: a bibliography match, with source and location. Seven seed-paper references were recorded manually by reference number; additional links use exact normalized titles (including documented variants) within detected reference sections of downloaded PDFs. The generic title *World Models* additionally requires its distinctive authors in the nearby context. Match snippets and PDF page numbers are retained in `metadata/citations.json` for audit.
- Other paper-to-paper relations: explicitly labeled analyst reading connections or hypotheses. These do not assert a citation or historical influence.

Citation extraction is conservative and incomplete: PDF columns, hyphenation, unusual headers, changed titles and references split across pages can hide matches. The automatic matcher is not a citation-index service, and its matches have not all received manual reference-by-reference review. `citedBy` is the reverse of recorded `cites` edges. Counts are **within this collection**, not global citation impact; zero recorded matches does not establish zero citations. Node positions are a deterministic visual arrangement, not a learned semantic metric.

## Reproducibility and access

Scripts under `scripts/` build the catalog, notes, BibTeX, graph exports and offline HTML. The embedded graph needs no external service. Local PDFs can be opened through the viewer. Source links remain available for metadata-only entries and for checking newer versions. Metadata and graph exports are portable; downloading originals does not change their individual licenses.

The research overview, routes and bridge suggestions are synthesis judgments. Before choosing a thesis, perform a narrower novelty search around the exact model, data, sampling freedom, baseline methods and computational objective, then run a small feasibility experiment.

## Wavelet coverage follow-up (10 September 2026)

Added Tripura & Chakraborty, arXiv:2205.02191, and Gupta, Xiao & Bogdan, arXiv:2109.13459. Primary abstracts and bylines were checked; PDFs were saved locally. Their stated PDE/multiscale contributions support method and application classifications. The relationship between these two methods is an editorial reading connection, not a verified bibliography citation. Neither abstract establishes embedded rotating-equipment fault-detection latency.

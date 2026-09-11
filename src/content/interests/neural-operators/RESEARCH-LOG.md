# Research provenance and limitations

Research snapshot: 10 September 2026. Scope: a broad orientation for later master's-thesis scoping, initially seeded by four papers on approximation and operator learning. This is not a systematic review and does not establish novelty of a proposed thesis.

## Search and selection

Searches followed the seed papers backward to operator approximation, sparse recovery, empirical interpolation and cubature; forward to sampling theory, geometry-aware operators and scientific foundation models; and sideways to industrial sensing, inverse design, robotics and world models. Primary arXiv records, journal/proceedings records, public manuscripts and institutional pages were used. Recent 2026 preprints were included as frontier items, with no implied peer-review status.

The site now contains 56 reading notes, including additions through 11 September 2026. Public source links accompany them. The original research preparation included downloaded PDFs, but those files are not hosted with this site.

## Review depth

Each reading note and catalog record specifies review depth. Most additions were screened through their abstract and primary bibliographic record. Selected key papers received targeted full-text reading of the methods, relevant results or limitations; the reading location is recorded. This is not a claim to have read every paper in full. None of the numerical experiments, benchmark results or speedups was independently reproduced.

Review levels and source locations are preserved in the notes and graph. Preparation metadata and scripts from the original research workspace are not part of this website; they should not be treated as downloadable site resources.

## Dates and versions

The collection uses first preprint/publication year for chronological browsing and records journal publication separately where verified. The high-level app timeline sometimes groups a multi-year development; those cards explicitly state their date range and source dates.

- The supplied neural-operator framework PDF has a stale journal-year header. The authoritative record is JMLR 24(89), 2023; first arXiv posting was 2021.
- The principled-architectures seed appeared as arXiv:2506.10973 on 12 June 2025, before its 3 July 2026 Nature Machine Intelligence publication. Its journal version was the collected copy. A 2025/early-2026 paper can therefore legitimately cite this work.
- The operator-sampling manuscript first appeared in 2024; its September 2026 revision has a different title from older search snippets. Interpretations use the collected current manuscript.
- A citation may name a journal version of a collected preprint. Explicit title variants are recorded during source preparation, including DeepONet and Dreamer. This treats them as versions of one work, not separate nodes.

## Graph evidence

The graph has four node types: papers, authors, fine topics and broad fields. Broad fields provide the readable overview; fine topics and authors remain accessible in the local graph. Author names are conservatively normalized through an explicit alias table. Remaining name ambiguity is possible. Current affiliation is not inferred from old paper bylines.

- `authored`: primary bibliographic metadata / byline.
- `classified_in` and `bridges_field`: editorial method/application classification. Multiple field memberships do not by themselves prove methodological novelty or equal depth in every field.
- `cites`: a bibliography match, with source and location. Seven seed-paper references were recorded manually by reference number; additional links use exact normalized titles (including documented variants) within detected reference sections of downloaded PDFs. The generic title *World Models* additionally requires its distinctive authors in the nearby context. The graph exports retain evidence URLs and locations for checking individual links.
- Other paper-to-paper relations: explicitly labeled analyst reading connections or hypotheses. These do not assert a citation or historical influence.

Citation extraction is conservative and incomplete: PDF columns, hyphenation, unusual headers, changed titles and references split across pages can hide matches. The automatic matcher is not a citation-index service, and its matches have not all received manual reference-by-reference review. `citedBy` is the reverse of recorded `cites` edges. Counts are **within this collection**, not global citation impact; zero recorded matches does not establish zero citations. Node positions are a deterministic visual arrangement, not a learned semantic metric.

## Reproducibility and access

The site provides [JSON](graph/knowledge-graph.json), [GraphML](graph/knowledge-graph.graphml), [nodes CSV](graph/nodes.csv), and [edges CSV](graph/edges.csv) exports. These contain the displayed graph and its recorded evidence; they do not include the original PDF collection or extraction scripts. Use public primary-source links to access papers and check newer versions.

The research overview, routes and bridge suggestions are synthesis judgments. Before choosing a thesis, perform a narrower novelty search around the exact model, data, sampling freedom, baseline methods and computational objective, then run a small feasibility experiment.

## Wavelet coverage follow-up (10 September 2026)

Added Tripura & Chakraborty, arXiv:2205.02191, and Gupta, Xiao & Bogdan, arXiv:2109.13459. Primary abstracts and bylines were checked; Public source links are available in their notes. Their stated PDE/multiscale contributions support method and application classifications. The relationship between these two methods is an editorial reading connection, not a verified bibliography citation. Neither abstract establishes embedded rotating-equipment fault-detection latency.

## Website audit (11 September 2026)

Public PDF links remain active; obsolete private-file links were removed. The soft-robotics author is Carina Veil. The V-JEPA 2 metadata splits Mojtaba Komeili into two entries; the [paper’s full-text byline](https://arxiv.org/html/2506.09985v1) identifies one author, corrected consistently in all graph exports. These targeted checks do not upgrade the recorded review depth of other papers.

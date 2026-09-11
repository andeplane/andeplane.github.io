import { useState } from "react";
import { Link } from "react-router-dom";
import { byId } from "./model";
import { researchEras, researchMilestones, researchTracks, researchPapers } from "./data/timeline";
export default function Timeline() {
  const [track, setTrack] = useState("all");
  return (
    <div>
      <div className="no-filters" role="group" aria-label="Timeline filter">
        {[{ id: "all", label: "All milestones" }, ...researchTracks].map((t) => (
          <button key={t.id} aria-pressed={track === t.id} onClick={() => setTrack(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="no-muted">
        Selected milestones · Dates distinguish first preprints from later publication.
      </p>
      {researchEras.map((era) => {
        const items = researchMilestones.filter(
          (m) => m.era === era.id && (track === "all" || m.track === track),
        );
        return items.length ? (
          <section className="no-era" key={era.id}>
            <div>
              <span className="no-eyebrow">{era.years}</span>
              <h2>{era.title}</h2>
              <p>{era.description}</p>
            </div>
            <ol>
              {items.map((m) => (
                <li key={m.id}>
                  <time>{m.date}</time>
                  <div>
                    <span className="no-eyebrow">{m.field}</span>
                    <h3>{m.title}</h3>
                    <p>{m.change}</p>
                    {m.frontier && <span className="no-badge">Recent preprint</span>}
                    <details>
                      <summary>Papers & context</summary>
                      <p>{m.context}</p>
                      <p className="no-muted">{m.dateNote}</p>
                      {m.papers.map((id) => (
                        <div key={id}><a
                          className="no-paper-link"
                          key={id}
                          href={researchPapers[id].source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {researchPapers[id].title} ↗
                        </a>{byId.has(id) && <Link className="no-timeline-graph-link" to={`/interests/neural-operators/graph?node=${id}`}>Explore connections →</Link>}</div>
                      ))}
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null;
      })}
    </div>
  );
}

import { Link, NavLink, useParams, useSearchParams } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import Graph from "./Graph";
import Reading from "./Reading";
import Timeline from "./Timeline";
import { concepts } from "./concepts";
import { areas, papers, citations } from "./model";
import "./research.css";
const Labs = lazy(() => import("./Labs"));
const base = "/interests/neural-operators";
const tabs = [
  ["labs", "Learning labs"],
  ["graph", "Literature graph"],
  ["concepts", "Concepts"],
  ["timeline", "Timeline"],
  ["reading", "Reading"],
] as const;
function Concepts() {
  const [search, setSearch] = useSearchParams();
  const selected = concepts.find((c) => c.id === search.get("topic")) ?? concepts[0];
  return (
    <div className="no-reading-layout">
      <nav className="no-side-nav" aria-label="Concept chapters">
        <p className="no-eyebrow">The fundamentals</p>
        {concepts.map((c, i) => (
          <button
            key={c.id}
            aria-current={c.id === selected.id ? "page" : undefined}
            onClick={() => setSearch({ topic: c.id }, { preventScrollReset: true })}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {c.label}
          </button>
        ))}
      </nav>
      <article className="no-article" key={selected.id}>
        {selected.content}
        <div className="no-chapter-pager">
          {concepts.indexOf(selected) > 0 && (
            <button
              onClick={() => setSearch({ topic: concepts[concepts.indexOf(selected) - 1].id })}
            >
              ← Previous concept
            </button>
          )}
          {concepts.indexOf(selected) < concepts.length - 1 && (
            <button
              onClick={() => setSearch({ topic: concepts[concepts.indexOf(selected) + 1].id })}
            >
              Next concept →
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
export default function NeuralOperators() {
  const { tab = "graph" } = useParams();
  const active = tabs.some((t) => t[0] === tab) ? tab : "graph";
  const [exportsOpen, setExportsOpen] = useState(false);
  useEffect(() => {
    document.title = `${tabs.find((t) => t[0] === active)?.[1]} · Neural operators · andeplane`;
    return () => {
      document.title = "andeplane";
    };
  }, [active]);
  return (
    <div className="no-root">
      <div className="no-breadcrumb">
        <Link to="/interests">Interests</Link>
        <span>/</span>
        <span>Neural operators</span>
      </div>
      <div className="no-heading">
        <div>
          <h1 className="no-page-title">Neural operators</h1>
          <p className="no-lead">
            Learning maps between functions. Exploring where the ideas connect.
          </p>
        </div>
        <span className="no-snapshot">
          Research notes
          <br />
          <b>September 2026</b>
        </span>
      </div>
      <div className="no-tabbar">
        <nav aria-label="Neural operators navigation">
          {tabs.map(([id, label]) => (
            <NavLink
              key={id}
              to={`${base}/${id}`}
              className={() => (active === id ? "active" : "")}
              aria-current={active === id ? "page" : undefined}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="no-export">
          <button aria-expanded={exportsOpen} onClick={() => setExportsOpen(!exportsOpen)}>
            Export ↓
          </button>
          {exportsOpen && (
            <div className="no-export-menu">
              {["knowledge-graph.json", "knowledge-graph.graphml", "nodes.csv", "edges.csv"].map(
                (f) => (
                  <a
                    key={f}
                    href={`/interests/neural-operators/${f}`}
                    download
                    onClick={() => setExportsOpen(false)}
                  >
                    {f}
                  </a>
                ),
              )}
            </div>
          )}
        </div>
      </div>
      <div className="no-tab-content">
        {active === "labs" ? (
          <Suspense fallback={<p>Loading interactive labs…</p>}>
            <Labs />
          </Suspense>
        ) : active === "concepts" ? (
          <Concepts />
        ) : active === "timeline" ? (
          <Timeline />
        ) : active === "reading" ? (
          <Reading />
        ) : (
          <>
            <div className="no-stats">
              <span>
                <b>{papers.length}</b> papers
              </span>
              <span>
                <b>{areas.length}</b> fields
              </span>
              <span>
                <b>{citations.length}</b> citation links
              </span>
              <span className="no-muted">Within this collection</span>
            </div>
            <Graph />
          </>
        )}
      </div>
    </div>
  );
}

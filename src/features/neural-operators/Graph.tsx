import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  nodes,
  papers,
  areas,
  memberships,
  citations,
  byId,
  adjacent,
  peer,
  areaColor,
  type ResearchNode,
} from "./model";
const positions = (() => {
  const p = new Map<string, { x: number; y: number }>();
  areas.forEach((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / areas.length;
    p.set(n.id, { x: 490 + 380 * Math.cos(a), y: 350 + 265 * Math.sin(a) });
  });
  papers.forEach((n, i) => {
    p.set(n.id, { x: 490 + 90 * Math.cos(i * 2.399), y: 350 + 90 * Math.sin(i * 2.399) });
  });
  for (let step = 0; step < 240; step++) {
    for (const n of papers) {
      const a = p.get(n.id)!;
      const fields = memberships.filter((e) => e.source === n.id).map((e) => p.get(e.target)!);
      let dx = ((fields.reduce((s, f) => s + f.x, 0) / (fields.length || 1) || 490) - a.x) * 0.018,
        dy = ((fields.reduce((s, f) => s + f.y, 0) / (fields.length || 1) || 350) - a.y) * 0.018;
      for (const m of [...papers, ...areas]) {
        if (m.id === n.id) continue;
        const b = p.get(m.id)!,
          x = a.x - b.x,
          y = a.y - b.y,
          d = Math.max(1, Math.hypot(x, y)),
          min = m.type === "area" ? 86 : 36;
        if (d < min) {
          dx += (x / d) * (min - d) * 0.16;
          dy += (y / d) * (min - d) * 0.16;
        }
      }
      a.x = Math.max(45, Math.min(935, a.x + dx));
      a.y = Math.max(45, Math.min(655, a.y + dy));
    }
  }
  return p;
})();
function lines(label: string) {
  const words = label.split(" "),
    out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).length > 19 && line) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  out.push(line);
  return out;
}
export default function Graph() {
  const [selected, setSelected] = useState("fno-2020"),
    [view, setView] = useState<"fields" | "local">("fields"),
    [query, setQuery] = useState(""),
    [showCites, setShowCites] = useState(true),
    [zoom, setZoom] = useState(1),
    [wide, setWide] = useState(false),
    [history, setHistory] = useState<string[]>([]);
  const node = byId.get(selected)!;
  const choose = (id: string) => {
    setHistory((h) => [...h, selected]);
    setSelected(id);
    if (!["paper", "area"].includes(byId.get(id)!.type)) setView("local");
  };
  const results = useMemo(
    () =>
      query.trim()
        ? nodes
            .filter((n) =>
              [n.title, ...(n.authors ?? [])].join(" ").toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, 30)
        : [],
    [query],
  );
  const connected = adjacent(selected);
  const related = new Set([selected, ...connected.map((e) => peer(e, selected).id)]);
  const localNodes = [
    node,
    ...[...new Map(connected.map((e) => [peer(e, selected).id, peer(e, selected)])).values()].slice(
      0,
      20,
    ),
  ];
  const localPositions = new Map(
    localNodes.map((n, i) => [
      n.id,
      i === 0 ? { x: 490, y: 350 } : { x: i % 2 ? 180 : 800, y: 55 + Math.floor((i - 1) / 2) * 64 },
    ]),
  );
  const coords = view === "fields" ? positions : localPositions;
  const visible = view === "fields" ? [...papers, ...areas] : localNodes;
  const renderedEdges =
    view === "fields"
      ? [...memberships, ...(showCites ? citations : [])]
      : connected.filter((e) => coords.has(e.source) && coords.has(e.target));
  const height =
    view === "fields" ? 700 : Math.max(700, Math.ceil((localNodes.length - 1) / 2) * 64 + 50);
  function drawNode(n: ResearchNode) {
    const p = coords.get(n.id)!;
    const field = n.type === "area",
      active = n.id === selected;
    const color = field ? areaColor(n.id) : n.type === "author" ? "#dfb57b" : "#a2b6ee";
    const labeled = view === "local" || field || active;
    return (
      <g
        key={n.id}
        role="button"
        tabIndex={0}
        aria-label={`${n.label}, ${n.type}`}
        onClick={() => choose(n.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            choose(n.id);
          }
        }}
        className="no-graph-node"
      >
        <title>{n.title}</title>
        {view === "local" ? (
          <rect
            x={p.x - 125}
            y={p.y - 25}
            width={250}
            height={54}
            rx={8}
            fill={active ? "#28344b" : "#161c27"}
            stroke={color}
          />
        ) : (
          <circle
            cx={p.x}
            cy={p.y}
            r={field ? 43 : active ? 11 : 7}
            fill={field ? "#1b222b" : active ? "#c2d1ff" : "#343f57"}
            stroke={color}
            strokeWidth={active ? 2.5 : 1}
            opacity={related.has(n.id) || field ? 1 : 0.65}
          />
        )}{" "}
        {labeled && (
          <text
            x={p.x}
            y={p.y + (view === "fields" && !field ? 26 : -((lines(n.label).length - 1) * 7))}
            textAnchor="middle"
            fill={color}
            fontSize={field ? 12 : 11}
            fontWeight={active ? 700 : 500}
          >
            {lines(n.label)
              .slice(0, 3)
              .map((l, i) => (
                <tspan key={i} x={p.x} dy={i ? 14 : 0}>
                  {l}
                </tspan>
              ))}
          </text>
        )}
      </g>
    );
  }
  return (
    <>
      <div className="no-graph-toolbar">
        <div className="no-segment">
          <button
            className={view === "fields" ? "active" : ""}
            onClick={() => {
              setView("fields");
              setZoom(1);
            }}
          >
            Fields
          </button>
          <button
            className={view === "local" ? "active" : ""}
            onClick={() => {
              setView("local");
              setZoom(1);
            }}
          >
            Connections
          </button>
        </div>
        <div className="no-search">
          <input
            aria-label="Search papers, fields and authors"
            placeholder="Search papers, fields, authors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <div className="no-search-results">
              {results.length ? (
                results.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      choose(n.id);
                      setQuery("");
                    }}
                  >
                    {n.label}
                    <small>
                      {n.type} {n.year}
                    </small>
                  </button>
                ))
              ) : (
                <p>No matches</p>
              )}
            </div>
          )}
        </div>
        <label className="no-check">
          <input
            type="checkbox"
            checked={showCites}
            onChange={(e) => setShowCites(e.target.checked)}
          />
          Citations
        </label>
        <button onClick={() => setWide(!wide)} aria-pressed={wide}>
          {wide ? "Show details" : "Expand"}
        </button>
      </div>
      <div className={`no-graph-layout ${wide ? "wide" : ""}`}>
        <div className="no-map">
          <div className="no-map-caption">
            <span>
              {view === "fields"
                ? "Large nodes: fields · Small nodes: papers"
                : "Selected entity and up to 20 neighbors"}
            </span>
            <div>
              <button
                disabled={!history.length}
                onClick={() => {
                  setSelected(history[history.length - 1]);
                  setHistory((h) => h.slice(0, -1));
                }}
              >
                ← Back
              </button>
              <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
                −
              </button>
              <button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}>
                +
              </button>
            </div>
          </div>
          <div className="no-map-scroll">
            <svg
              style={{ width: `${zoom * 100}%`, minWidth: 600 }}
              viewBox={`0 0 980 ${height}`}
              aria-label="Research knowledge graph"
            >
              <defs>
                <marker
                  id="no-arrow"
                  viewBox="0 0 10 10"
                  refX={13}
                  refY={5}
                  markerWidth={5}
                  markerHeight={5}
                  orient="auto"
                >
                  <path d="M0 0 L10 5 L0 10z" fill="#a0aeca" />
                </marker>
              </defs>
              {renderedEdges.map((e) => {
                const a = coords.get(e.source),
                  b = coords.get(e.target);
                if (!a || !b) return null;
                const active = e.source === selected || e.target === selected;
                return (
                  <line
                    key={e.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={e.relation === "bridges_field" ? areaColor(e.target) : "#a0aeca"}
                    strokeWidth={active ? 1.8 : 0.8}
                    opacity={active ? 0.85 : 0.1}
                    strokeDasharray={e.epistemic_status === "analyst_inference" ? "5 5" : undefined}
                    markerEnd={e.relation === "cites" ? "url(#no-arrow)" : undefined}
                  >
                    <title>{`${e.relation}: ${e.evidence}`}</title>
                  </line>
                );
              })}
              {visible.map(drawNode)}
            </svg>
          </div>
          <div className="no-map-bottom">
            Colored links: field membership. Arrows: citing → cited. Dashed: suggested connection.
            <span>Positions and sizes do not rank citation impact.</span>
          </div>
        </div>
        {!wide && (
          <aside className="no-detail" aria-label="Selected research item">
            <span className="no-eyebrow">
              {node.type} {node.year && ` / ${node.year}`}
            </span>
            <h2>{node.label}</h2>
            {node.type === "paper" ? (
              <>
                <p className="no-detail-title">{node.title}</p>
                <p className="no-muted">{node.authors?.join(" · ")}</p>
                <div className="no-detail-actions">
                  <a href={node.url} target="_blank" rel="noreferrer">
                    Primary paper ↗
                  </a>
                  <Link to={`/interests/neural-operators/reading?doc=notes/${node.id}.md`}>Reading note →</Link>
                </div>
                <p>{node.summary}</p>
                <details>
                  <summary>Scope & limitations</summary>
                  <p>{node.limits}</p>
                  <p>{node.publication_status}</p>
                  <p>Review: {node.review_level?.replace(/_/g, " ")}</p>
                </details>
                <div className="no-tags">
                  {memberships
                    .filter((e) => e.source === selected)
                    .map((e) => (
                      <button key={e.id} onClick={() => choose(e.target)}>
                        {byId.get(e.target)!.label}
                      </button>
                    ))}
                </div>
                {(["out", "in"] as const).map((direction) => {
                  const list = citations.filter(
                    (e) => (direction === "out" ? e.source : e.target) === selected,
                  );
                  return (
                    <section className="no-citations" key={direction}>
                      <h3>
                        {direction === "out" ? "Cites" : "Cited by"} <span>{list.length}</span>
                      </h3>
                      <small>Within this collection</small>
                      {list.length ? (
                        list.map((e) => (
                          <details key={e.id}>
                            <summary>
                              {byId.get(direction === "out" ? e.target : e.source)!.label}
                            </summary>
                            <button
                              onClick={() => choose(direction === "out" ? e.target : e.source)}
                            >
                              Explore paper →
                            </button>
                            <p>{e.evidence_locator}</p>
                            <a href={e.evidence_url} target="_blank" rel="noreferrer">
                              Citation source ↗
                            </a>
                          </details>
                        ))
                      ) : (
                        <p>No citation links recorded.</p>
                      )}
                    </section>
                  );
                })}
              </>
            ) : (
              <p>
                {node.type === "author"
                  ? "Authorship from paper metadata."
                  : "Curated field membership; select a paper to inspect its contribution."}
              </p>
            )}
            <details open={node.type !== "paper"}>
              <summary>All connections ({connected.length})</summary>
              {connected.map((e) => (
                <div className="no-connection" key={e.id}>
                  <button onClick={() => choose(peer(e, selected).id)}>
                    {peer(e, selected).label}
                  </button>
                  <small>
                    {e.relation.replace(/_/g, " ")} · {e.epistemic_status.replace(/_/g, " ")}
                  </small>
                  <p>{e.evidence}</p>
                </div>
              ))}
            </details>
          </aside>
        )}
      </div>
    </>
  );
}

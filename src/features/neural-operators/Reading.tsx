import { useSearchParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { papers } from "./model";
const files = import.meta.glob("../../content/interests/neural-operators/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const documents = [
  ["OVERVIEW.md", "Research overview"],
  ["READING-ROUTES.md", "Reading routes"],
  ["BRIDGES.md", "Papers joining fields"],
  ["PEOPLE.md", "People & labs"],
  ["CATALOG.md", "Paper catalog"],
  ["RESEARCH-LOG.md", "Sources & methods"],
];
export default function Reading() {
  const [params, setParams] = useSearchParams();
  const doc = params.get("doc") ?? "OVERVIEW.md";
  const found = Object.entries(files).find(([key]) => key.endsWith("/" + doc));
  const content = found?.[1] ?? "# Reading note unavailable\nChoose a document from the menu.";
  function target(href: string) {
    if (href.startsWith("http")) return href;
    if (href.endsWith(".pdf")) {
      const id = href.replace("../", "").replace(".pdf", "");
      return papers.find((p) => p.id === id)?.url ?? "https://arxiv.org";
    }
    if (href.includes("graph/index")) return "#/interests/neural-operators/graph";
    if (href.includes("concepts.html")) return "#/interests/neural-operators/concepts";
    if (href.endsWith(".md")) {
      const clean = href.replace(/^\.\.\//, "");
      return "#/interests/neural-operators/reading?doc=" + encodeURIComponent(clean);
    }
    if (href.includes("graph/")) return "/interests/neural-operators/" + href.split("/").pop();
    return href;
  }
  return (
    <div className="no-reading-layout">
      <nav className="no-side-nav" aria-label="Reading documents">
        <p className="no-eyebrow">The collection</p>
        {documents.map(([id, label]) => (
          <button
            key={id}
            aria-current={doc === id ? "page" : undefined}
            onClick={() => setParams({ doc: id })}
          >
            {label}
          </button>
        ))}
        {doc.startsWith("notes/") && <Link to="/interests/neural-operators/graph">← Back to graph</Link>}
      </nav>
      <article className="no-article prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href = "", children }) => {
              if (href.endsWith(".pdf"))
                return <span className="no-muted">{children} (see primary source)</span>;
              const url = target(href);
              return (
                <a
                  href={url}
                  target={url.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  {children}
                </a>
              );
            },
            table: ({ children }) => (
              <div className="tablewrap">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

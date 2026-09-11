import data from "./data/graph.json";
export interface ResearchNode {
  id: string;
  type: "paper" | "author" | "field" | "area";
  label: string;
  title: string;
  year?: number;
  priority?: string;
  summary?: string;
  limits?: string;
  url?: string;
  authors?: string[];
  tags?: string[];
  paper_count?: number;
  publication_status?: string;
  review_level?: string;
}
export interface ResearchEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  evidence: string;
  evidence_url: string;
  evidence_locator: string;
  epistemic_status: string;
  evidence_page?: number;
}
export const nodes = data.nodes as ResearchNode[];
export const edges: ResearchEdge[] = data.edges;
export const byId = new Map(nodes.map((n) => [n.id, n]));
export const papers = nodes.filter((n) => n.type === "paper");
export const areas = nodes.filter((n) => n.type === "area");
export const memberships = edges.filter((e) => e.relation === "bridges_field");
export const citations = edges.filter((e) => e.relation === "cites");
export const palette = [
  "#8caaff",
  "#d3a1e9",
  "#dfb57b",
  "#6cc5b3",
  "#83b8df",
  "#db929f",
  "#b3a0f5",
  "#bfc58a",
  "#80cacc",
  "#cfad88",
  "#bd98d0",
];
export const areaColor = (id: string) =>
  palette[
    Math.max(
      0,
      areas.findIndex((a) => a.id === id),
    ) % palette.length
  ];
export const adjacent = (id: string) => edges.filter((e) => e.source === id || e.target === id);
export const peer = (e: ResearchEdge, id: string) =>
  byId.get(e.source === id ? e.target : e.source)!;

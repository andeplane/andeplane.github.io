import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'ai-data-analytics',
  title: 'AI Data Analytics',
  description: 'Natural-language data analysis tool — upload a CSV and ask questions in plain English.',
  tags: ['React', 'TypeScript', 'Vite', 'AI', 'Claude API'],
  repoUrl: 'https://github.com/andeplane/ai-data-analytics',
  screenshot: '/projects/ai-data-analytics/preview.png',
  longDescription: `
A browser-based data analytics assistant that lets non-technical users explore tabular data through conversation.

Upload any CSV file and describe what you want to know — "show me monthly revenue trends", "which product has the highest return rate?", "flag outliers in column C" — and the app translates your question into analysis code, runs it client-side, and renders charts or tables back to you.

## How it works

1. **File ingestion** — CSV is parsed in the browser with column type inference
2. **Prompt construction** — the schema (column names + sample rows) is injected into a system prompt alongside the user question
3. **Code generation** — the Claude API returns executable JavaScript that operates on the parsed data
4. **Safe execution** — generated code runs in a sandboxed eval context; results are rendered as charts (recharts) or sortable tables
5. **Iterative refinement** — follow-up questions maintain conversation context so the model can build on previous analyses

## Design goals

The goal was zero-dependency data exploration — no Python environment, no Jupyter, no server. Everything runs in the browser, making it easy to share a URL and let anyone analyse their own data without setup.
  `.trim(),
}

export default project

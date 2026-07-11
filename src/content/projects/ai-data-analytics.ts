import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'ai-data-analytics',
  title: 'AI Data Analytics',
  description: 'Full-stack AI data analytics running entirely in the browser — no server, no setup. Upload a CSV, ask questions in plain English, get answers powered by LLMs.',
  tags: ['Python', 'LLM', 'React', 'TypeScript', 'Browser-only'],
  liveUrl: 'https://andeplane.github.io/ai-data-analytics/',
  repoUrl: 'https://github.com/andeplane/ai-data-analytics',
  screenshot: '/projects/ai-data-analytics/preview.png',
  longDescription: `
A browser-based data analytics assistant that lets non-technical users explore tabular data through conversation.

Upload any CSV or JSON file and describe what you want to know — "show me monthly revenue trends", "which product has the highest return rate?", "flag outliers in column C" — and the app translates your question into analysis code, runs it client-side, and renders charts or tables back to you.

## How it works

1. **File ingestion** — CSV/JSON is parsed in the browser; multiple dataframes can be loaded, joined, and compared
2. **Local LLM inference** — [Web-LLM](https://github.com/mlc-ai/web-llm) runs Hermes-3-Llama-3.1-8B directly in the browser via WebGPU, so no API keys are needed
3. **Python in the browser** — [PandasAI](https://pandas-ai.com) running on Pyodide translates your question into pandas code and executes it client-side
4. **Automatic visualisation** — generated charts are converted to images and rendered alongside sortable tables
5. **Iterative refinement** — follow-up questions maintain conversation context so the model can build on previous analyses

## Design goals

The goal was zero-dependency, privacy-first data exploration — no Python environment, no Jupyter, no server, no API keys. Everything runs in the browser and your data never leaves your device, making it easy to share a URL and let anyone analyse their own data without setup.
  `.trim(),
}

export default project

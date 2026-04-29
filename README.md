# Multi-Agent Content Ops Pipeline

A production-grade multi-agent content generation system powered by Claude AI. Automatically researches, writes, fact-checks, polishes, and scores articles using a 5-agent pipeline with live visualization.

![Agents](https://img.shields.io/badge/Agents-5-blue) ![Pass Rate](https://img.shields.io/badge/Eval%20Pass%20Rate-100%25-green) ![Accuracy](https://img.shields.io/badge/Avg%20Accuracy-7.6%2F10-green)

## Architecture

The pipeline runs as a directed graph with conditional routing. The Fact Checker can route back to the Writer for revisions or all the way back to the Researcher if the research itself is insufficient. The Supervisor acts as a final judge and can trigger additional rewrite loops up to a maximum of 3 iterations before escalating to human review.

**Researcher → Writer → Fact Checker → Polisher → Supervisor**

## Agents

- **Researcher** — Searches the web using Tavily and Exa, scores source credibility, deduplicates results
- **Writer** — Writes a structured 600-900 word article strictly grounded in research sources
- **Fact Checker** — Verifies every claim in parallel using Claude, routes back to Writer or Researcher if accuracy is low
- **Polisher** — Fixes grammar, computes Flesch-Kincaid reading level, generates SEO metadata and URL slug
- **Supervisor** — Scores article on accuracy, tone, readability, and SEO (0-10 each). Routes to publish or triggers a rewrite loop

## Features

- Live React Flow DAG visualizer with real-time node status updates
- Server-Sent Events (SSE) streaming so every agent completion appears instantly
- LangGraph 1.x state machine with conditional routing and circuit breaker after 3 iterations
- Supabase persistence for articles, pipeline events, and eval results
- Row Level Security (RLS) enabled on all tables
- Offline eval harness with ground truth dataset — 100% pass rate across 5 test cases
- Parallel claim verification in the Fact Checker using Promise.all()

## Tech Stack

- **Frontend** — Next.js 15, TypeScript, Tailwind CSS, React Flow, React Markdown
- **Agents** — LangGraph 1.x, Anthropic Claude, LangChain
- **Search** — Tavily API, Exa API
- **Database** — Supabase (PostgreSQL + pgvector)
- **Streaming** — Server-Sent Events (SSE)

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/Jaswin2302/multi-agent-content-ops.git
cd multi-agent-content-ops
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the root and add the following keys:

- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `TAVILY_API_KEY` — from app.tavily.com
- `EXA_API_KEY` — from exa.ai
- `NEXT_PUBLIC_SUPABASE_URL` — from your Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project settings

### 4. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard`

### 5. Run the eval harness

```bash
npx tsx --env-file=.env.local evals/harness.ts
```

## Eval Results

| Topic | Accuracy | Result |
|-------|----------|--------|
| AI on Software Engineering | 8/10 | ✅ PASS |
| Climate Change Solutions | 7/10 | ✅ PASS |
| Electric Vehicles | 8/10 | ✅ PASS |
| ML in Healthcare | 7/10 | ✅ PASS |
| Quantum Computing | 8/10 | ✅ PASS |

**Pass rate: 5/5 (100%) — Avg accuracy: 7.6/10**

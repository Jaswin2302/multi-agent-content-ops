markdown# Multi-Agent Content Ops Pipeline

A production-grade multi-agent content generation system powered by Claude AI. Automatically researches, writes, fact-checks, polishes, and scores articles using a 5-agent pipeline with live visualization.

![Pipeline DAG](https://img.shields.io/badge/Agents-5-blue) ![Pass Rate](https://img.shields.io/badge/Eval%20Pass%20Rate-100%25-green) ![Accuracy](https://img.shields.io/badge/Avg%20Accuracy-7.6%2F10-green)

## Architecture
Researcher → Writer → Fact Checker → Polisher → Supervisor
↑|                        |
↑________________________|

### Agents
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
Create a `.env.local` file in the root:
ANTHROPIC_API_KEY=your_key
TAVILY_API_KEY=your_key
EXA_API_KEY=your_key
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

### 4. Set up Supabase
Run the SQL migrations in `supabase/migrations.sql` in your Supabase SQL editor.

### 5. Run the app
```bash
npm run dev
```

Visit `http://localhost:3000/dashboard`

### 6. Run the eval harness
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

## Project Structure
├── agents/
│   ├── researcher.ts     # Web search + source credibility scoring
│   ├── writer.ts         # Article generation
│   ├── fact-checker.ts   # Parallel claim verification
│   ├── polisher.ts       # Grammar, SEO, reading level
│   └── supervisor.ts     # LLM-as-judge scoring
├── lib/
│   ├── graph.ts          # LangGraph DAG definition
│   ├── schemas.ts        # Zod schemas for all agent boundaries
│   ├── supabase.ts       # Database client and queries
│   └── redis.ts          # Job queue (future)
├── app/
│   ├── dashboard/        # React Flow visualizer + live logs
│   └── api/
│       └── run-pipeline/ # SSE streaming API route
└── evals/
├── harness.ts        # Eval runner
└── dataset/          # Ground truth test cases


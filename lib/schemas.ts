import { z } from "zod"

// ── Source ──────────────────────────────────────────────
export const Source = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  credibility_score: z.number().min(0).max(1),
  published_at: z.string().optional()
})

// ── Researcher Output ────────────────────────────────────
export const ResearchOutput = z.object({
  topic: z.string(),
  sources: z.array(Source),
  key_claims: z.array(z.string()),
  research_gaps: z.array(z.string())
})

// ── Writer Output ────────────────────────────────────────
export const WriterOutput = z.object({
  title: z.string(),
  body: z.string(),
  word_count: z.number(),
  claims_made: z.array(z.string()),
  sources_cited: z.array(z.string())
})

// ── Fact Check Output ────────────────────────────────────
export const DisputedClaim = z.object({
  claim: z.string(),
  reason: z.string(),
  suggested_fix: z.string()
})

export const FactCheckOutput = z.object({
  verdict: z.enum(["pass", "revise", "reject"]),
  verified_claims: z.array(z.string()),
  disputed_claims: z.array(DisputedClaim),
  overall_accuracy_score: z.number().min(0).max(1)
})

// ── Polisher Output ──────────────────────────────────────
export const PolisherOutput = z.object({
  title: z.string(),
  body: z.string(),
  meta_description: z.string(),
  slug: z.string(),
  reading_level: z.number(),
  seo_title: z.string()
})

// ── Supervisor Output ────────────────────────────────────
export const SupervisorScores = z.object({
  accuracy: z.number().min(0).max(10),
  tone: z.number().min(0).max(10),
  readability: z.number().min(0).max(10),
  seo: z.number().min(0).max(10)
})

export const SupervisorOutput = z.object({
  approved: z.boolean(),
  scores: SupervisorScores,
  routing_decision: z.enum(["publish", "rewrite", "re-research", "reject"]),
  feedback: z.string()
})

// ── Pipeline State (shared across all agents) ────────────
export const PipelineState = z.object({
  topic: z.string(),
  iteration_count: z.number().default(0),
  research: ResearchOutput.optional(),
  article: WriterOutput.optional(),
  fact_check: FactCheckOutput.optional(),
  polished: PolisherOutput.optional(),
  supervisor: SupervisorOutput.optional(),
  status: z.enum([
    "researching",
    "writing",
    "fact_checking",
    "polishing",
    "supervising",
    "human_review",
    "published",
    "rejected"
  ]).default("researching")
})

// ── TypeScript types inferred from schemas ───────────────
export type Source = z.infer<typeof Source>
export type ResearchOutput = z.infer<typeof ResearchOutput>
export type WriterOutput = z.infer<typeof WriterOutput>
export type FactCheckOutput = z.infer<typeof FactCheckOutput>
export type PolisherOutput = z.infer<typeof PolisherOutput>
export type SupervisorOutput = z.infer<typeof SupervisorOutput>
export type PipelineState = z.infer<typeof PipelineState>
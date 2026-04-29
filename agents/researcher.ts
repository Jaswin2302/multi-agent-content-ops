import Anthropic from "@anthropic-ai/sdk"
import { tavily } from "@tavily/core"
import Exa from "exa-js"
import { z } from "zod"
import { ResearchOutput, Source } from "../lib/schemas"

// ── Initialize clients ───────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY })
const exaClient = new Exa(process.env.EXA_API_KEY as string)

// ── Credibility scorer ───────────────────────────────────
function scoreCredibility(url: string, publishedAt?: string): number {
  let score = 0.5

  const highTrust = ["nature.com", "arxiv.org", "pubmed", "gov", "edu", "reuters.com", "apnews.com"]
  const lowTrust = ["reddit.com", "quora.com", "yahoo.answers"]

  if (highTrust.some(domain => url.includes(domain))) score += 0.3
  if (lowTrust.some(domain => url.includes(domain))) score -= 0.3

  if (publishedAt) {
    const daysSince = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 30) score += 0.2
    else if (daysSince < 365) score += 0.1
    else if (daysSince > 730) score -= 0.1
  }

  return Math.min(1, Math.max(0, score))
}

// ── Deduplicate sources ──────────────────────────────────
function deduplicateSources(sources: z.infer<typeof Source>[]): z.infer<typeof Source>[] {
  const seen = new Set<string>()
  return sources.filter(source => {
    try {
      const domain = new URL(source.url).hostname
      if (seen.has(domain)) return false
      seen.add(domain)
      return true
    } catch {
      return false
    }
  })
}

// ── Strip code fences from Claude response ───────────────
function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

// ── Main researcher function ─────────────────────────────
export async function runResearcher(
  topic: string,
  researchGaps?: string[]
): Promise<z.infer<typeof ResearchOutput>> {

  const searchQuery = researchGaps?.length
    ? `${topic} ${researchGaps[0]}`
    : topic

  // ── Run Tavily and Exa searches in parallel ──────────
  const [tavilyResults, exaResults] = await Promise.all([
    tavilyClient.search(searchQuery, {
      maxResults: 7,
      searchDepth: "advanced",
      includePublishedDate: true
    }),
    exaClient.searchAndContents(searchQuery, {
      numResults: 5,
      useAutoprompt: true,
      text: { maxCharacters: 500 }
    })
  ])

  // ── Format Tavily sources ────────────────────────────
  const tavily_sources: z.infer<typeof Source>[] = tavilyResults.results.map(r => ({
    url: r.url,
    title: r.title ?? "Untitled",
    snippet: r.content ?? "",
    credibility_score: scoreCredibility(r.url, r.publishedDate),
    published_at: r.publishedDate
  }))

  // ── Format Exa sources ───────────────────────────────
  const exa_sources: z.infer<typeof Source>[] = exaResults.results.map(r => ({
    url: r.url,
    title: r.title ?? "Untitled",
    snippet: r.text ?? "",
    credibility_score: scoreCredibility(r.url, r.publishedDate),
    published_at: r.publishedDate ?? undefined
  }))

  // ── Combine and deduplicate ──────────────────────────
  const allSources = deduplicateSources([...tavily_sources, ...exa_sources])
    .sort((a, b) => b.credibility_score - a.credibility_score)
    .slice(0, 8)

  // ── Ask Claude to extract key claims ────────────────
  const claimsResponse = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Based on these sources about "${topic}", extract:
1. A list of 5-8 key factual claims supported by the sources
2. A list of 2-3 research gaps (things not covered or unclear)

Sources:
${allSources.map(s => `- ${s.title}: ${s.snippet}`).join("\n")}

Respond in this exact JSON format with no extra text and no code fences:
{
  "key_claims": ["claim 1", "claim 2"],
  "research_gaps": ["gap 1", "gap 2"]
}`
    }]
  })

  // ── Parse Claude's response ──────────────────────────
  const rawText = claimsResponse.content[0].type === "text"
    ? claimsResponse.content[0].text
    : ""

  const parsed = JSON.parse(stripCodeFences(rawText))

  // ── Build and validate the final output ─────────────
  const output = ResearchOutput.parse({
    topic,
    sources: allSources,
    key_claims: parsed.key_claims,
    research_gaps: parsed.research_gaps
  })

  return output
}
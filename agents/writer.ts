import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { ResearchOutput, WriterOutput } from "../lib/schemas"

// ── Initialize client ────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Main writer function ─────────────────────────────────
export async function runWriter(
  research: z.infer<typeof ResearchOutput>,
  disputedClaims?: { claim: string; suggested_fix: string }[]
): Promise<z.infer<typeof WriterOutput>> {

  // ── Build context from sources ───────────────────────
  const sourcesContext = research.sources
    .map(s => `Source: ${s.title} (${s.url})\nSnippet: ${s.snippet}`)
    .join("\n\n")

  // ── Build revision context if this is a retry ────────
  const revisionContext = disputedClaims?.length
    ? `\n\nIMPORTANT - You are revising a previous draft. Fix these specific claims:
${disputedClaims.map(d => `- WRONG: "${d.claim}" → FIX: ${d.suggested_fix}`).join("\n")}`
    : ""

  // ── Call Claude to write the article ─────────────────
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `You are a professional content writer. Write a high quality, well structured article about "${research.topic}".

STRICT RULES:
1. Only assert claims that are directly supported by the sources below
2. Do not invent statistics, quotes, or facts not present in the sources
3. Cite sources inline using their URL
4. Write between 600-900 words
5. Use a clear structure: introduction, 3-4 body sections, conclusion

${sourcesContext}
${revisionContext}

Respond in this exact JSON format with no extra text:
{
  "title": "Article title here",
  "body": "Full article text here...",
  "word_count": 750,
  "claims_made": [
    "Specific factual claim 1 made in the article",
    "Specific factual claim 2 made in the article"
  ],
  "sources_cited": ["https://source1.com", "https://source2.com"]
}`
    }]
  })

  // ── Extract text from response ───────────────────────
  const rawText = response.content[0].type === "text"
    ? response.content[0].text
    : ""

  // ── Strip markdown code fences if Claude adds them ───
  const cleanText = rawText
    .replace(/^```json\n?/, "")
    .replace(/^```\n?/, "")
    .replace(/\n?```$/, "")
    .trim()

  // ── Parse and validate ───────────────────────────────
  const parsed = JSON.parse(cleanText)

  const output = WriterOutput.parse({
    title: parsed.title,
    body: parsed.body,
    word_count: parsed.word_count,
    claims_made: parsed.claims_made,
    sources_cited: parsed.sources_cited
  })

  return output
}
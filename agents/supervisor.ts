import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { PolisherOutput, SupervisorOutput } from "../lib/schemas"

// ── Initialize client ────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Main supervisor function ─────────────────────────────
export async function runSupervisor(
  article: z.infer<typeof PolisherOutput>,
  iterationCount: number
): Promise<z.infer<typeof SupervisorOutput>> {

  // ── Call Claude as the judge ──────────────────────────
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `You are a senior editor and content quality judge. Score this article on four dimensions.

SCORING RUBRIC:
- accuracy (0-10): Are all claims well supported and precise?
- tone (0-10): Is the writing professional, engaging, and appropriate?
- readability (0-10): Is the article clear, well structured, and easy to follow?
- seo (0-10): Is the title compelling, are keywords used naturally, is the structure SEO friendly?

ARTICLE TITLE: ${article.title}
SEO TITLE: ${article.seo_title}
META DESCRIPTION: ${article.meta_description}
READING LEVEL SCORE: ${article.reading_level.toFixed(1)} (higher = easier to read)

ARTICLE BODY:
${article.body}

Respond in this exact JSON format with no extra text:
{
  "scores": {
    "accuracy": 8,
    "tone": 7,
    "readability": 9,
    "seo": 8
  },
  "feedback": "Specific actionable feedback explaining every score under 8",
  "routing_decision": "publish"
}`
    }]
  })

  // ── Extract and clean response ────────────────────────
  const rawText = response.content[0].type === "text"
    ? response.content[0].text
    : ""

  const cleanText = rawText
    .replace(/^```json\n?/, "")
    .replace(/^```\n?/, "")
    .replace(/\n?```$/, "")
    .trim()

  const parsed = JSON.parse(cleanText)

  // ── Calculate average score ───────────────────────────
  const scores = parsed.scores
  const averageScore = (scores.accuracy + scores.tone + scores.readability + scores.seo) / 4

  // ── Override routing if too many iterations ───────────
  let routingDecision: "publish" | "rewrite" | "re-research" | "reject"

  if (iterationCount >= 3) {
    // Force human review after 3 loops to prevent infinite retries
    routingDecision = "reject"
  } else if (averageScore >= 7.5) {
    routingDecision = "publish"
  } else if (averageScore >= 5) {
    routingDecision = scores.accuracy < 6 ? "re-research" : "rewrite"
  } else {
    routingDecision = "reject"
  }

  // ── Build and validate output ─────────────────────────
  const output = SupervisorOutput.parse({
    approved: routingDecision === "publish",
    scores: {
      accuracy: scores.accuracy,
      tone: scores.tone,
      readability: scores.readability,
      seo: scores.seo
    },
    routing_decision: routingDecision,
    feedback: parsed.feedback
  })

  return output
}
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { ResearchOutput, WriterOutput, FactCheckOutput, DisputedClaim } from "../lib/schemas"

// ── Initialize client ────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Strip code fences from Claude response ───────────────
function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

// ── Sanitize string for safe JSON parsing ────────────────
function sanitizeForJson(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
}

// ── Check a single claim against sources ─────────────────
async function verifyClaim(
  claim: string,
  sources: z.infer<typeof ResearchOutput>["sources"]
): Promise<{ supported: boolean; evidence: string; suggested_fix: string }> {

  const sourceContext = sources
    .map(s => `[${s.title}]: ${s.snippet}`)
    .join("\n")

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `You are a fact checker. Determine if the following claim is supported by the sources.

CLAIM: ${claim}

SOURCES:
${sourceContext}

IMPORTANT RULES:
1. Respond ONLY with raw JSON, no code fences, no markdown
2. Do not use apostrophes or quotation marks inside field values
3. Keep all field values short and simple

Respond in exactly this format:
{
  "supported": true,
  "evidence": "Brief reference from sources supporting or contradicting the claim",
  "suggested_fix": "NA if supported, or brief fix description if not supported"
}`
    }]
  })

  const rawText = response.content[0].type === "text"
    ? response.content[0].text
    : '{"supported": true, "evidence": "Unable to verify", "suggested_fix": "NA"}'

  const cleaned = stripCodeFences(rawText)

  try {
    return JSON.parse(cleaned)
  } catch {
    const supportedMatch = cleaned.match(/"supported"\s*:\s*(true|false)/)
    const supported = supportedMatch ? supportedMatch[1] === "true" : true

    return {
      supported,
      evidence: "Automated extraction fallback",
      suggested_fix: "NA"
    }
  }
}

// ── Main fact checker function ───────────────────────────
export async function runFactChecker(
  article: z.infer<typeof WriterOutput>,
  research: z.infer<typeof ResearchOutput>
): Promise<z.infer<typeof FactCheckOutput>> {

  // ── Cap claims at 6 and verify in batches of 3 ───────
  const claims = article.claims_made.slice(0, 6)
  const batchSize = 3
  const verificationResults: { supported: boolean; evidence: string; suggested_fix: string }[] = []

  for (let i = 0; i < claims.length; i += batchSize) {
    const batch = claims.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(claim => verifyClaim(claim, research.sources))
    )
    verificationResults.push(...batchResults)

    // ── Small delay between batches to avoid rate limits ─
    if (i + batchSize < claims.length) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  // ── Separate verified from disputed ──────────────────
  const verifiedClaims: string[] = []
  const disputedClaims: z.infer<typeof DisputedClaim>[] = []

  claims.forEach((claim, index) => {
    const result = verificationResults[index]
    if (result.supported) {
      verifiedClaims.push(claim)
    } else {
      disputedClaims.push({
        claim,
        reason: result.evidence,
        suggested_fix: result.suggested_fix
      })
    }
  })

  // ── Calculate accuracy score ──────────────────────────
  const totalClaims = claims.length
  const accuracyScore = totalClaims > 0
    ? verifiedClaims.length / totalClaims
    : 1

  // ── Determine verdict ─────────────────────────────────
  let verdict: "pass" | "revise" | "reject"

  if (accuracyScore >= 0.9) {
    verdict = "pass"
  } else if (accuracyScore >= 0.6) {
    verdict = "revise"
  } else {
    verdict = "reject"
  }

  // ── Build and validate output ─────────────────────────
  const output = FactCheckOutput.parse({
    verdict,
    verified_claims: verifiedClaims,
    disputed_claims: disputedClaims,
    overall_accuracy_score: accuracyScore
  })

  return output
}
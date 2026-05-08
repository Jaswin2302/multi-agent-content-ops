import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { WriterOutput, PolisherOutput } from "../lib/schemas"

// ── Initialize client ────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Calculate Flesch-Kincaid reading level ───────────────
function calculateReadingLevel(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = text.split(/\s+/).filter(w => w.trim().length > 0)
  const syllables = words.reduce((count, word) => {
    return count + countSyllables(word)
  }, 0)

  if (sentences.length === 0 || words.length === 0) return 0

  const ASL = words.length / sentences.length
  const ASW = syllables / words.length

  return Math.max(0, 206.835 - 1.015 * ASL - 84.6 * ASW)
}

// ── Count syllables in a word ────────────────────────────
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "")
  if (word.length <= 3) return 1
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
  word = word.replace(/^y/, "")
  const matches = word.match(/[aeiouy]{1,2}/g)
  return matches ? matches.length : 1
}

// ── Generate URL slug from title ─────────────────────────
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

// ── Strip code fences from Claude response ───────────────
function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

// ── Safe JSON parse with fallback ────────────────────────
function safeParseJSON(text: string, fallback: any): any {
  try {
    return JSON.parse(text)
  } catch {
    // ── Try to extract fields manually if JSON is broken ─
    const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/)
    const metaMatch = text.match(/"meta_description"\s*:\s*"([^"]*)"/)
    const seoMatch = text.match(/"seo_title"\s*:\s*"([^"]*)"/)

    if (titleMatch) {
      return {
        title: titleMatch[1] || fallback.title,
        body: fallback.body,
        meta_description: metaMatch ? metaMatch[1] : "",
        seo_title: seoMatch ? seoMatch[1] : titleMatch[1] || fallback.title
      }
    }

    return fallback
  }
}

// ── Main polisher function ───────────────────────────────
export async function runPolisher(
  article: z.infer<typeof WriterOutput>
): Promise<z.infer<typeof PolisherOutput>> {

  // ── Ask Claude to polish the article ─────────────────
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `You are a professional editor and SEO specialist. Polish the following article.

YOUR TASKS:
1. Fix any grammar, spelling, or punctuation errors
2. Improve sentence flow and readability without changing facts
3. Write an SEO-optimized title (50-60 characters)
4. Write a meta description (150-160 characters) that summarizes the article
5. Do NOT add, remove, or change any factual claims

IMPORTANT: Respond ONLY with raw JSON. No code fences, no markdown, no extra text.
Do not use special characters or unescaped quotes inside JSON string values.

ORIGINAL ARTICLE TITLE: ${article.title}
ORIGINAL ARTICLE BODY:
${article.body}

Respond in this exact JSON format:
{
  "title": "Polished article title here",
  "body": "Full polished article text here",
  "meta_description": "150-160 character meta description here",
  "seo_title": "SEO optimized title 50-60 chars"
}`
    }]
  })

  // ── Extract and clean response ────────────────────────
  const rawText = response.content[0].type === "text"
    ? response.content[0].text
    : ""

  const cleaned = stripCodeFences(rawText)

  // ── Use safe parser with fallback to original article ─
  const parsed = safeParseJSON(cleaned, {
    title: article.title,
    body: article.body,
    meta_description: "",
    seo_title: article.title
  })

  // ── Calculate reading level locally ──────────────────
  const readingLevel = calculateReadingLevel(parsed.body || article.body)

  // ── Generate slug locally ─────────────────────────────
  const slug = generateSlug(parsed.title || article.title)

  // ── Build and validate output ─────────────────────────
  const output = PolisherOutput.parse({
    title: parsed.title || article.title,
    body: parsed.body || article.body,
    meta_description: parsed.meta_description || "",
    slug,
    reading_level: readingLevel,
    seo_title: parsed.seo_title || parsed.title || article.title
  })

  return output
}
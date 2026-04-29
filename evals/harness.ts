import { graph } from "../lib/graph"
import { saveEvalRun } from "../lib/supabase"
import * as fs from "fs"
import * as path from "path"

// ── Types ────────────────────────────────────────────────
interface EvalCase {
  topic: string
  expected_facts: string[]
  min_accuracy_score: number
  forbidden_claims: string[]
}

interface EvalResult {
  topic: string
  passed: boolean
  accuracy_score: number
  supervisor_scores: {
    accuracy: number
    tone: number
    readability: number
    seo: number
  } | null
  forbidden_found: string[]
  missing_facts: string[]
  duration_ms: number
  error?: string
}

// ── Run a single eval case ───────────────────────────────
async function runEvalCase(evalCase: EvalCase): Promise<EvalResult> {
  const start = Date.now()

  try {
    console.log(`\n▶ Running eval: "${evalCase.topic}"`)

    // ── Run the full pipeline ───────────────────────
    const finalState = await graph.invoke({
      topic: evalCase.topic,
      iteration_count: 0
    })

    const duration = Date.now() - start
    const articleText = finalState.polished?.body || ""
    const accuracyScore = finalState.supervisor_result?.scores?.accuracy || 0

    // ── Check for forbidden claims ──────────────────
    const forbiddenFound = evalCase.forbidden_claims.filter(claim =>
      articleText.toLowerCase().includes(claim.toLowerCase())
    )

    // ── Check for expected facts ────────────────────
    const missingFacts = evalCase.expected_facts.filter(fact =>
      !articleText.toLowerCase().includes(fact.toLowerCase())
    )

    // ── Determine pass/fail ─────────────────────────
    const passed =
      accuracyScore >= evalCase.min_accuracy_score &&
      forbiddenFound.length === 0

    const result: EvalResult = {
      topic: evalCase.topic,
      passed,
      accuracy_score: accuracyScore,
      supervisor_scores: finalState.supervisor_result?.scores || null,
      forbidden_found: forbiddenFound,
      missing_facts: missingFacts,
      duration_ms: duration
    }

    console.log(`${passed ? "✅ PASS" : "❌ FAIL"} — accuracy: ${accuracyScore}/10, duration: ${duration}ms`)
    if (forbiddenFound.length > 0) console.log(`  ⚠ Forbidden claims found: ${forbiddenFound.join(", ")}`)
    if (missingFacts.length > 0) console.log(`  ⚠ Missing facts: ${missingFacts.join(", ")}`)

    return result

  } catch (error: any) {
    console.log(`❌ ERROR — ${error.message}`)
    return {
      topic: evalCase.topic,
      passed: false,
      accuracy_score: 0,
      supervisor_scores: null,
      forbidden_found: [],
      missing_facts: evalCase.expected_facts,
      duration_ms: Date.now() - start,
      error: error.message
    }
  }
}

// ── Main eval runner ─────────────────────────────────────
async function runEvals() {
  console.log("🧪 Starting eval harness...")
  console.log("================================\n")

  // ── Load dataset ────────────────────────────────────
  const datasetDir = path.join(process.cwd(), "evals", "dataset")
  const files = fs.readdirSync(datasetDir).filter(f => f.endsWith(".json"))

  if (files.length === 0) {
    console.log("No eval cases found in evals/dataset/")
    process.exit(1)
  }

  const evalCases: EvalCase[] = files.map(file => {
    const content = fs.readFileSync(path.join(datasetDir, file), "utf-8")
    return JSON.parse(content)
  })

  console.log(`Loaded ${evalCases.length} eval cases\n`)

  // ── Run all cases ────────────────────────────────────
  const results: EvalResult[] = []

  for (const evalCase of evalCases) {
    const result = await runEvalCase(evalCase)
    results.push(result)
  }

  // ── Calculate summary stats ──────────────────────────
  const passed = results.filter(r => r.passed).length
  const total = results.length
  const passRate = ((passed / total) * 100).toFixed(1)
  const avgAccuracy = (results.reduce((sum, r) => sum + r.accuracy_score, 0) / total).toFixed(1)
  const avgDuration = (results.reduce((sum, r) => sum + r.duration_ms, 0) / total / 1000).toFixed(1)

  console.log("\n================================")
  console.log("📊 EVAL SUMMARY")
  console.log("================================")
  console.log(`Pass rate:       ${passed}/${total} (${passRate}%)`)
  console.log(`Avg accuracy:    ${avgAccuracy}/10`)
  console.log(`Avg duration:    ${avgDuration}s`)
  console.log("================================\n")

  // ── Save results to Supabase ─────────────────────────
  try {
    await saveEvalRun({
      dataset_version: "v1",
      results: {
        summary: { passed, total, passRate, avgAccuracy, avgDuration },
        cases: results
      }
    })
    console.log("✅ Eval results saved to Supabase")
  } catch (error: any) {
    console.log(`⚠ Could not save to Supabase: ${error.message}`)
  }

  // ── Exit with error code if pass rate is low ─────────
  if (parseFloat(passRate) < 70) {
    console.log("❌ Pass rate below 70% threshold")
    process.exit(1)
  } else {
    console.log("✅ Eval harness passed")
    process.exit(0)
  }
}

// ── Run ──────────────────────────────────────────────────
runEvals().catch(console.error)
import { createClient } from "@supabase/supabase-js"

// ── Initialize Supabase client ───────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Save a new article to the database ──────────────────
export async function createArticle(topic: string) {
  const { data, error } = await supabase
    .from("articles")
    .insert({ topic, status: "queued" })
    .select()
    .single()

  if (error) throw new Error(`Failed to create article: ${error.message}`)
  return data
}

// ── Update article status and content ───────────────────
export async function updateArticle(id: string, updates: {
  status?: string
  final_content?: object
  supervisor_scores?: object
  iteration_count?: number
}) {
  const { data, error } = await supabase
    .from("articles")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update article: ${error.message}`)
  return data
}

// ── Log a single agent event ─────────────────────────────
export async function logPipelineEvent(event: {
  article_id: string
  agent: string
  input: object
  output: object
  duration_ms: number
}) {
  const { error } = await supabase
    .from("pipeline_events")
    .insert(event)

  if (error) throw new Error(`Failed to log event: ${error.message}`)
}

// ── Fetch a single article by id ─────────────────────────
export async function getArticle(id: string) {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw new Error(`Failed to fetch article: ${error.message}`)
  return data
}

// ── Fetch all articles ───────────────────────────────────
export async function getAllArticles() {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Failed to fetch articles: ${error.message}`)
  return data
}

// ── Save eval run results ────────────────────────────────
export async function saveEvalRun(results: {
  dataset_version: string
  results: object
}) {
  const { error } = await supabase
    .from("eval_runs")
    .insert(results)

  if (error) throw new Error(`Failed to save eval run: ${error.message}`)
}
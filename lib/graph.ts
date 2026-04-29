import { StateGraph, Annotation } from "@langchain/langgraph"
import { runResearcher } from "../agents/researcher"
import { runWriter } from "../agents/writer"
import { runFactChecker } from "../agents/fact-checker"
import { runPolisher } from "../agents/polisher"
import { runSupervisor } from "../agents/supervisor"
import {
  ResearchOutput,
  WriterOutput,
  FactCheckOutput,
  PolisherOutput,
  SupervisorOutput
} from "./schemas"
import { z } from "zod"

// ── Define state using Annotation ────────────────────────
const PipelineAnnotation = Annotation.Root({
  topic: Annotation<string>(),
  iteration_count: Annotation<number>({
    reducer: (a, b) => b ?? a,
    default: () => 0
  }),
  research: Annotation<z.infer<typeof ResearchOutput> | undefined>({
    reducer: (a, b) => b ?? a,
    default: () => undefined
  }),
  article: Annotation<z.infer<typeof WriterOutput> | undefined>({
    reducer: (a, b) => b ?? a,
    default: () => undefined
  }),
  fact_check: Annotation<z.infer<typeof FactCheckOutput> | undefined>({
    reducer: (a, b) => b ?? a,
    default: () => undefined
  }),
  polished: Annotation<z.infer<typeof PolisherOutput> | undefined>({
    reducer: (a, b) => b ?? a,
    default: () => undefined
  }),
  supervisor_result: Annotation<z.infer<typeof SupervisorOutput> | undefined>({
    reducer: (a, b) => b ?? a,
    default: () => undefined
  }),
  status: Annotation<string>({
    reducer: (a, b) => b ?? a,
    default: () => "researching"
  })
})

type State = typeof PipelineAnnotation.State

// ── Define each node ─────────────────────────────────────

async function researcherNode(state: State): Promise<Partial<State>> {
  const research = await runResearcher(
    state.topic,
    state.research?.research_gaps
  )
  return {
    research,
    status: "writing"
  }
}

async function writerNode(state: State): Promise<Partial<State>> {
  const disputedClaims = state.fact_check?.disputed_claims?.map(d => ({
    claim: d.claim,
    suggested_fix: d.suggested_fix
  }))
  const article = await runWriter(state.research!, disputedClaims)
  return {
    article,
    status: "fact_checking"
  }
}

async function factCheckerNode(state: State): Promise<Partial<State>> {
  const fact_check = await runFactChecker(state.article!, state.research!)
  return {
    fact_check,
    status: "polishing"
  }
}

async function polisherNode(state: State): Promise<Partial<State>> {
  const polished = await runPolisher(state.article!)
  return {
    polished,
    status: "supervising"
  }
}

async function supervisorNode(state: State): Promise<Partial<State>> {
  const supervisor_result = await runSupervisor(state.polished!, state.iteration_count)
  return {
    supervisor_result,
    iteration_count: state.iteration_count + 1,
    status: supervisor_result.routing_decision === "publish"
      ? "published"
      : supervisor_result.routing_decision === "reject"
      ? "rejected"
      : "writing"
  }
}

async function humanReviewNode(state: State): Promise<Partial<State>> {
  return { status: "human_review" }
}

// ── Routing functions ────────────────────────────────────

function routeAfterFactCheck(state: State): string {
  const verdict = state.fact_check?.verdict
  if (verdict === "pass") return "polisher"
  if (verdict === "revise") return "writer"
  if (verdict === "reject") return "researcher"
  return "polisher"
}

function routeAfterSupervisor(state: State): string {
  const decision = state.supervisor_result?.routing_decision
  if (state.iteration_count >= 3) return "human_review"
  if (decision === "publish") return "__end__"
  if (decision === "rewrite") return "writer"
  if (decision === "re-research") return "researcher"
  if (decision === "reject") return "human_review"
  return "__end__"
}

// ── Build the graph ──────────────────────────────────────

const workflow = new StateGraph(PipelineAnnotation)

// ── Add nodes ────────────────────────────────────────────
workflow.addNode("researcher", researcherNode)
workflow.addNode("writer", writerNode)
workflow.addNode("fact_checker", factCheckerNode)
workflow.addNode("polisher", polisherNode)
workflow.addNode("supervisor_node", supervisorNode)
workflow.addNode("human_review", humanReviewNode)

// ── Add edges ────────────────────────────────────────────
workflow.addEdge("__start__" as any, "researcher" as any)
workflow.addEdge("researcher" as any, "writer" as any)
workflow.addEdge("writer" as any, "fact_checker" as any)
workflow.addConditionalEdges("fact_checker" as any, routeAfterFactCheck)
workflow.addEdge("polisher" as any, "supervisor_node" as any)
workflow.addConditionalEdges("supervisor_node" as any, routeAfterSupervisor)
workflow.addEdge("human_review" as any, "__end__" as any)

// ── Compile and export ───────────────────────────────────
export const graph = workflow.compile()
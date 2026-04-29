import { NextRequest } from "next/server"
import { graph } from "../../../lib/graph"
import { createArticle, updateArticle, logPipelineEvent } from "../../../lib/supabase"

export async function POST(req: NextRequest) {
  const { topic } = await req.json()

  if (!topic) {
    return new Response(JSON.stringify({ error: "Topic is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  // ── Create article record in database ────────────────
  const article = await createArticle(topic)
  const articleId = article.id

  // ── Set up SSE stream ────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        // ── Send initial event ──────────────────────
        send("pipeline_start", { articleId, topic, timestamp: Date.now() })

        // ── Track agent timing ──────────────────────
        const agentStartTimes: Record<string, number> = {}

        // ── Stream pipeline events ──────────────────
        const eventStream = graph.streamEvents(
          { topic, iteration_count: 0 },
          { version: "v2" }
        )

        for await (const event of eventStream) {

          // ── Agent started ─────────────────────────
          if (event.event === "on_chain_start" && event.name !== "LangGraph") {
            agentStartTimes[event.name] = Date.now()
            send("agent_start", {
              agent: event.name,
              timestamp: Date.now()
            })

            await updateArticle(articleId, {
              status: event.name
            })
          }

          // ── Agent completed ───────────────────────
          if (event.event === "on_chain_end" && event.name !== "LangGraph") {
            const startTime = agentStartTimes[event.name] || Date.now()
            const duration = Date.now() - startTime

            send("agent_complete", {
              agent: event.name,
              output: event.data?.output,
              duration_ms: duration,
              timestamp: Date.now()
            })

            await logPipelineEvent({
              article_id: articleId,
              agent: event.name,
              input: event.data?.input || {},
              output: event.data?.output || {},
              duration_ms: duration
            })
          }
        }

        // ── Run the full graph to get final state ───
        const finalState = await graph.invoke(
          { topic, iteration_count: 0 }
        )

        // ── Save final content to database ──────────
        await updateArticle(articleId, {
          status: finalState.status,
          final_content: finalState.polished || {},
          supervisor_scores: finalState.supervisor_result?.scores || {},
          iteration_count: finalState.iteration_count
        })

        // ── Send completion event with full article ─
        send("pipeline_complete", {
          articleId,
          status: finalState.status,
          title: finalState.polished?.title,
          body: finalState.polished?.body,
          scores: finalState.supervisor_result?.scores,
          timestamp: Date.now()
        })

      } catch (error: any) {
        send("pipeline_error", {
          error: error.message,
          timestamp: Date.now()
        })

        await updateArticle(articleId, { status: "rejected" })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  })
}
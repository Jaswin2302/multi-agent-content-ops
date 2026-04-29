"use client"
import { useState, useRef } from "react"
import dynamic from "next/dynamic"
import ReactMarkdown from "react-markdown"

// ── Dynamically import the graph to avoid SSR issues ─────
const PipelineGraph = dynamic(
  () => import("./components/PipelineGraph"),
  { ssr: false }
)

// ── Types ─────────────────────────────────────────────────
type NodeStatus = "idle" | "running" | "complete" | "error"

interface AgentLog {
  agent: string
  status: "running" | "complete" | "error"
  duration_ms?: number
  timestamp: number
}

interface SupervisorScores {
  accuracy: number
  tone: number
  readability: number
  seo: number
}

// ── Main dashboard page ───────────────────────────────────
export default function DashboardPage() {
  const [topic, setTopic] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({})
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [finalTitle, setFinalTitle] = useState<string | null>(null)
  const [articleBody, setArticleBody] = useState<string | null>(null)
  const [scores, setScores] = useState<SupervisorScores | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // ── Add a log entry ──────────────────────────────────────
  const addLog = (log: AgentLog) => {
    setLogs(prev => [...prev, log])
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  // ── Run the pipeline ─────────────────────────────────────
  const runPipeline = async () => {
    if (!topic.trim()) return

    setIsRunning(true)
    setNodeStatuses({})
    setLogs([])
    setFinalTitle(null)
    setArticleBody(null)
    setScores(null)
    setError(null)

    try {
      const response = await fetch("/api/run-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split("\n")

        // ── Track current event name across lines ─────
        let currentEvent = ""

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim()
          }

          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5).trim())

              // ── Filter out internal LangGraph nodes ─
              const isInternalNode =
                data.agent === "__start__" ||
                data.agent === "__end__" ||
                data.agent === "LangGraph" ||
                data.agent === "RunnableLambda"

              if (currentEvent === "agent_start" && !isInternalNode) {
                setNodeStatuses(prev => ({ ...prev, [data.agent]: "running" }))
                addLog({ agent: data.agent, status: "running", timestamp: data.timestamp })
              }

              if (currentEvent === "agent_complete" && !isInternalNode) {
                setNodeStatuses(prev => ({ ...prev, [data.agent]: "complete" }))
                addLog({
                  agent: data.agent,
                  status: "complete",
                  duration_ms: data.duration_ms,
                  timestamp: data.timestamp
                })
              }

              if (currentEvent === "pipeline_complete") {
                setFinalTitle(data.title)
                setArticleBody(data.body)
                setScores(data.scores)
              }

              if (currentEvent === "pipeline_error") {
                setError(data.error)
              }

            } catch (e) {
              // skip malformed lines
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-2 text-white">
        Content Ops Pipeline
      </h1>
      <p className="text-slate-400 mb-8">
        Multi-agent content generation with live fact checking
      </p>

      {/* ── Topic Input ── */}
      <div className="flex gap-4 mb-8">
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !isRunning && runPipeline()}
          placeholder="Enter a topic to write about..."
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={runPipeline}
          disabled={isRunning || !topic.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-lg transition-colors"
        >
          {isRunning ? "Running..." : "Run Pipeline"}
        </button>
      </div>

      {/* ── Main Layout ── */}
      <div className="grid grid-cols-2 gap-8">

        {/* ── Left: Pipeline Graph ── */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">
            Pipeline DAG
          </h2>
          <PipelineGraph nodeStatuses={nodeStatuses} />
        </div>

        {/* ── Right: Live Logs ── */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">
            Live Agent Logs
          </h2>
          <div className="h-[600px] overflow-y-auto space-y-2">
            {logs.length === 0 && (
              <p className="text-slate-500 text-sm">
                Logs will appear here when the pipeline runs...
              </p>
            )}
            {logs.map((log, i) => (
              <div
                key={i}
                className={`rounded-lg px-4 py-2 text-sm font-mono ${
                  log.status === "running"
                    ? "bg-blue-950 border border-blue-800 text-blue-300"
                    : log.status === "complete"
                    ? "bg-green-950 border border-green-800 text-green-300"
                    : "bg-red-950 border border-red-800 text-red-300"
                }`}
              >
                <span className="font-bold">{log.agent}</span>
                {log.status === "running" && " → running..."}
                {log.status === "complete" && ` → done in ${log.duration_ms}ms`}
                {log.status === "error" && " → error"}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* ── Results Section ── */}
      {(finalTitle || scores || error) && (
        <div className="mt-8 bg-slate-900 rounded-xl p-6 border border-slate-700">

          {error && (
            <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300">
              <span className="font-bold">Error:</span> {error}
            </div>
          )}

          {finalTitle && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-200 mb-2">
                Published Article
              </h2>
              <p className="text-2xl font-bold text-white mb-6">{finalTitle}</p>
              {articleBody && (
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-600 prose prose-invert prose-slate max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-2xl font-bold text-white mt-6 mb-3">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-6 mb-3">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-lg font-bold text-slate-200 mt-4 mb-2">{children}</h3>,
                      p: ({ children }) => <p className="text-slate-300 leading-relaxed mb-4">{children}</p>,
                      strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                          {children}
                        </a>
                      ),
                      ul: ({ children }) => <ul className="list-disc list-inside text-slate-300 mb-4 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside text-slate-300 mb-4 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-slate-300">{children}</li>,
                    }}
                  >
                    {articleBody}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {scores && (
            <div>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">
                Supervisor Scores
              </h2>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(scores).map(([key, value]) => (
                  <div
                    key={key}
                    className="bg-slate-800 rounded-lg p-4 text-center border border-slate-600"
                  >
                    <p className="text-slate-400 text-sm capitalize mb-1">{key}</p>
                    <p className={`text-3xl font-bold ${
                      value >= 8 ? "text-green-400" :
                      value >= 6 ? "text-yellow-400" :
                      "text-red-400"
                    }`}>
                      {value}
                    </p>
                    <p className="text-slate-500 text-xs">/ 10</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
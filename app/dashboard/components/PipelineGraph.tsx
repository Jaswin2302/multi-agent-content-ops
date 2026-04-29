"use client"
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  BackgroundVariant
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// ── Node status types ────────────────────────────────────
type NodeStatus = "idle" | "running" | "complete" | "error"

// ── Props the component receives ─────────────────────────
interface PipelineGraphProps {
  nodeStatuses: Record<string, NodeStatus>
}

// ── Color mapping per status ─────────────────────────────
function getNodeStyle(status: NodeStatus) {
  switch (status) {
    case "running":
      return {
        background: "#1d4ed8",
        border: "2px solid #3b82f6",
        color: "white",
        borderRadius: "12px",
        padding: "12px 20px",
        fontWeight: "bold",
        boxShadow: "0 0 20px #3b82f6"
      }
    case "complete":
      return {
        background: "#15803d",
        border: "2px solid #22c55e",
        color: "white",
        borderRadius: "12px",
        padding: "12px 20px",
        fontWeight: "bold",
        boxShadow: "0 0 12px #22c55e"
      }
    case "error":
      return {
        background: "#b91c1c",
        border: "2px solid #ef4444",
        color: "white",
        borderRadius: "12px",
        padding: "12px 20px",
        fontWeight: "bold",
        boxShadow: "0 0 12px #ef4444"
      }
    default:
      return {
        background: "#1e293b",
        border: "2px solid #475569",
        color: "#94a3b8",
        borderRadius: "12px",
        padding: "12px 20px",
        fontWeight: "bold"
      }
  }
}

// ── Status icon per status ───────────────────────────────
function getStatusIcon(status: NodeStatus) {
  switch (status) {
    case "running": return " ⟳"
    case "complete": return " ✓"
    case "error": return " ✗"
    default: return ""
  }
}

// ── Main component ───────────────────────────────────────
export default function PipelineGraph({ nodeStatuses }: PipelineGraphProps) {

  // ── Helper to get status for a node ──────────────────
  const getStatus = (key: string): NodeStatus => {
    return nodeStatuses[key] || nodeStatuses[`${key}_node`] || "idle"
  }

  // ── Define nodes ───────────────────────────────────────
  const nodes: Node[] = [
    {
      id: "researcher",
      position: { x: 250, y: 0 },
      data: {
        label: `🔍 Researcher${getStatusIcon(getStatus("researcher"))}`
      },
      style: getNodeStyle(getStatus("researcher"))
    },
    {
      id: "writer",
      position: { x: 250, y: 120 },
      data: {
        label: `✍️ Writer${getStatusIcon(getStatus("writer"))}`
      },
      style: getNodeStyle(getStatus("writer"))
    },
    {
      id: "fact_checker",
      position: { x: 250, y: 240 },
      data: {
        label: `🔎 Fact Checker${getStatusIcon(getStatus("fact_checker"))}`
      },
      style: getNodeStyle(getStatus("fact_checker"))
    },
    {
      id: "polisher",
      position: { x: 250, y: 360 },
      data: {
        label: `✨ Polisher${getStatusIcon(getStatus("polisher"))}`
      },
      style: getNodeStyle(getStatus("polisher"))
    },
    {
      id: "supervisor",
      position: { x: 250, y: 480 },
      data: {
        label: `👁️ Supervisor${getStatusIcon(getStatus("supervisor"))}`
      },
      style: getNodeStyle(getStatus("supervisor"))
    },
    {
      id: "human_review",
      position: { x: 550, y: 480 },
      data: { label: "👤 Human Review" },
      style: getNodeStyle(getStatus("human_review"))
    }
  ]

  // ── Define edges ────────────────────────────────────────
  const edges: Edge[] = [
    {
      id: "r-w",
      source: "researcher",
      target: "writer",
      animated: getStatus("researcher") === "complete",
      style: { stroke: "#475569" }
    },
    {
      id: "w-fc",
      source: "writer",
      target: "fact_checker",
      animated: getStatus("writer") === "complete",
      style: { stroke: "#475569" }
    },
    {
      id: "fc-p",
      source: "fact_checker",
      target: "polisher",
      label: "pass",
      animated: getStatus("fact_checker") === "complete",
      style: { stroke: "#475569" }
    },
    {
      id: "fc-w",
      source: "fact_checker",
      target: "writer",
      label: "revise",
      style: { stroke: "#f59e0b", strokeDasharray: "5,5" }
    },
    {
      id: "fc-r",
      source: "fact_checker",
      target: "researcher",
      label: "reject",
      style: { stroke: "#ef4444", strokeDasharray: "5,5" }
    },
    {
      id: "p-s",
      source: "polisher",
      target: "supervisor",
      animated: getStatus("polisher") === "complete",
      style: { stroke: "#475569" }
    },
    {
      id: "s-hr",
      source: "supervisor",
      target: "human_review",
      label: "escalate",
      style: { stroke: "#f59e0b", strokeDasharray: "5,5" }
    }
  ]

  return (
    <div
      style={{ width: "100%", height: "600px" }}
      className="[&_.react-flow__panel.react-flow__attribution]:hidden"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#334155"
        />
        <Controls />
      </ReactFlow>
    </div>
  )
}
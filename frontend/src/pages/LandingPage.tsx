import { Link, Navigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { applyNodeChanges, Edge, Handle, Node, NodeChange, NodeProps, Position } from "reactflow";
import "reactflow/dist/style.css";
import { useAuthStore } from "../store/authStore";

type ThemeMode = "light" | "dark";

// Stock nodes identical to the lab: colored border + glow + dot
const STOCK_COLOR_A = "#3b82f6"; // blue
const STOCK_COLOR_B = "#a855f7"; // violet

function LandingStockNode({ data }: NodeProps): JSX.Element {
  const color = String(data?.color ?? STOCK_COLOR_A);
  return (
    <div
      className="lab-stock-node"
      style={{ borderColor: color, "--stock-color": color } as React.CSSProperties}
    >
      <Handle id="tl" type="target" position={Position.Left} style={{ background: color, borderColor: color }} />
      <Handle id="sl" type="source" position={Position.Left} style={{ background: color, borderColor: color }} />
      <Handle id="tr" type="target" position={Position.Right} style={{ background: color, borderColor: color }} />
      <Handle id="sr" type="source" position={Position.Right} style={{ background: color, borderColor: color }} />
      <Handle id="sb" type="source" position={Position.Bottom} style={{ background: color, borderColor: color }} />
      <Handle id="tb" type="target" position={Position.Bottom} style={{ background: color, borderColor: color }} />
      <div className="lab-flow-node-dot" style={{ background: color, boxShadow: `0 0 10px ${color}66` }} />
      <div className="lab-node-content">
        <span className="lab-flow-node-title">{String(data?.label ?? "Stock")}</span>
        <span className="lab-node-meta">{String(data?.quantity ?? 0)}</span>
      </div>
    </div>
  );
}

// Flow node identical to the lab: pill shape with flow accent
function LandingFlowNode({ data }: NodeProps): JSX.Element {
  const accent = "var(--lab-flow-accent)";
  return (
    <div className="lab-flow-node">
      <Handle id="tl" type="target" position={Position.Left} style={{ background: accent, borderColor: accent }} />
      <Handle id="sl" type="source" position={Position.Left} style={{ background: accent, borderColor: accent }} />
      <Handle id="tr" type="target" position={Position.Right} style={{ background: accent, borderColor: accent }} />
      <Handle id="sr" type="source" position={Position.Right} style={{ background: accent, borderColor: accent }} />
      <Handle id="tb" type="target" position={Position.Bottom} style={{ background: accent, borderColor: accent }} />
      <Handle id="sb" type="source" position={Position.Bottom} style={{ background: accent, borderColor: accent }} />
      <div className="lab-node-content">
        <span className="lab-flow-node-title">{String(data?.label ?? "Flow")}</span>
        <span className="lab-node-meta">BN: {String(data?.bottleneck ?? 0)}</span>
      </div>
    </div>
  );
}

const demoNodes: Node[] = [
  {
    id: "stock-demand",
    type: "stockPreview",
    position: { x: 40, y: 80 },
    data: { label: "Demand", quantity: 240, color: STOCK_COLOR_A },
    draggable: true,
  },
  {
    id: "flow-production",
    type: "flowPreview",
    position: { x: 355, y: 205 },
    data: { label: "Production", bottleneck: 18 },
    draggable: true,
  },
  {
    id: "stock-inventory",
    type: "stockPreview",
    position: { x: 690, y: 80 },
    data: { label: "Inventory", quantity: 120, color: STOCK_COLOR_B },
    draggable: true,
  },
];

const demoEdges: Edge[] = [
  // Demand → left side of Production
  { id: "e1", source: "stock-demand", sourceHandle: "sr", target: "flow-production", targetHandle: "tl" },
  // right side of Production → Inventory
  { id: "e2", source: "flow-production", sourceHandle: "sr", target: "stock-inventory", targetHandle: "tl" },
  // Inventory feedback → bottom of Production (so it doesn't cross e1/e2)
  { id: "e3", source: "stock-inventory", sourceHandle: "sb", target: "flow-production", targetHandle: "sb" },
];

export function LandingPage(): JSX.Element {
  const token = useAuthStore((state) => state.token);
  const [previewNodes, setPreviewNodes] = useState<Node[]>(demoNodes);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("flowspace-theme");
    return saved === "dark" ? "dark" : "light";
  });
  const nodeTypes = useMemo(
    () => ({ stockPreview: LandingStockNode, flowPreview: LandingFlowNode }),
    [],
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => setPreviewNodes((n) => applyNodeChanges(changes, n)),
    [],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("flowspace-theme", theme);
  }, [theme]);

  if (token) return <Navigate to="/app/lessons" replace />;

  return (
    <div className="marketing-shell lp2-shell min-h-screen flex flex-col relative overflow-hidden">
      <div className="lp2-bg-grid" aria-hidden />
      <div className="lp2-bg-blob lp2-bg-blob-1" aria-hidden />
      <div className="lp2-bg-blob lp2-bg-blob-2" aria-hidden />

      <header className="marketing-nav lp2-nav">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="landing-brand">
            <img
              src={theme === "dark" ? "/images/flowspace_white.svg" : "/images/flowspace_black.svg"}
              alt="FlowSpace"
              className="landing-brand-logo"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="theme-toggle landing-theme-toggle"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            >
              <span className="theme-toggle-icon" aria-hidden="true">
                {theme === "dark" ? "☀" : "☾"}
              </span>
            </button>
            <Link to="/auth/login" className="btn-primary landing-login-btn">Login</Link>
            <Link to="/auth/register" className="btn-primary lp2-register-btn">Register</Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-stretch px-6 pb-6 pt-24 lg:pt-28">
        <div className="lp2-hero" style={{ minHeight: "calc(100vh - 200px)" }}>
          <section className="lp2-copy">
            <h1 className="lp2-title">
              Educational tool for <span className="lp2-title-accent">system thinking.</span>
            </h1>
            <p className="lp2-lead">
              Learn theory, build models, explore loops, and simulate dynamic behavior in a focused workspace.
            </p>
            <p className="lp2-lead">
              Structured lessons, interactive lab editor, and progress tracking.
            </p>
          </section>

          {/* Canvas — no card wrapper; nodes float on the page background */}
          <section className="lp2-canvas-bare">
            <ReactFlow
              className="lp2-flow"
              nodes={previewNodes}
              edges={demoEdges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              fitView
              proOptions={{ hideAttribution: true }}
            />
          </section>
        </div>
      </main>

      {/* Footer: no border, transparent fade */}
      <footer className="lp2-footer mono py-2 text-center text-[10px] tracking-[0.08em]">
        FLOWSPACE · DANIIAR SHERNIIAZOV · 2026
      </footer>
    </div>
  );
}

import { Link, Navigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { applyNodeChanges, Edge, Handle, Node, NodeChange, NodeProps, Position } from "reactflow";
import "reactflow/dist/style.css";
import { useAuthStore } from "../store/authStore";

type ThemeMode = "light" | "dark";

const demoNodes: Node[] = [
  { id: "stock-demand", type: "stockPreview", position: { x: 40, y: 80 }, data: { label: "STOCK: Demand" }, draggable: true },
  { id: "flow-production", type: "flowPreview", position: { x: 360, y: 210 }, data: { label: "FLOW: Production" }, draggable: true },
  { id: "stock-inventory", type: "stockPreview", position: { x: 700, y: 80 }, data: { label: "STOCK: Inventory" }, draggable: true },
];

const demoEdges: Edge[] = [
  { id: "e1", source: "stock-demand", target: "flow-production" },
  { id: "e2", source: "flow-production", target: "stock-inventory" },
  { id: "e3", source: "stock-inventory", target: "flow-production" },
];

function StockPreviewNode({ data }: NodeProps): JSX.Element {
  return (
    <div className="landing-stock-node">
      <Handle className="landing-flow-handle" type="target" position={Position.Left} />
      <Handle className="landing-flow-handle" type="source" position={Position.Right} />
      <span>{String(data?.label ?? "STOCK")}</span>
    </div>
  );
}

function FlowPreviewNode({ data }: NodeProps): JSX.Element {
  return (
    <div className="landing-flow-pill">
      <Handle className="landing-flow-handle" type="target" position={Position.Left} />
      <Handle className="landing-flow-handle" type="source" position={Position.Right} />
      <div className="landing-flow-pill-dot" />
      <span>{String(data?.label ?? "FLOW")}</span>
    </div>
  );
}

export function LandingPage(): JSX.Element {
  const token = useAuthStore((state) => state.token);
  const [previewNodes, setPreviewNodes] = useState<Node[]>(demoNodes);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("flowspace-theme");
    return saved === "dark" ? "dark" : "light";
  });
  const nodeTypes = useMemo(() => ({ stockPreview: StockPreviewNode, flowPreview: FlowPreviewNode }), []);
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => setPreviewNodes((nodes) => applyNodeChanges(changes, nodes)),
    [],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("flowspace-theme", theme);
  }, [theme]);

  if (token) {
    return <Navigate to="/app/lessons" replace />;
  }

  return (
    <div className="marketing-shell min-h-screen">
      <header className="marketing-nav">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-6">
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
            <Link to="/auth/register" className="btn-primary">Register</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-6 pb-10 pt-28 lg:grid-cols-[1fr_1.25fr]">
        <section className="landing-copy p-8">
          <h1 className="hero-title landing-hero-title text-white">Educational tool for system thinking.</h1>
          <p className="landing-lead mt-5 text-zinc-400">
            Learn theory, build models, explore loops, and simulate dynamic behavior in a focused workspace.
          </p>
          <p className="landing-lead mt-4 text-zinc-400">
            Structured lessons, interactive lab editor, and progress tracking.
          </p>
        </section>

        <section className="landing-canvas landing-canvas-seamless p-0">
          <div className="landing-preview-frame h-[460px]">
            <ReactFlow
              className="landing-flow"
              nodes={previewNodes}
              edges={demoEdges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              fitView
              proOptions={{ hideAttribution: true }}
            />
          </div>
        </section>
      </main>

      <footer className="mono mt-16 border-t border-zinc-900 py-5 text-center text-[11px] tracking-[0.12em] text-zinc-600">
        FLOWSPACE · DANIIAR SHERNIIAZOV · 2026
      </footer>
    </div>
  );
}

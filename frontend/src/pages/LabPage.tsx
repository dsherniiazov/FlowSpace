import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ReactFlow, { Background, BackgroundVariant, Controls, Edge, MiniMap, Node } from "reactflow";
import "reactflow/dist/style.css";

import { FlowNode } from "../components/FlowNode";
import { SimulationChart } from "../components/SimulationChart";
import { fetchRunSteps, runSimulation } from "../features/lab/api";
import { createSystem } from "../features/systems/api";
import { useAuthStore } from "../store/authStore";
import { useLabStore } from "../store/labStore";

export function LabPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("My dynamic system");
  const userId = useAuthStore((state) => state.userId);

  const {
    nodes,
    edges,
    steps,
    dt,
    algorithm,
    simulationSteps,
    sliderIndex,
    selectedNodeId,
    lockEditing,
    setSteps,
    setDt,
    setAlgorithm,
    setSliderIndex,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedNodeId,
    updateSelectedNode,
    addStock,
    addFlow,
    toGraphJson,
    clearSimulation,
    setSimulationSteps,
  } = useLabStore();

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const nodeTypes = useMemo(() => ({ flowNode: FlowNode }), []);

  const runMutation = useMutation({
    mutationFn: async () => {
      const run = await runSimulation({
        graph_json: toGraphJson(),
        dt,
        steps,
        engine_version: algorithm,
      });
      const runSteps = await fetchRunSteps(run.id);
      return runSteps;
    },
    onSuccess: (data) => setSimulationSteps(data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user id");
      return createSystem({ owner_id: userId, title, graph_json: toGraphJson() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systems"] });
    },
  });

  const displayedNodes: Node[] = useMemo(() => {
    if (simulationSteps.length === 0) return nodes;
    const snapshot = simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)];
    return nodes.map((node) => {
      const value = snapshot.values[node.id];
      if (value === undefined) return node;
      return {
        ...node,
        data: {
          ...node.data,
          label: `${String(node.data?.label ?? node.id)} | ${Number(value).toFixed(3)}`,
        },
      };
    });
  }, [nodes, simulationSteps, sliderIndex]);

  const displayedEdges: Edge[] = edges;

  return (
    <section className="lab-editor-shell">
      <div className="lab-editor-grid" />
      <aside className="lab-glass-panel lab-side-panel space-y-4">
        <h3 className="lab-panel-title">Simulation</h3>

        <label className="block text-sm lab-field">
          Steps
          <input className="lab-input mt-1" type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} min={1} />
        </label>

        <label className="block text-sm lab-field">
          dt
          <input className="lab-input mt-1" type="number" value={dt} step={0.01} onChange={(e) => setDt(Number(e.target.value))} min={0.001} />
        </label>

        <label className="block text-sm lab-field">
          Solver
          <select className="lab-input mt-1" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as "euler_v2" | "rk4_v2")}>
            <option value="euler_v2">Euler</option>
            <option value="rk4_v2">RK4</option>
          </select>
        </label>

        <button className="lab-btn lab-btn-primary w-full" onClick={() => runMutation.mutate()}>
          {runMutation.isPending ? "Running..." : "Run simulation"}
        </button>
        <button className="lab-btn lab-btn-secondary w-full" onClick={() => clearSimulation()}>Reset simulation</button>

        <div className="lab-divider pt-4">
          <label className="mb-1 block text-sm lab-field">Timeline</label>
          <input
            className="lab-range w-full"
            type="range"
            min={0}
            max={Math.max(0, simulationSteps.length - 1)}
            value={Math.min(sliderIndex, Math.max(0, simulationSteps.length - 1))}
            onChange={(e) => setSliderIndex(Number(e.target.value))}
            disabled={simulationSteps.length === 0}
          />
          <div className="mt-2 text-xs lab-muted">
            {simulationSteps.length ? `Step ${sliderIndex + 1} / ${simulationSteps.length}` : "Run simulation to enable slider"}
          </div>
        </div>

        <div className="lab-divider pt-4">
          <label className="mb-1 block text-sm lab-field">System title</label>
          <input className="lab-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="lab-btn lab-btn-secondary mt-2 w-full" onClick={() => saveMutation.mutate()}>
            Save system
          </button>
        </div>
      </aside>

      <div className="lab-glass-panel lab-canvas-wrap">
        <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-white/10">
          <ReactFlow
            className="lab-reactflow"
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} color="#23242a" gap={24} size={1} />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <aside className="lab-glass-panel lab-side-panel space-y-4 overflow-y-auto">
        <h3 className="lab-panel-title">Editor</h3>
        <div className="flex gap-2">
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addStock} disabled={lockEditing}>+ Stock</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addFlow} disabled={lockEditing}>+ Flow</button>
        </div>

        <div className="text-xs lab-muted">
          {lockEditing
            ? "Node editing is locked during simulation playback. Reset simulation to edit."
            : "Select a node to edit parameters."}
        </div>

        {selectedNode ? (
          <div className="space-y-2">
            <div className="text-sm lab-field">Node: {selectedNode.id}</div>
            <input
              className="lab-input"
              disabled={lockEditing}
              value={String(selectedNode.data?.label ?? "")}
              onChange={(e) => updateSelectedNode({ label: e.target.value })}
              placeholder="Label"
            />
            <input
              className="lab-input"
              disabled={lockEditing}
              type="number"
              value={Number(selectedNode.data?.initial ?? 0)}
              onChange={(e) => updateSelectedNode({ initial: Number(e.target.value) })}
              placeholder="Initial"
            />
            <input
              className="lab-input"
              disabled={lockEditing}
              type="number"
              value={Number(selectedNode.data?.decay ?? 0.1)}
              onChange={(e) => updateSelectedNode({ decay: Number(e.target.value) })}
              placeholder="Decay"
            />
            <input
              className="lab-input"
              disabled={lockEditing}
              type="number"
              value={Number(selectedNode.data?.bias ?? 0)}
              onChange={(e) => updateSelectedNode({ bias: Number(e.target.value) })}
              placeholder="Bias"
            />
          </div>
        ) : null}

        <div className="lab-divider pt-3">
          <SimulationChart steps={simulationSteps} focusIndex={sliderIndex} />
        </div>
      </aside>
    </section>
  );
}

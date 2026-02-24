import { create } from "zustand";
import {
  Connection,
  Edge,
  Node,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  EdgeChange,
  NodeChange,
} from "reactflow";
import { RunStep } from "../types/api";

type LabState = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  steps: number;
  dt: number;
  algorithm: "euler_v2" | "rk4_v2";
  simulationSteps: RunStep[];
  sliderIndex: number;
  lockEditing: boolean;
  setSteps: (value: number) => void;
  setDt: (value: number) => void;
  setAlgorithm: (value: "euler_v2" | "rk4_v2") => void;
  setSliderIndex: (value: number) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setSelectedNodeId: (id: string | null) => void;
  updateSelectedNode: (patch: Record<string, unknown>) => void;
  addStock: () => void;
  addFlow: () => void;
  setSimulationSteps: (steps: RunStep[]) => void;
  clearSimulation: () => void;
  toGraphJson: () => Record<string, unknown>;
  loadGraphJson: (graph: Record<string, unknown>) => void;
};

const initialNodes: Node[] = [
  {
    id: "stock_1",
    type: "default",
    position: { x: 260, y: 180 },
    data: { label: "Stock A", initial: 1, decay: 0.2, bias: 0.0 },
  },
  {
    id: "stock_2",
    type: "default",
    position: { x: 560, y: 250 },
    data: { label: "Stock B", initial: 0.5, decay: 0.05, bias: 0.0 },
  },
  {
    id: "flow_1",
    type: "flowNode",
    position: { x: 420, y: 130 },
    data: { label: "Flow 1", initial: 0, decay: 0, bias: 0 },
  },
];

const initialEdges: Edge[] = [
  { id: "edge_1", source: "stock_1", target: "flow_1", label: "0.1", data: { weight: 0.1 } },
  { id: "edge_2", source: "flow_1", target: "stock_2", label: "0.1", data: { weight: 0.1 } },
];

export const useLabStore = create<LabState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  steps: 60,
  dt: 0.1,
  algorithm: "euler_v2",
  simulationSteps: [],
  sliderIndex: 0,
  lockEditing: false,

  setSteps: (value) => set({ steps: Math.max(1, value) }),
  setDt: (value) => set({ dt: Math.max(0.001, value) }),
  setAlgorithm: (value) => set({ algorithm: value }),
  setSliderIndex: (value) => set({ sliderIndex: Math.max(0, value) }),

  onNodesChange: (changes) => {
    if (get().lockEditing) return;
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },
  onEdgesChange: (changes) => {
    if (get().lockEditing) return;
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },
  onConnect: (connection) => {
    if (get().lockEditing) return;
    const nextEdgeId = `edge_${Date.now()}`;
    set({
      edges: addEdge(
        {
          ...connection,
          id: nextEdgeId,
          label: "0.1",
          data: { weight: 0.1 },
        },
        get().edges,
      ),
    });
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  updateSelectedNode: (patch) => {
    if (get().lockEditing) return;
    const selectedNodeId = get().selectedNodeId;
    if (!selectedNodeId) return;
    set({
      nodes: get().nodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            }
          : node,
      ),
    });
  },

  addStock: () => {
    if (get().lockEditing) return;
    const stockCount = get().nodes.filter((node) => node.id.startsWith("stock_")).length;
    const index = stockCount + 1;
    const id = `stock_${index}`;
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          position: { x: 200 + index * 30, y: 120 + index * 25 },
          data: { label: `Stock ${index}`, initial: 0, decay: 0.1, bias: 0 },
        },
      ],
    });
  },

  addFlow: () => {
    if (get().lockEditing) return;
    const flowCount = get().nodes.filter((node) => node.id.startsWith("flow_")).length;
    const index = flowCount + 1;
    const id = `flow_${index}`;
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          type: "flowNode",
          position: { x: 300 + index * 35, y: 140 + index * 20 },
          data: { label: `Flow ${index}`, initial: 0, decay: 0, bias: 0 },
        },
      ],
    });
  },

  setSimulationSteps: (steps) =>
    set({
      simulationSteps: steps,
      sliderIndex: 0,
      lockEditing: steps.length > 0,
    }),

  clearSimulation: () => set({ simulationSteps: [], sliderIndex: 0, lockEditing: false }),

  toGraphJson: () => {
    const nodes = get().nodes.map((node) => ({
      id: node.id,
      kind: String(node.type ?? "default"),
      initial: Number(node.data?.initial ?? 0),
      decay: Number(node.data?.decay ?? 0.1),
      bias: Number(node.data?.bias ?? 0),
      label: String(node.data?.label ?? node.id),
    }));
    const edges = get().edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      weight: Number(edge.data?.weight ?? edge.label ?? 0.1),
    }));
    return { nodes, edges };
  },

  loadGraphJson: (graph) => {
    const rawNodes = Array.isArray(graph.nodes) ? (graph.nodes as Array<Record<string, unknown>>) : [];
    const rawEdges = Array.isArray(graph.edges) ? (graph.edges as Array<Record<string, unknown>>) : [];

    const nodes: Node[] = rawNodes.map((item, index) => ({
      id: String(item.id ?? `stock_${index + 1}`),
      type: String(item.kind ?? "default"),
      position: {
        x: Number(item.x ?? 160 + index * 40),
        y: Number(item.y ?? 140 + index * 30),
      },
      data: {
        label: String(item.label ?? item.id ?? `Stock ${index + 1}`),
        initial: Number(item.initial ?? 0),
        decay: Number(item.decay ?? 0.1),
        bias: Number(item.bias ?? 0),
      },
    }));

    const edges: Edge[] = rawEdges.map((item, index) => ({
      id: String(item.id ?? `edge_${index + 1}`),
      source: String(item.source),
      target: String(item.target),
      label: String(item.weight ?? 0.1),
      data: { weight: Number(item.weight ?? 0.1) },
    }));

    set({ nodes, edges, simulationSteps: [], sliderIndex: 0, lockEditing: false });
  },
}));

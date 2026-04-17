import { Edge, Node } from "reactflow";

import { getStockColorPresets } from "../uiPreferencesStore";

export function buildInitialNodes(): Node[] {
  const stockColors = getStockColorPresets();
  return [
    {
      id: "stock_1",
      type: "stockNode",
      position: { x: 260, y: 180 },
      data: { label: "Stock A", quantity: 100, unit: "", color: stockColors[0] },
    },
    {
      id: "stock_2",
      type: "stockNode",
      position: { x: 560, y: 250 },
      data: { label: "Stock B", quantity: 50, unit: "", color: stockColors[1] ?? stockColors[0] },
    },
    {
      id: "flow_1",
      type: "flowNode",
      position: { x: 420, y: 130 },
      data: { label: "Flow 1", bottleneck: 10, unit: "" },
    },
  ];
}

export const INITIAL_EDGES: Edge[] = [
  { id: "edge_1", source: "stock_1", target: "flow_1", label: "-", data: { kind: "outflow", weight: -1 } },
  { id: "edge_2", source: "flow_1", target: "stock_2", label: "+", data: { kind: "inflow", weight: 1 } },
];

import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";

import { matchesShortcutEvent, useShortcutStore } from "../../../store/shortcutStore";
import {
  cloneEdges,
  cloneNodes,
  isDomTextInputTarget,
  pastedGraphId,
  sameIdList,
} from "../utils";

type UseLabSelectionClipboardArgs = {
  nodes: Node[];
  edges: Edge[];
  nodesById: Map<string, Node>;
  lockEditing: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  replaceGraph: (nodes: Node[], edges: Edge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  onSave: () => void;
  undo: () => void;
  redo: () => void;
};

export function useLabSelectionClipboard({
  nodes,
  edges,
  nodesById,
  lockEditing,
  selectedNodeId,
  selectedEdgeId,
  replaceGraph,
  setSelectedNodeId,
  setSelectedEdgeId,
  onSave,
  undo,
  redo,
}: UseLabSelectionClipboardArgs) {
  const shortcutBindings = useShortcutStore((state) => state.bindings);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [pasteCounter, setPasteCounter] = useState(0);

  function getEffectiveSelection(): { nodeIds: string[]; edgeIds: string[] } {
    const nodeIds = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    const edgeIds = selectedEdgeIds.length ? selectedEdgeIds : selectedEdgeId ? [selectedEdgeId] : [];
    return { nodeIds, edgeIds };
  }

  function clearSelection(): void {
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  function copySelection(): void {
    const { nodeIds, edgeIds } = getEffectiveSelection();
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    const nodeSet = new Set(nodeIds);
    const copiedNodes = nodes.filter((node) => nodeSet.has(node.id));
    const copiedEdges = edges.filter((edge) => edgeIds.includes(edge.id) || (nodeSet.has(edge.source) && nodeSet.has(edge.target)));
    clipboardRef.current = { nodes: cloneNodes(copiedNodes), edges: cloneEdges(copiedEdges) };
  }

  function deleteSelection(): void {
    if (lockEditing) return;
    const { nodeIds, edgeIds } = getEffectiveSelection();
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    const nodeSet = new Set(nodeIds.filter((id) => nodesById.get(id)?.data?.feedbackLoopPersistent !== true));
    const edgeSet = new Set(edgeIds.filter((id) => !edges.find((edge) => edge.id === id)?.data?.feedbackLoopPersistent));
    const nextNodes = nodes.filter((node) => !nodeSet.has(node.id));
    const nextEdges = edges.filter((edge) => !edgeSet.has(edge.id) && !nodeSet.has(edge.source) && !nodeSet.has(edge.target));
    replaceGraph(nextNodes, nextEdges);
    clearSelection();
  }

  function pasteSelection(): void {
    if (lockEditing) return;
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    const nextPasteCounter = pasteCounter + 1;
    setPasteCounter(nextPasteCounter);
    const stamp = Date.now();
    const idMap = new Map<string, string>();
    for (const node of clip.nodes) {
      idMap.set(node.id, pastedGraphId(node.id, stamp, nextPasteCounter));
    }
    const offset = 26 * nextPasteCounter;
    const newNodes = clip.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? pastedGraphId(node.id, stamp, nextPasteCounter),
      selected: false,
      position: { x: node.position.x + offset, y: node.position.y + offset },
      data: { ...(node.data ?? {}) },
    }));
    const newEdges: Edge[] = [];
    for (const edge of clip.edges) {
      const mappedSource = idMap.get(edge.source);
      const mappedTarget = idMap.get(edge.target);
      if (!mappedSource || !mappedTarget) continue;
      newEdges.push({
        ...edge,
        id: pastedGraphId(edge.id, stamp, nextPasteCounter),
        selected: false,
        source: mappedSource,
        target: mappedTarget,
        data: { ...(edge.data ?? {}) },
      });
    }
    replaceGraph([...nodes, ...newNodes], [...edges, ...newEdges]);
    setSelectedNodeIds(newNodes.map((node) => node.id));
    setSelectedEdgeIds(newEdges.map((edge) => edge.id));
  }

  function cutSelection(): void {
    copySelection();
    deleteSelection();
  }

  function copySingleNode(nodeId: string): void {
    if (lockEditing) return;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    clipboardRef.current = { nodes: cloneNodes([node]), edges: [] };
    pasteSelection();
  }

  function deleteSingleNode(nodeId: string): void {
    if (lockEditing) return;
    const node = nodesById.get(nodeId);
    if (node?.data?.feedbackLoopPersistent === true) return;
    const nextNodes = nodes.filter((item) => item.id !== nodeId);
    const nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
    replaceGraph(nextNodes, nextEdges);
    clearSelection();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const inTextField = isDomTextInputTarget(event.target);
      if (!inTextField && matchesShortcutEvent(event, shortcutBindings.delete_selection)) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.save_system)) {
        event.preventDefault();
        onSave();
        return;
      }
      if (inTextField) return;
      if (matchesShortcutEvent(event, shortcutBindings.undo_graph)) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.copy_selection)) {
        event.preventDefault();
        copySelection();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.cut_selection)) {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.paste_selection)) {
        event.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const nextNodeIds = selectedNodes.map((node) => node.id).sort();
      const nextEdgeIds = selectedEdges.map((edge) => edge.id).sort();
      setSelectedNodeIds((prev) => (sameIdList(prev, nextNodeIds) ? prev : nextNodeIds));
      setSelectedEdgeIds((prev) => (sameIdList(prev, nextEdgeIds) ? prev : nextEdgeIds));
      if (selectedNodes.length >= 2) {
        const canvasEl = document.querySelector('[data-tutorial="canvas"]');
        canvasEl?.dispatchEvent(new CustomEvent("fs-multi-selected", { bubbles: true }));
      }
      if (selectedNodes.length === 1 && selectedEdges.length === 0) {
        const onlyId = selectedNodes[0].id;
        if (selectedNodeId !== onlyId) setSelectedNodeId(onlyId);
        return;
      }
      if (selectedEdges.length === 1 && selectedNodes.length === 0) {
        const onlyId = selectedEdges[0].id;
        if (selectedEdgeId !== onlyId) setSelectedEdgeId(onlyId);
        return;
      }
      if (selectedNodes.length === 0 && selectedEdges.length === 0) {
        if (selectedNodeId !== null) setSelectedNodeId(null);
        else if (selectedEdgeId !== null) setSelectedEdgeId(null);
      }
    },
    [selectedNodeId, selectedEdgeId, setSelectedNodeId, setSelectedEdgeId],
  );

  return {
    selectedNodeIds,
    selectedEdgeIds,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    clearSelection,
    copySingleNode,
    deleteSingleNode,
    handleSelectionChange,
  };
}

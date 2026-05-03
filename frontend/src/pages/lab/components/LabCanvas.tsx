import type {
  Connection,
  Edge,
  EdgeChange,
  EdgeTypes,
  Node,
  NodeChange,
  NodeTypes,
  ReactFlowInstance,
  Viewport,
} from "reactflow";
import ReactFlow, { Background, BackgroundVariant } from "reactflow";

import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from "../constants";
import { CanvasToolbar } from "./CanvasToolbar";
import { CommentEntryOverlay } from "./CommentEntryOverlay";
import { LabContextMenu } from "./LabContextMenu";

type ContextMenuState = {
  screenX: number;
  screenY: number;
  flowX: number;
  flowY: number;
};

type LabCanvasProps = {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  isLightTheme: boolean;
  canvasLocked: boolean;
  zoomPercent: number;
  canUndo: boolean;
  canRedo: boolean;
  contextMenu: ContextMenuState | null;
  addCommentNodeId: string | null;
  commentDraft: string;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection) => boolean;
  onSelectionChange: (selection: { nodes: Node[]; edges: Edge[] }) => void;
  onNodeClick: (node: Node) => void;
  onEdgeClick: (edge: Edge) => void;
  onPaneClick: () => void;
  onPaneContextMenu: (event: React.MouseEvent) => void;
  onInit: (instance: ReactFlowInstance) => void;
  onMove: (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleCanvasLock: () => void;
  onExport: () => void;
  onOpenHelp: () => void;
  onContextMenuAddNode: (type: "stock" | "flow" | "commentNode") => void;
  onDismissContextMenu: () => void;
  onCommentDraftChange: (value: string) => void;
  onSaveComment: () => void;
  onCancelComment: () => void;
};

export function LabCanvas({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  isLightTheme,
  canvasLocked,
  zoomPercent,
  canUndo,
  canRedo,
  contextMenu,
  addCommentNodeId,
  commentDraft,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onSelectionChange,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onPaneContextMenu,
  onInit,
  onMove,
  onUndo,
  onRedo,
  onZoomReset,
  onZoomIn,
  onZoomOut,
  onToggleCanvasLock,
  onExport,
  onOpenHelp,
  onContextMenuAddNode,
  onDismissContextMenu,
  onCommentDraftChange,
  onSaveComment,
  onCancelComment,
}: LabCanvasProps): JSX.Element {
  return (
    <>
      <div className="lab-canvas-wrap" data-tutorial="canvas">
        <div className="h-full w-full min-h-0 overflow-hidden">
          <ReactFlow
            className="lab-reactflow"
            style={{ background: isLightTheme ? "#ffffff" : "transparent" }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={onSelectionChange}
            onNodeClick={(_, node) => onNodeClick(node)}
            onEdgeClick={(_, edge) => onEdgeClick(edge)}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onInit={onInit}
            onMove={onMove}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            panOnDrag={!canvasLocked}
            panOnScroll={!canvasLocked}
            zoomOnScroll={!canvasLocked}
            zoomOnPinch={!canvasLocked}
            zoomOnDoubleClick={!canvasLocked}
            selectionOnDrag
            selectionKeyCode="Shift"
            multiSelectionKeyCode={["Control", "Meta", "Shift"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color={isLightTheme ? "#d1d5db" : "#2b2b2b"}
              gap={24}
              size={1}
            />
          </ReactFlow>
        </div>
      </div>

      <LabContextMenu
        position={contextMenu ? { screenX: contextMenu.screenX, screenY: contextMenu.screenY } : null}
        onAdd={onContextMenuAddNode}
        onDismiss={onDismissContextMenu}
      />

      <CommentEntryOverlay
        isOpen={Boolean(addCommentNodeId)}
        draft={commentDraft}
        onDraftChange={onCommentDraftChange}
        onSave={onSaveComment}
        onCancel={onCancelComment}
      />

      <CanvasToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        canvasLocked={canvasLocked}
        zoomPercent={zoomPercent}
        onUndo={onUndo}
        onRedo={onRedo}
        onZoomReset={onZoomReset}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onToggleCanvasLock={onToggleCanvasLock}
        onExport={onExport}
        onOpenHelp={onOpenHelp}
      />
    </>
  );
}

export function initializeCanvasZoom(instance: ReactFlowInstance): void {
  instance.zoomTo(DEFAULT_ZOOM, { duration: 0 });
}

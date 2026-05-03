import type { Edge, Node } from "reactflow";

import type { FeedbackLoop } from "../../../store/labStore";
import type { ColorblindMode, LabColorTokens } from "../../../store/uiPreferencesStore";
import type { RunStep } from "../../../types/api";
import type { ControlOp } from "../types";
import { AddNodeControls } from "./AddNodeControls";
import { ChartPanel } from "./ChartPanel";
import { EdgePropertiesPanel } from "./EdgePropertiesPanel";
import { FeedbackLoopDetails } from "./FeedbackLoopDetails";
import { FeedbackLoopList, type FeedbackLoopListItem } from "./FeedbackLoopList";
import { NodePropertiesPanel } from "./NodePropertiesPanel";
import { SystemActionsPanel } from "./SystemActionsPanel";

type EditorSidePanelProps = {
  title: string;
  activeSystemId: number | null;
  isAdmin: boolean;
  isReviewingAsTeacher: boolean;
  lockEditing: boolean;
  saveAttempted: boolean;
  saveBlockedReason: string | null;
  saveDisabledNoChanges: boolean;
  saveButtonDisabled: boolean;
  isSaveError: boolean;
  isSubmitForReviewPending: boolean;
  isSubmitForReviewSuccess: boolean;
  isMarkReviewedPending: boolean;
  selectedNode: Node | null;
  selectedNodeLoop: FeedbackLoop | null;
  selectedNodeLoopRoleLabel: string | null;
  selectedNodeNumericInput: string;
  selectedNodeIsControlSource: boolean;
  selectedNodeOp: ControlOp;
  isSelectedStock: boolean;
  selectedEdge: Edge | null;
  selectedEdgeIsControl: boolean;
  selectedEdgeOp: ControlOp;
  stockColorPresets: string[];
  colorblindMode: ColorblindMode;
  labColorTokens: LabColorTokens;
  nodesById: Map<string, Node>;
  feedbackLoopList: FeedbackLoopListItem[];
  simulationSteps: RunStep[];
  sliderIndex: number;
  isLightTheme: boolean;
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
  chartFocusedNodeIds: string[];
  onTitleChange: (value: string) => void;
  onSave: () => void;
  onCreateNewSystem: () => void;
  onSubmitForReview: () => void;
  onOpenReviewModal: () => void;
  onAddStock: () => void;
  onAddFlow: () => void;
  onAddConstant: () => void;
  onAddVariable: () => void;
  onNumericInputChange: (value: string) => void;
  onCommitNumericInput: () => void;
  onUpdateNode: (patch: Record<string, unknown>) => void;
  onSetControlOp: (op: ControlOp) => void;
  onCopyNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onCreateFeedbackLoop: (nodeId: string) => void;
  onEditFeedbackLoop: (loopId: string) => void;
  onDeleteFeedbackLoop: (loopId: string) => void;
  onUpdateEdge: (patch: Record<string, unknown>) => void;
  onOpenChartModal: () => void;
  onSliderIndexChange: (value: number) => void;
};

export function EditorSidePanel(props: EditorSidePanelProps): JSX.Element {
  const {
    title,
    activeSystemId,
    isAdmin,
    isReviewingAsTeacher,
    lockEditing,
    saveAttempted,
    saveBlockedReason,
    saveDisabledNoChanges,
    saveButtonDisabled,
    isSaveError,
    isSubmitForReviewPending,
    isSubmitForReviewSuccess,
    isMarkReviewedPending,
    selectedNode,
    selectedNodeLoop,
    selectedNodeLoopRoleLabel,
    selectedNodeNumericInput,
    selectedNodeIsControlSource,
    selectedNodeOp,
    isSelectedStock,
    selectedEdge,
    selectedEdgeIsControl,
    selectedEdgeOp,
    stockColorPresets,
    colorblindMode,
    labColorTokens,
    nodesById,
    feedbackLoopList,
    simulationSteps,
    sliderIndex,
    isLightTheme,
    nodes,
    edges,
    feedbackLoops,
    chartFocusedNodeIds,
  } = props;

  return (
    <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-right lab-floating-panel-editor space-y-4">
      <h3 className="lab-panel-title">Editor</h3>
      <SystemActionsPanel
        title={title}
        activeSystemId={activeSystemId}
        isAdmin={isAdmin}
        isReviewingAsTeacher={isReviewingAsTeacher}
        lockEditing={lockEditing}
        saveAttempted={saveAttempted}
        saveBlockedReason={saveBlockedReason}
        saveDisabledNoChanges={saveDisabledNoChanges}
        saveButtonDisabled={saveButtonDisabled}
        isSaveError={isSaveError}
        isSubmitForReviewPending={isSubmitForReviewPending}
        isSubmitForReviewSuccess={isSubmitForReviewSuccess}
        isMarkReviewedPending={isMarkReviewedPending}
        onTitleChange={props.onTitleChange}
        onSave={props.onSave}
        onCreateNewSystem={props.onCreateNewSystem}
        onSubmitForReview={props.onSubmitForReview}
        onOpenReviewModal={props.onOpenReviewModal}
      />
      <AddNodeControls
        lockEditing={lockEditing}
        onAddStock={props.onAddStock}
        onAddFlow={props.onAddFlow}
        onAddConstant={props.onAddConstant}
        onAddVariable={props.onAddVariable}
      />

      {selectedNode && selectedNodeLoop ? (
        <FeedbackLoopDetails
          loop={selectedNodeLoop}
          roleLabel={selectedNodeLoopRoleLabel}
          nodesById={nodesById}
          lockEditing={lockEditing}
          onEdit={props.onEditFeedbackLoop}
          onDelete={props.onDeleteFeedbackLoop}
        />
      ) : selectedNode ? (
        <NodePropertiesPanel
          selectedNode={selectedNode}
          selectedNodeNumericInput={selectedNodeNumericInput}
          selectedNodeIsControlSource={selectedNodeIsControlSource}
          selectedNodeOp={selectedNodeOp}
          isSelectedStock={isSelectedStock}
          stockColorPresets={stockColorPresets}
          colorblindMode={colorblindMode}
          labColorTokens={labColorTokens}
          lockEditing={lockEditing}
          onNumericInputChange={props.onNumericInputChange}
          onCommitNumericInput={props.onCommitNumericInput}
          onUpdateNode={props.onUpdateNode}
          onSetControlOp={props.onSetControlOp}
          onCopyNode={props.onCopyNode}
          onDeleteNode={props.onDeleteNode}
          onCreateFeedbackLoop={props.onCreateFeedbackLoop}
        />
      ) : null}

      <FeedbackLoopList
        loops={feedbackLoopList}
        lockEditing={lockEditing}
        onEdit={props.onEditFeedbackLoop}
        onDelete={props.onDeleteFeedbackLoop}
      />
      <EdgePropertiesPanel
        selectedEdge={selectedEdge}
        selectedEdgeIsControl={selectedEdgeIsControl}
        selectedEdgeOp={selectedEdgeOp}
        lockEditing={lockEditing}
        onUpdateEdge={props.onUpdateEdge}
      />
      <ChartPanel
        steps={simulationSteps}
        focusIndex={sliderIndex}
        isLightTheme={isLightTheme}
        nodes={nodes}
        edges={edges}
        feedbackLoops={feedbackLoops}
        focusedNodeIds={chartFocusedNodeIds}
        onExpand={props.onOpenChartModal}
        onFocusIndexChange={props.onSliderIndexChange}
      />
    </aside>
  );
}

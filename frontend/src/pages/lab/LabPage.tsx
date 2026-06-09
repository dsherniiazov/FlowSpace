import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Connection, ReactFlowInstance, Viewport } from "reactflow";
import { useLocation, useNavigate } from "react-router-dom";
import "reactflow/dist/style.css";

import { ConstantNode } from "../../components/ConstantNode";
import { CommentNode } from "../../components/CommentNode";
import { FeedbackLoopModal } from "../../components/FeedbackLoopModal";
import { FlowNode } from "../../components/FlowNode";
import { StockNode } from "../../components/StockNode";
import { VariableNode } from "../../components/VariableNode";
import { AnimatedParticleEdge } from "../../components/AnimatedParticleEdge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { fetchSystems, markSystemChangesSeen } from "../../features/systems/api";
import { fetchUserById } from "../../features/users/api";
import { MarkReviewedModal } from "../../components/MarkReviewedModal";
import { LabHelpModal } from "../../components/LabHelpModal";
import { useAuthStore } from "../../store/authStore";
import { isFeedbackLoopActionNode, isValidLabConnection, useLabStore } from "../../store/labStore";
import { getLabColorTokens, useUiPreferencesStore } from "../../store/uiPreferencesStore";
import { useTutorialStore } from "../../store/tutorialStore";

import { ControlOp, CONTROL_OPS, LabTaskContext } from "./types";
import {
  isConstantNode,
  isFlowNode,
  isVariableNode,
  parseNumericString,
} from "./utils";
import { DEFAULT_ZOOM } from "./constants";
import { ChartModal } from "./components/ChartModal";
import { ConfirmNewSystemModal } from "./components/ConfirmNewSystemModal";
import { EditorSidePanel } from "./components/EditorSidePanel";
import { LabCanvas, initializeCanvasZoom } from "./components/LabCanvas";
import { LabLeftPanel } from "./components/LabLeftPanel";
import { TaskModal } from "./components/TaskModal";
import { exportGraphAsJson } from "./exportGraph";
import { useActiveSystemGraph } from "./hooks/useActiveSystemGraph";
import { useDocumentTheme } from "./hooks/useDocumentTheme";
import { useFeedbackLoopEditor } from "./hooks/useFeedbackLoopEditor";
import { useLabNavigationState } from "./hooks/useLabNavigationState";
import { useLessonTaskFlow } from "./hooks/useLessonTaskFlow";
import { useLabSystemPersistence } from "./hooks/useLabSystemPersistence";
import { useLabDisplay } from "./hooks/useLabDisplay";
import { useLabSelectionClipboard } from "./hooks/useLabSelectionClipboard";
import { useSimulationRunner } from "./hooks/useSimulationRunner";

export function LabPage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const colorblindMode = useUiPreferencesStore((state) => state.colorblindMode);
  const highContrastMode = useUiPreferencesStore((state) => state.highContrastMode);
  const labColorTokens = useMemo(() => getLabColorTokens(colorblindMode, highContrastMode), [colorblindMode, highContrastMode]);
  const stockColorPresets = labColorTokens.stockPresets;
  const [title, setTitle] = useState("My dynamic system");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isConfirmNewSystemOpen, setIsConfirmNewSystemOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [canvasLocked, setCanvasLocked] = useState(false);
  const [stepsInput, setStepsInput] = useState("60");
  const [dtInput, setDtInput] = useState("1");
  const [selectedNodeNumericInput, setSelectedNodeNumericInput] = useState("");
  const [lessonTaskContext, setLessonTaskContext] = useState<LabTaskContext | null>(null);
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; flowX: number; flowY: number } | null>(null);
  const [addCommentNodeId, setAddCommentNodeId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isReviewingAsTeacher, setIsReviewingAsTeacher] = useState(false);
  const [feedbackLoopPendingDeletion, setFeedbackLoopPendingDeletion] = useState<string | null>(null);
  const [feedbackLoopDeleteError, setFeedbackLoopDeleteError] = useState<string | null>(null);
  const { isLightTheme } = useDocumentTheme();
  const loadedSystemGraphIdRef = useRef<number | null>(null);
  const userId = useAuthStore((state) => state.userId);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const userEmail = useAuthStore((state) => state.email);
  const location = useLocation();

  const systemsQuery = useQuery({
    queryKey: ["systems", userId],
    queryFn: fetchSystems,
    enabled: !!userId,
  });
  const currentUserProfileQuery = useQuery({
    queryKey: ["profile-lab", userId],
    queryFn: async () => {
      if (!userId) return null;
      return fetchUserById(userId);
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const {
    nodes, edges, feedbackLoops, steps, dt, algorithm, simulationSteps, sliderIndex,
    selectedNodeId, selectedEdgeId, activeSystemId, lockEditing,
    setSteps, setDt, setAlgorithm, setSliderIndex, setLockEditing,
    onNodesChange, onEdgesChange, onConnect, setSelectedNodeId, setSelectedEdgeId,
    setActiveSystemId, updateSelectedNode, updateSelectedEdge, setSelectedNodeControlOp,
    addStock, addFlow, addConstant, addVariable, addNodeAtPosition,
    toGraphJson, clearSimulation, setSimulationSteps, replaceGraph, resetToInitialGraph,
    loadGraphJson, createBalancingFeedbackLoop, createReinforcingFeedbackLoop,
    updateBalancingFeedbackLoop, deleteBalancingFeedbackLoop,
    undo, redo,
  } = useLabStore();
  const canUndo = useLabStore((s) => s.past.length > 0);
  const canRedo = useLabStore((s) => s.future.length > 0);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);
  const isSelectedStock = selectedNode?.type === "stockNode";

  const selectedEdgeIsControl = useMemo(() => {
    if (!selectedEdge) return false;
    const sourceNode = nodes.find((node) => node.id === selectedEdge.source);
    const targetNode = nodes.find((node) => node.id === selectedEdge.target);
    const isFromControl = isConstantNode(sourceNode) || isVariableNode(sourceNode);
    if (!isFromControl || !targetNode) return false;
    if (
      (isFlowNode(targetNode) || isVariableNode(targetNode)) &&
      selectedEdge.data?.feedbackLoop !== true
    ) {
      return true;
    }
    if (isVariableNode(targetNode) && isFeedbackLoopActionNode(targetNode.id, feedbackLoops)) {
      return true;
    }
    return false;
  }, [nodes, selectedEdge, feedbackLoops]);

  const selectedEdgeOp = useMemo(() => {
    if (!selectedEdgeIsControl || !selectedEdge) return "add";
    const op = String(selectedEdge.data?.op ?? "add");
    return CONTROL_OPS.some((item) => item.value === op) ? (op as ControlOp) : "add";
  }, [selectedEdge, selectedEdgeIsControl]);

  const selectedNodeIsControlSource = useMemo(
    () => selectedNode != null && (isConstantNode(selectedNode) || isVariableNode(selectedNode)),
    [selectedNode],
  );

  const selectedNodeOp: ControlOp = useMemo(() => {
    if (!selectedNodeIsControlSource || !selectedNode) return "add";
    const raw = String(selectedNode.data?.op ?? "add");
    return CONTROL_OPS.some((item) => item.value === raw) ? (raw as ControlOp) : "add";
  }, [selectedNode, selectedNodeIsControlSource]);

  const selectedNodeLoop = useMemo(() => {
    if (!selectedNode) return null;
    const loopId = selectedNode.data?.loopId;
    if (!loopId) return null;
    return feedbackLoops.find((loop) => loop.id === loopId) ?? null;
  }, [selectedNode, feedbackLoops]);

  const selectedNodeLoopRoleLabel = useMemo(() => {
    if (!selectedNode || !selectedNodeLoop) return null;
    const role = String(selectedNode.data?.loopRole ?? "");
    switch (role) {
      case "goal": return "Goal";
      case "discrepancy": return "Discrepancy";
      case "correctiveAction": return "Corrective Action";
      case "reinforcingMultiplier": return "Multiplier";
      case "growthLimit": return "Growth limit";
      case "reinforcingMarker": return "Loop marker";
      default: return null;
    }
  }, [selectedNode, selectedNodeLoop]);

  const nodeTypes = useMemo(() => ({
    flowNode: FlowNode, stockNode: StockNode,
    constantNode: ConstantNode, variableNode: VariableNode, commentNode: CommentNode,
  }), []);
  const edgeTypes = useMemo(() => ({ default: AnimatedParticleEdge }), []);

  const {
    titleTrimmed,
    saveBlockedReason,
    saveDisabledNoChanges,
    saveButtonDisabled,
    isSaveError,
    isSavePending,
    isSubmitForReviewPending,
    isSubmitForReviewSuccess,
    isMarkReviewedPending,
    setLastSavedSignature,
    handleSaveSystem,
    handleSubmitForReview,
    submitTeacherReview,
  } = useLabSystemPersistence({
    userId,
    title,
    activeSystemId,
    lessonTaskContext,
    systems: systemsQuery.data,
    nodes,
    edges,
    feedbackLoops,
    simulationSteps,
    steps,
    dt,
    algorithm,
    sliderIndex,
    loadedSystemGraphIdRef,
    toGraphJson,
    setActiveSystemId,
    setSaveAttempted,
    setReviewModalOpen: setIsReviewModalOpen,
    setReviewingAsTeacher: setIsReviewingAsTeacher,
  });

  const { mutate: markSystemChangesAsSeen } = useMutation({
    mutationFn: async (systemId: number) => markSystemChangesSeen(systemId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["systems", userId] }); },
  });

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const {
    selectedNodeIds,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    clearSelection,
    copySingleNode,
    deleteSingleNode,
    handleSelectionChange,
  } = useLabSelectionClipboard({
    nodes,
    edges,
    nodesById,
    lockEditing,
    selectedNodeId,
    selectedEdgeId,
    replaceGraph,
    setSelectedNodeId,
    setSelectedEdgeId,
    onSave: handleSaveSystem,
    undo,
    redo,
  });
  const chartFocusedNodeIds = useMemo(() => {
    if (selectedNodeIds.length > 0) return selectedNodeIds;
    if (selectedNodeId) return [selectedNodeId];
    return [] as string[];
  }, [selectedNodeIds, selectedNodeId]);

  const { isPlaying, runLocalSimulation, stopAnimation } = useSimulationRunner({
    nodes,
    edges,
    nodesById,
    feedbackLoops,
    steps,
    dt,
    algorithm,
    simulationSteps,
    sliderIndex,
    setSimulationSteps,
    setSliderIndex,
    setLockEditing,
  });

  const {
    activeFeedbackLoopStockNode,
    feedbackLoopFlowOptions,
    feedbackLoopList,
    feedbackLoopModalMode,
    feedbackLoopModalInitialTab,
    feedbackLoopModalInitialBalancingValues,
    feedbackLoopModalInitialReinforcingValues,
    closeFeedbackLoopModal,
    resetFeedbackLoopEditor,
    handleCreateFeedbackLoop,
    handleEditFeedbackLoop,
    handleDeleteFeedbackLoop,
    submitBalancingLoop,
    submitReinforcingLoop,
  } = useFeedbackLoopEditor({
    nodes,
    edges,
    nodesById,
    feedbackLoops,
    lockEditing,
    createBalancingFeedbackLoop,
    createReinforcingFeedbackLoop,
    updateBalancingFeedbackLoop,
    deleteFeedbackLoop: deleteBalancingFeedbackLoop,
  });

  const {
    lessonTasks,
    currentLessonTaskIndex,
    previousLessonTask: prevLessonTask,
    nextLessonTask,
    isCurrentTaskCompleted,
    canResolveLessonNavigation,
    lessonTasksError,
    lessonExitError,
    completeTaskPending,
    isExitingLesson,
    markCurrentTaskCompleted,
    navigateByTaskProgress,
    requestExitLesson,
  } = useLessonTaskFlow({
    userId,
    activeSystemId,
    lessonTaskContext,
    isTaskModalOpen,
    setLessonTaskContext,
    setTaskModalOpen: setIsTaskModalOpen,
    onLessonExitCleanup: doCreateNewSystem,
  });

  useLabNavigationState({
    navigationState: location.state,
    loadedSystemGraphIdRef,
    loadGraphJson,
    setActiveSystemId,
    setLessonTaskContext,
    setTaskModalOpen: setIsTaskModalOpen,
    setLastSavedSignature,
    setTitle,
    setReviewingAsTeacher: setIsReviewingAsTeacher,
  });

  useActiveSystemGraph({
    activeSystemId,
    systems: systemsQuery.data,
    loadedSystemGraphIdRef,
    loadGraphJson,
    setLastSavedSignature,
    setTitle,
    markSeen: markSystemChangesAsSeen,
  });

  const currentSnapshot = useMemo(
    () => (simulationSteps.length ? simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)] : null),
    [simulationSteps, sliderIndex],
  );
  const selectedNodeLiveValue = useMemo(() => {
    if (!selectedNode || !currentSnapshot) return undefined;
    return currentSnapshot.values[selectedNode.id];
  }, [selectedNode, currentSnapshot]);
  const selectedNodeNumericCurrent = useMemo(() => {
    if (!selectedNode) return null;
    if (isFlowNode(selectedNode)) {
      return Number(selectedNodeLiveValue ?? selectedNode.data?.bottleneck ?? selectedNode.data?.quantity ?? 0);
    }
    return Number(selectedNodeLiveValue ?? selectedNode.data?.quantity ?? selectedNode.data?.initial ?? 0);
  }, [selectedNode, selectedNodeLiveValue]);

  useEffect(() => { setStepsInput(String(steps)); }, [steps]);
  useEffect(() => { setDtInput(String(dt)); }, [dt]);
  useEffect(() => {
    if (!selectedNode || selectedNodeNumericCurrent === null) { setSelectedNodeNumericInput(""); return; }
    setSelectedNodeNumericInput(String(selectedNodeNumericCurrent));
  }, [selectedNode?.id, selectedNodeNumericCurrent]);

  const { displayedNodes, displayedEdges } = useLabDisplay({
    nodes, edges, nodesById, feedbackLoops,
    currentSnapshot, algorithm, labColorTokens, isLightTheme, isPlaying,
  });

  function resetZoomToDefault(): void {
    if (!rfInstance) return;
    rfInstance.zoomTo(DEFAULT_ZOOM, { duration: 180 });
    setZoomPercent(100);
  }

  async function exportJson(): Promise<void> {
    await exportGraphAsJson(toGraphJson() as Record<string, unknown>, titleTrimmed);
  }

  function handlePaneContextMenu(event: ReactMouseEvent): void {
    if (lockEditing) return;
    event.preventDefault();
    const rfPos = rfInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 };
    setContextMenu({ screenX: event.clientX, screenY: event.clientY, flowX: rfPos.x, flowY: rfPos.y });
  }

  function handleContextMenuAddNode(type: "stock" | "flow" | "commentNode"): void {
    if (!contextMenu) return;
    const pos = { x: contextMenu.flowX, y: contextMenu.flowY };
    if (type === "commentNode") {
      const profile = currentUserProfileQuery.data;
      const authorName = profile ? `${profile.name} ${profile.last_name}`.trim() : "";
      const authorEmail = profile?.email ?? userEmail ?? "";
      const nodeId = addNodeAtPosition("commentNode", pos, {
        text: "", authorId: userId ?? 0, authorName, authorEmail, authorAvatarPath: profile?.avatar_path ?? null,
      });
      setAddCommentNodeId(nodeId);
      setCommentDraft("");
    } else {
      addNodeAtPosition(type, pos);
    }
    setContextMenu(null);
  }

  function createNewSystem(): void {
    if (lockEditing) return;
    if (useTutorialStore.getState().active) { doCreateNewSystem(); return; }
    setIsConfirmNewSystemOpen(true);
  }

  function doCreateNewSystem(): void {
    stopAnimation();
    setLockEditing(false);
    resetToInitialGraph();
    setActiveSystemId(null);
    loadedSystemGraphIdRef.current = null;
    setTitle("My dynamic system");
    resetFeedbackLoopEditor();
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setSaveAttempted(false);
    setLastSavedSignature(null);
  }

  function commitStepsInput(): void {
    const parsed = parseNumericString(stepsInput);
    if (parsed === null) { setStepsInput(String(steps)); return; }
    setSteps(Math.max(1, Math.round(parsed)));
  }

  function commitDtInput(): void {
    const parsed = parseNumericString(dtInput);
    if (parsed === null) { setDtInput(String(dt)); return; }
    setDt(Math.max(0.001, parsed));
  }

  function commitSelectedNodeNumericInput(): void {
    if (!selectedNode || selectedNodeNumericCurrent === null) return;
    const parsed = parseNumericString(selectedNodeNumericInput);
    if (parsed === null) { setSelectedNodeNumericInput(String(selectedNodeNumericCurrent)); return; }
    if (simulationSteps.length > 0) clearSimulation();
    if (isFlowNode(selectedNode)) { updateSelectedNode({ bottleneck: Math.max(0, parsed) }); return; }
    updateSelectedNode({ quantity: parsed });
  }

  function handlePaneClick(): void {
    clearSelection();
    setContextMenu(null);
  }

  function handleCanvasInit(instance: ReactFlowInstance): void {
    setRfInstance(instance);
    initializeCanvasZoom(instance);
    setZoomPercent(100);
  }

  function handleCanvasMove(_: globalThis.MouseEvent | TouchEvent | null, viewport: Viewport): void {
    setZoomPercent(Math.round((viewport.zoom / DEFAULT_ZOOM) * 100));
    const canvasEl = document.querySelector('[data-tutorial="canvas"]');
    canvasEl?.dispatchEvent(new CustomEvent("fs-viewport-moved", { bubbles: true }));
  }

  function handleSaveComment(): void {
    if (!addCommentNodeId) return;
    const store = useLabStore.getState();
    store.onNodesChange([]);
    store.setSelectedNodeId(addCommentNodeId);
    store.updateSelectedNode({ text: commentDraft });
    store.setSelectedNodeId(null);
    setAddCommentNodeId(null);
    setCommentDraft("");
  }

  function handleCancelComment(): void {
    if (!addCommentNodeId) return;
    useLabStore.getState().onNodesChange([{ type: "remove", id: addCommentNodeId }]);
    setAddCommentNodeId(null);
    setCommentDraft("");
  }

  function handleAddStock(): void {
    addStock();
    if (!useTutorialStore.getState().active) return;
    const last = useLabStore.getState().nodes.at(-1);
    if (last) setSelectedNodeId(last.id);
  }

  function handleAddFlow(): void {
    addFlow();
    if (!useTutorialStore.getState().active) return;
    const last = useLabStore.getState().nodes.at(-1);
    if (last) setSelectedNodeId(last.id);
  }

  function confirmFeedbackLoopDeletion(): void {
    if (!feedbackLoopPendingDeletion) return;
    const result = handleDeleteFeedbackLoop(feedbackLoopPendingDeletion);
    if (!result.ok) {
      setFeedbackLoopDeleteError(result.error);
      return;
    }
    setFeedbackLoopPendingDeletion(null);
    setFeedbackLoopDeleteError(null);
  }

  return (
    <section className="lab-editor-shell">
      <LabCanvas
        nodes={displayedNodes}
        edges={displayedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isLightTheme={isLightTheme}
        canvasLocked={canvasLocked}
        zoomPercent={zoomPercent}
        canUndo={canUndo}
        canRedo={canRedo}
        contextMenu={contextMenu}
        addCommentNodeId={addCommentNodeId}
        commentDraft={commentDraft}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={(connection: Connection) => isValidLabConnection(connection, useLabStore.getState().nodes)}
        onSelectionChange={handleSelectionChange}
        onNodeClick={(node) => setSelectedNodeId(node.id)}
        onEdgeClick={(edge) => setSelectedEdgeId(edge.id)}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onInit={handleCanvasInit}
        onMove={handleCanvasMove}
        onUndo={undo}
        onRedo={redo}
        onZoomReset={resetZoomToDefault}
        onZoomIn={() => rfInstance?.zoomIn({ duration: 180 })}
        onZoomOut={() => rfInstance?.zoomOut({ duration: 180 })}
        onToggleCanvasLock={() => setCanvasLocked((prev) => !prev)}
        onExport={() => { void exportJson(); }}
        onOpenHelp={() => setIsHelpOpen(true)}
        onContextMenuAddNode={handleContextMenuAddNode}
        onDismissContextMenu={() => setContextMenu(null)}
        onCommentDraftChange={setCommentDraft}
        onSaveComment={handleSaveComment}
        onCancelComment={handleCancelComment}
      />

      <LabLeftPanel
        lessonTaskContext={lessonTaskContext}
        lessonTasksCount={lessonTasks.length}
        currentLessonTaskIndex={currentLessonTaskIndex}
        previousLessonTask={prevLessonTask}
        nextLessonTask={nextLessonTask}
        isCurrentTaskCompleted={isCurrentTaskCompleted}
        canResolveLessonNavigation={canResolveLessonNavigation}
        lessonTasksError={lessonTasksError}
        lessonExitError={lessonExitError}
        completeTaskPending={completeTaskPending}
        isExitingLesson={isExitingLesson}
        stepsInput={stepsInput}
        dtInput={dtInput}
        algorithm={algorithm}
        isPlaying={isPlaying}
        sliderIndex={sliderIndex}
        simulationStepCount={simulationSteps.length}
        onOpenTask={(taskId) => navigate(`/app/tasks/${taskId}`)}
        onOpenFullTask={() => setIsTaskModalOpen(true)}
        onMarkTaskCompleted={markCurrentTaskCompleted}
        onTaskProgressNavigation={() => { void navigateByTaskProgress(); }}
        onExitLesson={requestExitLesson}
        onStepsInputChange={setStepsInput}
        onDtInputChange={setDtInput}
        onCommitSteps={commitStepsInput}
        onCommitDt={commitDtInput}
        onAlgorithmChange={setAlgorithm}
        onRunSimulation={runLocalSimulation}
        onResetSimulation={clearSimulation}
        onSliderIndexChange={setSliderIndex}
      />

      <EditorSidePanel
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
        selectedNode={selectedNode}
        selectedNodeLoop={selectedNodeLoop}
        selectedNodeLoopRoleLabel={selectedNodeLoopRoleLabel}
        selectedNodeNumericInput={selectedNodeNumericInput}
        selectedNodeIsControlSource={selectedNodeIsControlSource}
        selectedNodeOp={selectedNodeOp}
        isSelectedStock={isSelectedStock}
        selectedEdge={selectedEdge}
        selectedEdgeIsControl={selectedEdgeIsControl}
        selectedEdgeOp={selectedEdgeOp}
        stockColorPresets={stockColorPresets}
        colorblindMode={colorblindMode}
        labColorTokens={labColorTokens}
        nodesById={nodesById}
        feedbackLoopList={feedbackLoopList}
        simulationSteps={simulationSteps}
        sliderIndex={sliderIndex}
        isLightTheme={isLightTheme}
        nodes={nodes}
        edges={edges}
        feedbackLoops={feedbackLoops}
        chartFocusedNodeIds={chartFocusedNodeIds}
        onTitleChange={setTitle}
        onSave={handleSaveSystem}
        onCreateNewSystem={createNewSystem}
        onSubmitForReview={handleSubmitForReview}
        onOpenReviewModal={() => setIsReviewModalOpen(true)}
        onAddStock={handleAddStock}
        onAddFlow={handleAddFlow}
        onAddConstant={addConstant}
        onAddVariable={addVariable}
        onNumericInputChange={setSelectedNodeNumericInput}
        onCommitNumericInput={commitSelectedNodeNumericInput}
        onUpdateNode={updateSelectedNode}
        onSetControlOp={setSelectedNodeControlOp}
        onCopyNode={copySingleNode}
        onDeleteNode={deleteSingleNode}
        onCreateFeedbackLoop={handleCreateFeedbackLoop}
        onEditFeedbackLoop={handleEditFeedbackLoop}
        onDeleteFeedbackLoop={(loopId) => {
          setFeedbackLoopPendingDeletion(loopId);
          setFeedbackLoopDeleteError(null);
        }}
        onUpdateEdge={updateSelectedEdge}
        onOpenChartModal={() => setIsChartModalOpen(true)}
        onSliderIndexChange={setSliderIndex}
      />

      <FeedbackLoopModal
        isOpen={activeFeedbackLoopStockNode !== null}
        mode={feedbackLoopModalMode}
        initialTab={feedbackLoopModalInitialTab}
        initialBalancingValues={feedbackLoopModalInitialBalancingValues}
        initialReinforcingValues={feedbackLoopModalInitialReinforcingValues}
        stockLabel={String(activeFeedbackLoopStockNode?.data?.label ?? activeFeedbackLoopStockNode?.id ?? "Stock")}
        connectedFlows={feedbackLoopFlowOptions}
        onClose={closeFeedbackLoopModal}
        onSubmitBalancingLoop={submitBalancingLoop}
        onSubmitReinforcingLoop={submitReinforcingLoop}
      />

      <TaskModal
        isOpen={isTaskModalOpen}
        context={lessonTaskContext}
        nextTask={nextLessonTask}
        isCompleted={isCurrentTaskCompleted}
        isTasksError={lessonTasksError}
        exitError={lessonExitError}
        isSavingCompletion={completeTaskPending}
        canResolveLessonNavigation={canResolveLessonNavigation}
        isExiting={isExitingLesson}
        onClose={() => setIsTaskModalOpen(false)}
        onMarkCompleted={markCurrentTaskCompleted}
        onContinue={() => { void navigateByTaskProgress(); }}
        onExit={requestExitLesson}
      />

      <ChartModal
        isOpen={isChartModalOpen}
        steps={simulationSteps}
        focusIndex={sliderIndex}
        isLightTheme={isLightTheme}
        nodes={nodes}
        edges={edges}
        feedbackLoops={feedbackLoops}
        focusedNodeIds={chartFocusedNodeIds}
        onClose={() => setIsChartModalOpen(false)}
        onFocusIndexChange={setSliderIndex}
      />

      <ConfirmNewSystemModal
        isOpen={isConfirmNewSystemOpen}
        onClose={() => setIsConfirmNewSystemOpen(false)}
        onConfirm={() => {
          setIsConfirmNewSystemOpen(false);
          doCreateNewSystem();
        }}
      />

      <MarkReviewedModal
        isOpen={isReviewModalOpen}
        systemTitle={title}
        isSubmitting={isMarkReviewedPending}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmit={submitTeacherReview}
      />

      <LabHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <ConfirmDialog
        isOpen={feedbackLoopPendingDeletion !== null}
        title="Delete feedback loop?"
        description="This removes the loop and its generated nodes and edges."
        confirmLabel="Delete loop"
        error={feedbackLoopDeleteError}
        onClose={() => {
          setFeedbackLoopPendingDeletion(null);
          setFeedbackLoopDeleteError(null);
        }}
        onConfirm={confirmFeedbackLoopDeletion}
      />

    </section>
  );
}

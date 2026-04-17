import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, { Background, BackgroundVariant, Edge, Node, ReactFlowInstance } from "reactflow";
import { useLocation, useNavigate } from "react-router-dom";
import "reactflow/dist/style.css";

import { ConstantNode } from "../../components/ConstantNode";
import { CommentNode } from "../../components/CommentNode";
import {
  BalancingSubmitPayload,
  FeedbackLoopModal,
  ReinforcingSubmitPayload,
} from "../../components/FeedbackLoopModal";
import { FlowNode } from "../../components/FlowNode";
import { StockNode } from "../../components/StockNode";
import { VariableNode } from "../../components/VariableNode";
import { SimulationChart } from "../../components/SimulationChart";
import { AnimatedParticleEdge } from "../../components/AnimatedParticleEdge";
import { fetchLessons } from "../../features/lessons/api";
import { fetchLessonTasks } from "../../features/lessonTasks/api";
import { fetchSections } from "../../features/sections/api";
import { createSystem, fetchSystems, markSystemChangesSeen, markSystemReviewed, submitSystemForReview, updateSystem } from "../../features/systems/api";
import { MarkReviewedModal } from "../../components/MarkReviewedModal";
import { LabHelpModal } from "../../components/LabHelpModal";
import { completeTask, fetchCompletedTasks } from "../../features/taskProgress/api";
import { LessonTask, SystemModel } from "../../types/api";
import { useAuthStore } from "../../store/authStore";
import { FeedbackLoop, isValidLabConnection, useLabStore } from "../../store/labStore";
import { matchesShortcutEvent, useShortcutStore } from "../../store/shortcutStore";
import { getLabColorTokens, resolveStockColor, useUiPreferencesStore } from "../../store/uiPreferencesStore";
import { useTutorialStore } from "../../store/tutorialStore";

import { ControlOp, CONTROL_OPS, LabNavigationState, LabTaskContext } from "./types";
import {
  asNumber,
  buildSaveSignature,
  cloneEdges,
  cloneNodes,
  collectConnectedFlows,
  isConstantNode,
  isFlowNode,
  isStockNode,
  isVariableNode,
  normalizeTitle,
  parseNumericString,
  proposeBalancingLoopPositions,
  proposeCorrectivePosition,
  proposeReinforcingLoopPositions,
  sameIdList,
} from "./utils";
import { HelpTip } from "./HelpTip";
import { CanvasToolbar } from "./components/CanvasToolbar";
import { CommentEntryOverlay } from "./components/CommentEntryOverlay";
import { LabContextMenu } from "./components/LabContextMenu";
import { exportGraphAsJson } from "./exportGraph";
import { useLabDisplay } from "./hooks/useLabDisplay";
import { useSimulationRunner } from "./hooks/useSimulationRunner";

const DEFAULT_ZOOM = 0.6;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 3.0;

export function LabPage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const colorblindMode = useUiPreferencesStore((state) => state.colorblindMode);
  const highContrastMode = useUiPreferencesStore((state) => state.highContrastMode);
  const labColorTokens = useMemo(() => getLabColorTokens(colorblindMode, highContrastMode), [colorblindMode, highContrastMode]);
  const stockColorPresets = labColorTokens.stockPresets;
  const shortcutBindings = useShortcutStore((state) => state.bindings);
  const [title, setTitle] = useState("My dynamic system");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isConfirmNewSystemOpen, setIsConfirmNewSystemOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [canvasLocked, setCanvasLocked] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [pasteCounter, setPasteCounter] = useState(0);
  const [stepsInput, setStepsInput] = useState("60");
  const [dtInput, setDtInput] = useState("1");
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);
  const [selectedNodeNumericInput, setSelectedNodeNumericInput] = useState("");
  const [createFeedbackLoopStockId, setCreateFeedbackLoopStockId] = useState<string | null>(null);
  const [editingFeedbackLoopId, setEditingFeedbackLoopId] = useState<string | null>(null);
  const [lessonTaskContext, setLessonTaskContext] = useState<LabTaskContext | null>(null);
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; flowX: number; flowY: number } | null>(null);
  const [addCommentNodeId, setAddCommentNodeId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  // Flag set when a teacher reaches this page via "Open in Lab" on the
  // Pending Review list. Kept in state so that a later internal navigation
  // that doesn't re-pass location.state still shows the review button.
  const [isReviewingAsTeacher, setIsReviewingAsTeacher] = useState(false);
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.dataset.theme === "light";
  });
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const loadedSystemGraphIdRef = useRef<number | null>(null);
  const userId = useAuthStore((state) => state.userId);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const userEmail = useAuthStore((state) => state.email);
  const location = useLocation();

  // --- Queries ---
  const systemsQuery = useQuery({
    queryKey: ["systems", userId],
    queryFn: fetchSystems,
    enabled: !!userId,
  });
  const lessonTasksQuery = useQuery({
    queryKey: ["lesson-tasks", lessonTaskContext?.lessonId ?? null],
    queryFn: () => fetchLessonTasks(lessonTaskContext?.lessonId),
    enabled: lessonTaskContext !== null,
  });
  const completedTasksQuery = useQuery({
    queryKey: ["completed-tasks", userId],
    queryFn: fetchCompletedTasks,
    enabled: lessonTaskContext !== null && !!userId,
  });
  const currentUserProfileQuery = useQuery({
    queryKey: ["profile-lab", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await (await import("../../lib/api")).api.get(`/users/${userId}`);
      return data as { id: number; name: string; last_name: string; email: string; avatar_path?: string | null };
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  // --- Lab store ---
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

  // --- Derived state ---
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);
  const isSelectedStock = selectedNode?.type === "stockNode";

  const selectedEdgeIsControl = useMemo(() => {
    if (!selectedEdge) return false;
    const sourceNode = nodes.find((node) => node.id === selectedEdge.source);
    const targetNode = nodes.find((node) => node.id === selectedEdge.target);
    return (
      (isConstantNode(sourceNode) || isVariableNode(sourceNode)) &&
      isFlowNode(targetNode) &&
      selectedEdge.data?.feedbackLoop !== true
    );
  }, [nodes, selectedEdge]);

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

  // When a node that belongs to a feedback loop is selected, the right-side
  // editor replaces the generic Constant/Variable/Stock fields with a
  // loop-specific card. We derive the parent loop + a human-readable role
  // label up-front so the render can stay simple.
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

  const titleTrimmed = title.trim();
  const duplicateTitleExists = useMemo(() => {
    const systems = (systemsQuery.data ?? []) as SystemModel[];
    if (!userId || !titleTrimmed) return false;
    if (activeSystemId !== null && !systems.some((system) => system.id === activeSystemId && system.owner_id === userId)) {
      return false;
    }
    const current = normalizeTitle(titleTrimmed);
    return systems.some(
      (system) => system.owner_id === userId && system.id !== activeSystemId && normalizeTitle(system.title) === current,
    );
  }, [systemsQuery.data, titleTrimmed, userId, activeSystemId]);

  const saveBlockedReason = useMemo(() => {
    if (!titleTrimmed) return "System title is required.";
    if (duplicateTitleExists) return "A system with this title already exists.";
    return null;
  }, [titleTrimmed, duplicateTitleExists]);

  const currentSaveSignature = useMemo(
    () => buildSaveSignature(titleTrimmed, toGraphJson() as Record<string, unknown>),
    [titleTrimmed, nodes, edges, feedbackLoops, toGraphJson],
  );
  const hasUnsavedChanges = lastSavedSignature === null || currentSaveSignature !== lastSavedSignature;
  const saveDisabledNoChanges = lastSavedSignature !== null && !hasUnsavedChanges;

  const lessonTasks: LessonTask[] = useMemo(
    () => [...(lessonTasksQuery.data ?? [])].sort(
      (a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER),
    ),
    [lessonTasksQuery.data],
  );
  const completedTaskSet = useMemo(() => new Set((completedTasksQuery.data ?? []).map((item) => item.task_id)), [completedTasksQuery.data]);
  const isCurrentTaskCompleted = lessonTaskContext ? completedTaskSet.has(lessonTaskContext.taskId) : false;
  const nextLessonTask = useMemo(() => {
    if (!lessonTaskContext) return null;
    const idx = lessonTasks.findIndex((task) => task.id === lessonTaskContext.taskId);
    if (idx < 0) return null;
    return lessonTasks[idx + 1] ?? null;
  }, [lessonTaskContext, lessonTasks]);
  const prevLessonTask = useMemo(() => {
    if (!lessonTaskContext) return null;
    const idx = lessonTasks.findIndex((task) => task.id === lessonTaskContext.taskId);
    if (idx <= 0) return null;
    return lessonTasks[idx - 1] ?? null;
  }, [lessonTaskContext, lessonTasks]);
  const currentLessonTaskIndex = useMemo(() => {
    if (!lessonTaskContext) return -1;
    return lessonTasks.findIndex((task) => task.id === lessonTaskContext.taskId);
  }, [lessonTaskContext, lessonTasks]);
  const canResolveLessonNavigation = lessonTaskContext !== null && !lessonTasksQuery.isLoading && !lessonTasksQuery.isError;

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user id");
      if (!titleTrimmed) throw new Error("System title is required.");
      if (duplicateTitleExists) throw new Error("A system with this title already exists.");
      const graph = toGraphJson() as { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> };
      const snapshot = simulationSteps.length ? simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)] : null;

      if (snapshot && Array.isArray(graph.nodes)) {
        graph.nodes = graph.nodes.map((node) => {
          const nodeId = String(node.id ?? "");
          const live = snapshot.values[nodeId];
          if (live === undefined) return node;
          const isFlow = String(node.kind ?? "").includes("flow") || nodeId.startsWith("flow_");
          if (isFlow) return { ...node, initial: live, quantity: live, bottleneck: live };
          return { ...node, initial: live, quantity: live };
        });
      }

      if (activeSystemId) return updateSystem(activeSystemId, { title: titleTrimmed, graph_json: graph });
      return createSystem({ title: titleTrimmed, graph_json: graph });
    },
    onSuccess: (saved) => {
      setActiveSystemId(saved.id);
      loadedSystemGraphIdRef.current = saved.id;
      setSaveAttempted(false);
      const savedGraph =
        saved.graph_json && typeof saved.graph_json === "object"
          ? (saved.graph_json as Record<string, unknown>)
          : (toGraphJson() as Record<string, unknown>);
      setLastSavedSignature(buildSaveSignature(String(saved.title ?? titleTrimmed), savedGraph));
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["completed-tasks", userId] });
      queryClient.invalidateQueries({ queryKey: ["completed-lessons", userId] });
      queryClient.invalidateQueries({ queryKey: ["progress", userId] });
    },
  });

  const submitForReviewMutation = useMutation({
    mutationFn: async (systemId: number) => submitSystemForReview(systemId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["systems", userId] }); },
  });

  const markReviewedMutation = useMutation({
    mutationFn: async (payload: { systemId: number; comment: string }) =>
      markSystemReviewed(payload.systemId, payload.comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-review-systems"] });
      setIsReviewModalOpen(false);
      setIsReviewingAsTeacher(false);
      navigate("/app/pending-review");
    },
  });

  const markSeenMutation = useMutation({
    mutationFn: async (systemId: number) => markSystemChangesSeen(systemId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["systems", userId] }); },
  });

  const saveButtonDisabled = saveMutation.isPending || saveDisabledNoChanges;

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const { isPlaying, runLocalSimulation, stopAnimation } = useSimulationRunner({
    nodes,
    edges,
    nodesById,
    feedbackLoops,
    steps,
    dt,
    simulationSteps,
    sliderIndex,
    setSimulationSteps,
    setSliderIndex,
    setLockEditing,
  });

  // Expose the "mark task completed" handler and modal-suppress flag to the
  // globally-mounted TutorialOverlay (in AppLayout). This keeps the overlay
  // alive across page navigations (e.g. Lab → Profile → Lab) while still
  // letting Lab-specific logic drive task completion and modal suppression.
  useEffect(() => {
    useTutorialStore.getState().setOnFinishCallback(() => {
      if (!lessonTaskContext || isCurrentTaskCompleted || completeTaskMutation.isPending) return;
      completeTaskMutation.mutate(lessonTaskContext.taskId);
    });
    return () => useTutorialStore.getState().setOnFinishCallback(null);
  }, [lessonTaskContext, isCurrentTaskCompleted, completeTaskMutation]);

  useEffect(() => {
    useTutorialStore.getState().setOverlaySuppressed(isTaskModalOpen);
    return () => useTutorialStore.getState().setOverlaySuppressed(false);
  }, [isTaskModalOpen]);

  useEffect(() => {
    let state = (location.state ?? {}) as LabNavigationState;
    // When the user navigates away mid-tutorial (e.g. to Profile → Import →
    // Open in Lab) and comes back to /app/lab, the incoming location.state
    // will carry the *system* the user chose but no `taskContext`. In that
    // case we merge the cached task context so the lesson can continue to
    // its "Finish lesson" step. If there's no navigation state at all, we
    // also rehydrate the task context (so a plain sidebar link returns the
    // user to the running lesson).
    const tutorialState = useTutorialStore.getState();
    if (tutorialState.active && tutorialState.cachedLabState && !state.taskContext) {
      const cached = tutorialState.cachedLabState as LabNavigationState;
      if (cached.taskContext) state = { ...state, taskContext: cached.taskContext };
    }
    if (state.taskContext) {
      useTutorialStore.getState().setCachedLabState(state);
    }
    if (typeof state.systemId === "number") {
      setActiveSystemId(state.systemId);
      if (state.systemGraph && typeof state.systemGraph === "object") {
        loadGraphJson(state.systemGraph);
        loadedSystemGraphIdRef.current = state.systemId;
        const stateTitle = typeof state.systemTitle === "string" ? state.systemTitle : "";
        setLastSavedSignature(buildSaveSignature(stateTitle, state.systemGraph));
      } else {
        loadedSystemGraphIdRef.current = null;
      }
    } else {
      loadedSystemGraphIdRef.current = null;
      setLastSavedSignature(null);
    }
    const taskContext = state.taskContext;
    const hasTaskContext =
      taskContext && typeof taskContext.taskId === "number" && typeof taskContext.lessonId === "number" &&
      typeof taskContext.taskTitle === "string" && typeof taskContext.taskDescription === "string";
    if (hasTaskContext) {
      setLessonTaskContext({
        taskId: taskContext.taskId, lessonId: taskContext.lessonId,
        taskTitle: taskContext.taskTitle, taskDescription: taskContext.taskDescription,
      });
      setIsTaskModalOpen(false);
      if (taskContext.taskTitle === "Simulation") useTutorialStore.getState().startLesson("simulation");
      else if (taskContext.taskTitle === "Editor") useTutorialStore.getState().startLesson("editor");
      else if (taskContext.taskTitle === "Workspace") useTutorialStore.getState().startLesson("workspace");
    } else {
      setLessonTaskContext(null);
      setIsTaskModalOpen(false);
    }
    if (typeof state.systemTitle === "string" && state.systemTitle.trim()) setTitle(state.systemTitle);
    if (state.reviewing === true) setIsReviewingAsTeacher(true);
  }, [location.state, loadGraphJson, setActiveSystemId]);

  useEffect(() => {
    if (!activeSystemId) return;
    const systems = (systemsQuery.data ?? []) as SystemModel[];
    const current = systems.find((s) => s.id === activeSystemId);
    if (current?.has_unseen_changes) markSeenMutation.mutate(activeSystemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSystemId, systemsQuery.data]);

  // --- Feedback loop derived state ---
  const editingFeedbackLoop = useMemo<FeedbackLoop | null>(
    () => feedbackLoops.find((item) => item.id === editingFeedbackLoopId) ?? null,
    [feedbackLoops, editingFeedbackLoopId],
  );
  const activeFeedbackLoopStockId = editingFeedbackLoop?.stockId ?? createFeedbackLoopStockId;
  const activeFeedbackLoopStockNode = useMemo(() => {
    if (!activeFeedbackLoopStockId) return null;
    const node = nodesById.get(activeFeedbackLoopStockId);
    return isStockNode(node) ? node : null;
  }, [activeFeedbackLoopStockId, nodesById]);
  const feedbackLoopFlowOptions = useMemo(() => {
    if (!activeFeedbackLoopStockNode) return [];
    return collectConnectedFlows(activeFeedbackLoopStockNode.id, nodesById, edges);
  }, [activeFeedbackLoopStockNode, nodesById, edges]);
  const feedbackLoopList = useMemo(
    () => feedbackLoops.map((loop) => {
      const fallbackLabel = loop.type === "balancing"
        ? String(nodesById.get(loop.correctiveNodeId)?.data?.label ?? "Corrective Action")
        : String(nodesById.get(loop.multiplierNodeId)?.data?.label ?? "Multiplier");
      return {
        ...loop,
        stockLabel: String(nodesById.get(loop.stockId)?.data?.label ?? loop.stockId),
        flowLabel: String(nodesById.get(loop.controlledFlowId)?.data?.label ?? loop.controlledFlowId),
        // Prefer the user-provided loop name; fall back to the corrective /
        // multiplier node label so older loops without a name still read well.
        loopLabel: (loop.name ?? "").trim() || fallbackLabel,
      };
    }),
    [feedbackLoops, nodesById],
  );
  const feedbackLoopModalInitialTab = useMemo<"balancing" | "reinforcing" | undefined>(
    () => (editingFeedbackLoop ? editingFeedbackLoop.type : undefined),
    [editingFeedbackLoop],
  );
  const feedbackLoopModalInitialBalancingValues = useMemo<Partial<BalancingSubmitPayload> | undefined>(() => {
    if (!editingFeedbackLoop || editingFeedbackLoop.type !== "balancing") return undefined;
    return {
      boundaryType: editingFeedbackLoop.boundaryType,
      goalValue: editingFeedbackLoop.goalValue,
      adjustmentTime: editingFeedbackLoop.adjustmentTime,
      controlledFlowId: editingFeedbackLoop.controlledFlowId,
      operation: editingFeedbackLoop.operation,
      delayEnabled: editingFeedbackLoop.delayEnabled,
      delaySteps: editingFeedbackLoop.delaySteps,
      name: editingFeedbackLoop.name ?? "",
      correctiveLabel: String(nodesById.get(editingFeedbackLoop.correctiveNodeId)?.data?.label ?? "Corrective Action"),
    };
  }, [editingFeedbackLoop, nodesById]);
  const feedbackLoopModalInitialReinforcingValues = useMemo<Partial<ReinforcingSubmitPayload> | undefined>(() => {
    if (!editingFeedbackLoop || editingFeedbackLoop.type !== "reinforcing") return undefined;
    return {
      k: editingFeedbackLoop.k,
      controlledFlowId: editingFeedbackLoop.controlledFlowId,
      polarity: editingFeedbackLoop.polarity,
      delayEnabled: editingFeedbackLoop.delayEnabled,
      delaySteps: editingFeedbackLoop.delaySteps,
      growthLimit: editingFeedbackLoop.growthLimitNodeId
        ? asNumber(nodesById.get(editingFeedbackLoop.growthLimitNodeId)?.data?.quantity, 0)
        : undefined,
      clampNonNegative: editingFeedbackLoop.clampNonNegative,
      name: editingFeedbackLoop.name ?? "",
      multiplierLabel: (() => {
        const raw = String(nodesById.get(editingFeedbackLoop.multiplierNodeId)?.data?.label ?? "Multiplier");
        return raw === "(R)" ? "Multiplier" : raw;
      })(),
    };
  }, [editingFeedbackLoop, nodesById]);

  useEffect(() => {
    if (!createFeedbackLoopStockId) return;
    if (!nodesById.has(createFeedbackLoopStockId)) setCreateFeedbackLoopStockId(null);
  }, [createFeedbackLoopStockId, nodesById]);
  useEffect(() => {
    if (!editingFeedbackLoopId) return;
    if (!feedbackLoops.some((loop) => loop.id === editingFeedbackLoopId)) setEditingFeedbackLoopId(null);
  }, [editingFeedbackLoopId, feedbackLoops]);
  useEffect(() => {
    if (!lockEditing) return;
    if (createFeedbackLoopStockId) setCreateFeedbackLoopStockId(null);
    if (editingFeedbackLoopId) setEditingFeedbackLoopId(null);
  }, [lockEditing, createFeedbackLoopStockId, editingFeedbackLoopId]);

  // --- Simulation display ---
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const syncTheme = () => setIsLightTheme(root.dataset.theme === "light");
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (activeSystemId === null) {
      loadedSystemGraphIdRef.current = null;
      setLastSavedSignature(null);
      return;
    }
    if (loadedSystemGraphIdRef.current === activeSystemId) return;
    const systems = (systemsQuery.data ?? []) as SystemModel[];
    const currentSystem = systems.find((system) => system.id === activeSystemId);
    if (!currentSystem) return;
    const graph = currentSystem.graph_json && typeof currentSystem.graph_json === "object"
      ? (currentSystem.graph_json as Record<string, unknown>) : {};
    loadGraphJson(graph);
    loadedSystemGraphIdRef.current = activeSystemId;
    setLastSavedSignature(buildSaveSignature(String(currentSystem.title ?? ""), graph));
    if (currentSystem.title) setTitle(currentSystem.title);
  }, [activeSystemId, systemsQuery.data, loadGraphJson]);

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

  function handleSaveSystem(): void {
    if (saveDisabledNoChanges) return;
    setSaveAttempted(true);
    if (saveBlockedReason) return;
    saveMutation.mutate();
  }

  function handleSubmitForReview(): void {
    if (!activeSystemId || submitForReviewMutation.isPending) return;
    submitForReviewMutation.mutate(activeSystemId);
  }

  function handlePaneContextMenu(event: React.MouseEvent): void {
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

  function handleMarkTaskCompleted(): void {
    if (!lessonTaskContext || isCurrentTaskCompleted || completeTaskMutation.isPending) return;
    completeTaskMutation.mutate(lessonTaskContext.taskId);
  }

  async function handleTaskProgressNavigation(): Promise<void> {
    if (!lessonTaskContext || !canResolveLessonNavigation) return;
    if (nextLessonTask) { navigate(`/app/tasks/${nextLessonTask.id}`); return; }

    // Lesson is complete — return to the lessons index, but hint which lesson
    // should be pre-selected: the next lesson in the current section, or if the
    // current lesson was the last in its section, the first lesson of the next
    // section.
    try {
      const [allLessons, allSections] = await Promise.all([
        queryClient.fetchQuery({ queryKey: ["lessons"], queryFn: fetchLessons }),
        queryClient.fetchQuery({ queryKey: ["sections"], queryFn: fetchSections }),
      ]);

      const byOrder = <T extends { order_index?: number | null }>(a: T, b: T): number =>
        Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER);

      const current = (allLessons ?? []).find((l) => l.id === lessonTaskContext.lessonId) ?? null;
      const currentSectionId = current?.section_id ?? null;

      // Next lesson in the same section (strictly after the current one by order).
      let nextLesson: { id: number } | null = null;
      if (current) {
        const sameSection = [...(allLessons ?? [])]
          .filter((l) => (l.section_id ?? null) === currentSectionId)
          .sort(byOrder);
        const idx = sameSection.findIndex((l) => l.id === current.id);
        if (idx >= 0 && idx + 1 < sameSection.length) {
          nextLesson = { id: sameSection[idx + 1].id };
        }
      }

      // If this was the last lesson in its section, pick the first lesson of the
      // next section (by section order_index).
      if (!nextLesson && currentSectionId !== null) {
        const sortedSections = [...(allSections ?? [])].sort(byOrder);
        const secIdx = sortedSections.findIndex((s) => s.id === currentSectionId);
        for (let i = secIdx + 1; i < sortedSections.length; i += 1) {
          const lessonsInSection = [...(allLessons ?? [])]
            .filter((l) => (l.section_id ?? null) === sortedSections[i].id)
            .sort(byOrder);
          if (lessonsInSection.length > 0) {
            nextLesson = { id: lessonsInSection[0].id };
            break;
          }
        }
      }

      if (nextLesson) {
        navigate(`/app/lessons?next=${nextLesson.id}`);
        return;
      }
    } catch {
      // fall through to the plain index if anything went wrong
    }
    navigate("/app/lessons");
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
    setCreateFeedbackLoopStockId(null);
    setEditingFeedbackLoopId(null);
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

  function createBalancingLoopFromModal(payload: BalancingSubmitPayload) {
    if (!activeFeedbackLoopStockNode) return { ok: false as const, error: "Selected stock is no longer available." };
    const controlledFlow = nodesById.get(payload.controlledFlowId);
    if (!controlledFlow || !isFlowNode(controlledFlow)) return { ok: false as const, error: "Selected controlled flow is not available." };
    if (editingFeedbackLoop?.type === "balancing") {
      const correctivePosition = proposeCorrectivePosition(controlledFlow);
      const result = updateBalancingFeedbackLoop({
        id: editingFeedbackLoop.id, boundaryType: payload.boundaryType, goalValue: payload.goalValue,
        adjustmentTime: payload.adjustmentTime, operation: payload.operation,
        delayEnabled: payload.delayEnabled, delaySteps: payload.delaySteps,
        controlledFlowId: payload.controlledFlowId, name: payload.name, correctiveLabel: payload.correctiveLabel, correctivePosition,
      });
      if (result.ok) setEditingFeedbackLoopId(null);
      return result;
    }
    const positions = proposeBalancingLoopPositions(activeFeedbackLoopStockNode, controlledFlow, nodes);
    const result = createBalancingFeedbackLoop({
      stockId: activeFeedbackLoopStockNode.id, controlledFlowId: payload.controlledFlowId,
      boundaryType: payload.boundaryType, goalValue: payload.goalValue, adjustmentTime: payload.adjustmentTime,
      operation: payload.operation, delayEnabled: payload.delayEnabled, delaySteps: payload.delaySteps,
      clampNonNegative: true, name: payload.name, correctiveLabel: payload.correctiveLabel, positions,
    });
    if (result.ok) setCreateFeedbackLoopStockId(null);
    return result;
  }

  function createReinforcingLoopFromModal(payload: ReinforcingSubmitPayload) {
    if (!activeFeedbackLoopStockNode) return { ok: false as const, error: "Selected stock is no longer available." };
    const controlledFlow = nodesById.get(payload.controlledFlowId);
    if (!controlledFlow || !isFlowNode(controlledFlow)) return { ok: false as const, error: "Selected controlled flow is not available." };
    if (editingFeedbackLoop?.type === "reinforcing") {
      const deleteResult = deleteBalancingFeedbackLoop(editingFeedbackLoop.id);
      if (!deleteResult.ok) return deleteResult;
    }
    const positions = proposeReinforcingLoopPositions(activeFeedbackLoopStockNode, controlledFlow, nodes, payload.growthLimit !== undefined);
    const result = createReinforcingFeedbackLoop({
      stockId: activeFeedbackLoopStockNode.id, controlledFlowId: payload.controlledFlowId,
      k: payload.k, polarity: payload.polarity, delayEnabled: payload.delayEnabled, delaySteps: payload.delaySteps,
      growthLimit: payload.growthLimit, clampNonNegative: payload.clampNonNegative,
      name: payload.name, multiplierLabel: payload.multiplierLabel, positions,
    });
    if (result.ok) { setCreateFeedbackLoopStockId(null); setEditingFeedbackLoopId(null); }
    return result;
  }

  // Undo / redo are now owned by the lab store (see `useLabStore`) so keyboard
  // shortcuts, the toolbar buttons and any other triggers share the same ring.

  function getEffectiveSelection(): { nodeIds: string[]; edgeIds: string[] } {
    const nIds = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    const eIds = selectedEdgeIds.length ? selectedEdgeIds : selectedEdgeId ? [selectedEdgeId] : [];
    return { nodeIds: nIds, edgeIds: eIds };
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
    setSelectedNodeIds([]); setSelectedEdgeIds([]); setSelectedNodeId(null); setSelectedEdgeId(null);
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
    const nextNodes = nodes.filter((n) => n.id !== nodeId);
    const nextEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    replaceGraph(nextNodes, nextEdges);
    setSelectedNodeId(null); setSelectedEdgeId(null); setSelectedNodeIds([]); setSelectedEdgeIds([]);
  }

  function cutSelection(): void { copySelection(); deleteSelection(); }

  function pasteSelection(): void {
    if (lockEditing) return;
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    const nextPasteCounter = pasteCounter + 1;
    setPasteCounter(nextPasteCounter);
    const idMap = new Map<string, string>();
    for (const node of clip.nodes) idMap.set(node.id, `${node.id}_copy_${Date.now()}_${nextPasteCounter}`);
    const offset = 26 * nextPasteCounter;
    const newNodes = clip.nodes.map((node) => ({
      ...node, id: idMap.get(node.id) ?? `${node.id}_copy_${Date.now()}`, selected: false,
      position: { x: node.position.x + offset, y: node.position.y + offset }, data: { ...(node.data ?? {}) },
    }));
    const newEdges: Edge[] = [];
    for (const edge of clip.edges) {
      const mappedSource = idMap.get(edge.source);
      const mappedTarget = idMap.get(edge.target);
      if (!mappedSource || !mappedTarget) continue;
      newEdges.push({
        ...edge, id: `${edge.id}_copy_${Date.now()}_${nextPasteCounter}`, selected: false,
        source: mappedSource, target: mappedTarget, data: { ...(edge.data ?? {}) },
      });
    }
    replaceGraph([...nodes, ...newNodes], [...edges, ...newEdges]);
    setSelectedNodeIds(newNodes.map((n) => n.id));
    setSelectedEdgeIds(newEdges.map((e) => e.id));
  }

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || Boolean(target?.isContentEditable);
      if (!isTextInput && matchesShortcutEvent(event, shortcutBindings.delete_selection)) { event.preventDefault(); deleteSelection(); return; }
      if (matchesShortcutEvent(event, shortcutBindings.save_system)) { event.preventDefault(); handleSaveSystem(); return; }
      if (isTextInput) return;
      if (matchesShortcutEvent(event, shortcutBindings.undo_graph)) {
        event.preventDefault();
        // Ctrl+Shift+Z (or ⌘⇧Z) is the widely-understood "redo" variant.
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.copy_selection)) { event.preventDefault(); copySelection(); return; }
      if (matchesShortcutEvent(event, shortcutBindings.cut_selection)) { event.preventDefault(); cutSelection(); return; }
      if (matchesShortcutEvent(event, shortcutBindings.paste_selection)) { event.preventDefault(); pasteSelection(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelection, cutSelection, deleteSelection, handleSaveSystem, pasteSelection, shortcutBindings, undo, redo]);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const nextNodeIds = selectedNodes.map((node) => node.id).sort();
      const nextEdgeIds = selectedEdges.map((edge) => edge.id).sort();
      setSelectedNodeIds((prev) => (sameIdList(prev, nextNodeIds) ? prev : nextNodeIds));
      setSelectedEdgeIds((prev) => (sameIdList(prev, nextEdgeIds) ? prev : nextEdgeIds));
      // Emit a DOM event when the user has selected 2+ nodes so the tutorial
      // can detect multi-selection without subscribing to LabPage state.
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

  // --- Render ---
  return (
    <section className="lab-editor-shell">
      <div className="lab-canvas-wrap" data-tutorial="canvas">
        <div className="h-full w-full min-h-0 overflow-hidden">
          <ReactFlow
            className="lab-reactflow"
            style={{ background: isLightTheme ? "#ffffff" : "transparent" }}
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={(connection) => isValidLabConnection(connection, useLabStore.getState().nodes)}
            onSelectionChange={handleSelectionChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setSelectedNodeIds([]); setSelectedEdgeIds([]); setContextMenu(null); }}
            onPaneContextMenu={handlePaneContextMenu}
            onInit={(instance) => { setRfInstance(instance); instance.zoomTo(DEFAULT_ZOOM, { duration: 0 }); setZoomPercent(100); }}
            onMove={(_, viewport) => {
              setZoomPercent(Math.round((viewport.zoom / DEFAULT_ZOOM) * 100));
              // Emit a DOM event so the tutorial can detect panning without
              // wiring tutorial logic into React Flow internals.
              const canvasEl = document.querySelector('[data-tutorial="canvas"]');
              canvasEl?.dispatchEvent(new CustomEvent("fs-viewport-moved", { bubbles: true }));
            }}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            panOnDrag={!canvasLocked}
            panOnScroll={!canvasLocked}
            zoomOnScroll={!canvasLocked}
            zoomOnPinch={!canvasLocked}
            zoomOnDoubleClick={!canvasLocked}
            selectionOnDrag
            selectionKeyCode="Shift"
            // Accept both Ctrl (Windows / Linux), Meta (macOS ⌘) and Shift
            // as multi-select modifiers so Ctrl+click also toggles a node in
            // the current selection.
            multiSelectionKeyCode={["Control", "Meta", "Shift"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} color={isLightTheme ? "#d1d5db" : "#2b2b2b"} gap={24} size={1} />
          </ReactFlow>
        </div>
      </div>

      <LabContextMenu
        position={contextMenu ? { screenX: contextMenu.screenX, screenY: contextMenu.screenY } : null}
        onAdd={handleContextMenuAddNode}
        onDismiss={() => setContextMenu(null)}
      />

      <CommentEntryOverlay
        isOpen={Boolean(addCommentNodeId)}
        draft={commentDraft}
        onDraftChange={setCommentDraft}
        onSave={() => {
          if (!addCommentNodeId) return;
          const store = useLabStore.getState();
          store.onNodesChange([]);
          store.setSelectedNodeId(addCommentNodeId);
          store.updateSelectedNode({ text: commentDraft });
          store.setSelectedNodeId(null);
          setAddCommentNodeId(null);
          setCommentDraft("");
        }}
        onCancel={() => {
          if (!addCommentNodeId) return;
          useLabStore.getState().onNodesChange([{ type: "remove", id: addCommentNodeId }]);
          setAddCommentNodeId(null);
          setCommentDraft("");
        }}
      />

      <CanvasToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        canvasLocked={canvasLocked}
        zoomPercent={zoomPercent}
        onUndo={undo}
        onRedo={redo}
        onZoomReset={resetZoomToDefault}
        onZoomIn={() => rfInstance?.zoomIn({ duration: 180 })}
        onZoomOut={() => rfInstance?.zoomOut({ duration: 180 })}
        onToggleCanvasLock={() => setCanvasLocked((prev) => !prev)}
        onExport={() => { void exportJson(); }}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-left space-y-4" data-tutorial="task-panel">
        {lessonTaskContext ? (
          <div className="space-y-3" data-tutorial="task-block">
            <div className="lab-task-pager">
              <button
                className="lab-task-pager-arrow"
                type="button"
                aria-label="Previous task"
                title="Previous task"
                onClick={() => { if (prevLessonTask) navigate(`/app/tasks/${prevLessonTask.id}`); }}
                disabled={!prevLessonTask}
              >
                &#x2039;
              </button>
              <div className="lab-task-pager-meta">
                <div className="text-sm lab-field">Task</div>
                {lessonTasks.length > 0 && currentLessonTaskIndex >= 0 ? (
                  <div className="lab-task-pager-count">
                    {currentLessonTaskIndex + 1} / {lessonTasks.length}
                  </div>
                ) : null}
              </div>
              <button
                className="lab-task-pager-arrow"
                type="button"
                aria-label="Next task"
                title="Next task"
                onClick={() => { if (nextLessonTask) navigate(`/app/tasks/${nextLessonTask.id}`); }}
                disabled={!nextLessonTask}
              >
                &#x203A;
              </button>
              <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsTaskModalOpen(true)}>
                Full screen
              </button>
            </div>
            <div className="lab-task-card">
              <div className="lab-task-card-title">{lessonTaskContext.taskTitle}</div>
              <p className="lab-task-card-description">{lessonTaskContext.taskDescription}</p>
            </div>
            <div className={`text-xs ${isCurrentTaskCompleted ? "lab-task-status-completed" : "lab-muted"}`}>
              {isCurrentTaskCompleted ? "Task marked as completed." : "Task is not completed yet."}
            </div>
            {lessonTasksQuery.isError ? <div className="text-xs lab-error">Unable to load lesson tasks.</div> : null}
            <button
              className="lab-btn lab-btn-primary w-full"
              type="button"
              onClick={handleMarkTaskCompleted}
              disabled={isCurrentTaskCompleted || completeTaskMutation.isPending}
              data-tutorial="mark-completed"
            >
              {isCurrentTaskCompleted ? "Task completed" : completeTaskMutation.isPending ? "Saving..." : "Mark task as completed"}
            </button>
            <button
              className="lab-btn lab-btn-secondary w-full"
              type="button"
              onClick={handleTaskProgressNavigation}
              disabled={!canResolveLessonNavigation}
              data-tutorial="finish-lesson"
            >
              {!canResolveLessonNavigation ? "Loading lesson tasks..." : nextLessonTask ? "Go to next task" : "Finish lesson"}
            </button>
          </div>
        ) : null}

        <h3 className="lab-panel-title">Simulation</h3>
        <label className="block text-sm lab-field" data-tutorial="steps">
          <span className="lab-label-row">
            <span>Steps</span>
            <HelpTip text={"Number of simulation steps.\nMore steps = longer simulation timeline.\nTypical range: 100\u20132000."} />
          </span>
          <input className="lab-input mt-1" type="text" inputMode="numeric" value={stepsInput} onChange={(e) => setStepsInput(e.target.value)} onBlur={commitStepsInput} onKeyDown={(e) => { if (e.key === "Enter") { commitStepsInput(); (e.currentTarget as HTMLInputElement).blur(); } }} />
        </label>
        <label className="block text-sm lab-field" data-tutorial="dt">
          <span className="lab-label-row">
            <span>dt</span>
            <HelpTip text={"Time step size between each simulation step.\nSmaller dt = higher accuracy but slower.\nTypical range: 0.01 \u2013 1.0."} />
          </span>
          <input className="lab-input mt-1" type="text" inputMode="decimal" value={dtInput} onChange={(e) => setDtInput(e.target.value)} onBlur={commitDtInput} onKeyDown={(e) => { if (e.key === "Enter") { commitDtInput(); (e.currentTarget as HTMLInputElement).blur(); } }} />
        </label>
        <label className="block text-sm lab-field">
          <span className="lab-label-row">
            <span>Solver</span>
            <HelpTip text={"Euler: simpler method for less complex systems when precision is not critical.\n\nRK4: more advanced method with more computations per step and higher accuracy."} />
          </span>
          <select className="lab-input mt-1" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as "euler_v2" | "rk4_v2")}>
            <option value="euler_v2">Euler</option>
            <option value="rk4_v2">RK4</option>
          </select>
        </label>
        <button className="lab-btn lab-btn-primary w-full" onClick={runLocalSimulation} disabled={isPlaying} data-tutorial="run-simulation">
          {isPlaying ? "Running..." : "Run simulation"}
        </button>
        <button className="lab-btn lab-btn-secondary w-full" onClick={() => clearSimulation()}>Reset simulation</button>
        <div className="lab-divider pt-4" data-tutorial="timeline">
          <label className="mb-1 block text-sm lab-field">Timeline</label>
          <input className="lab-range w-full" type="range" min={0} max={Math.max(0, simulationSteps.length - 1)} value={Math.min(sliderIndex, Math.max(0, simulationSteps.length - 1))} onChange={(e) => setSliderIndex(Number(e.target.value))} disabled={simulationSteps.length === 0} />
          <div className="mt-2 text-xs lab-muted">
            {simulationSteps.length ? `Step ${Math.min(sliderIndex, simulationSteps.length - 1)} / ${Math.max(0, simulationSteps.length - 1)}` : "Run simulation to enable slider"}
          </div>
        </div>

      </aside>

      <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-right lab-floating-panel-editor space-y-4">
        <h3 className="lab-panel-title">Editor</h3>
        <div className="space-y-2">
          <div className="lab-system-row">
            <input className="lab-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="System title" aria-label="System title" data-tutorial="system-title" />
            <button className={`lab-btn lab-btn-secondary ${saveDisabledNoChanges ? "lab-btn-save-idle" : ""}`} onClick={handleSaveSystem} disabled={saveButtonDisabled} title={saveDisabledNoChanges ? "No changes to save" : "Save system"} data-tutorial="save-system">Save system</button>
          </div>
          <button className="lab-btn lab-btn-secondary w-full" type="button" onClick={createNewSystem} disabled={lockEditing} data-tutorial="create-new-system">Create new system</button>
          {activeSystemId && !isAdmin ? (
            <button className={`lab-btn lab-btn-secondary w-full ${submitForReviewMutation.isSuccess ? "lab-btn-save-idle" : ""}`} type="button" onClick={handleSubmitForReview} disabled={submitForReviewMutation.isPending || submitForReviewMutation.isSuccess} title="Submit this system to a teacher for review">
              {submitForReviewMutation.isPending ? "Submitting..." : submitForReviewMutation.isSuccess ? "Submitted for review \u2713" : "Submit for review"}
            </button>
          ) : null}
          {activeSystemId && isAdmin && isReviewingAsTeacher ? (
            <button
              className="lab-btn lab-btn-primary w-full"
              type="button"
              onClick={() => setIsReviewModalOpen(true)}
              disabled={markReviewedMutation.isPending}
              title="Mark this student's system as reviewed and send them feedback"
            >
              {markReviewedMutation.isPending ? "Saving..." : "Mark as reviewed"}
            </button>
          ) : null}
          {saveAttempted && saveBlockedReason ? <div className="text-xs lab-error">{saveBlockedReason}</div> : null}
          {saveMutation.isError ? <div className="text-xs lab-error">Unable to save system.</div> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="lab-btn lab-btn-secondary flex-1" onClick={() => { addStock(); if (useTutorialStore.getState().active) { const last = useLabStore.getState().nodes.at(-1); if (last) setSelectedNodeId(last.id); } }} disabled={lockEditing} data-tutorial="add-stock">+ Stock</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={() => { addFlow(); if (useTutorialStore.getState().active) { const last = useLabStore.getState().nodes.at(-1); if (last) setSelectedNodeId(last.id); } }} disabled={lockEditing} data-tutorial="add-flow">+ Flow</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addConstant} disabled={lockEditing}>+ Constant</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addVariable} disabled={lockEditing}>+ Variable</button>
        </div>
        <div className="text-xs lab-muted">
          {lockEditing ? "Editing is locked while animation is running." : "Select a node or edge. Stock -> Flow = outflow (-, red). Flow -> Stock = inflow (+, green)."}
        </div>

        {selectedNode && selectedNodeLoop ? (
          <div className="space-y-2 lab-loop-aux-card" data-tutorial="feedback-loop-card">
            <div className="lab-loop-aux-head">
              <span className={`lab-loop-aux-type-pill lab-loop-aux-type-pill--${selectedNodeLoop.type}`}>
                {selectedNodeLoop.type === "balancing" ? "Balancing" : "Reinforcing"} feedback loop
              </span>
              {selectedNodeLoopRoleLabel ? (
                <span className="lab-loop-aux-role-pill">{selectedNodeLoopRoleLabel}</span>
              ) : null}
            </div>
            <div className="text-sm lab-field">
              <div className="lab-loop-aux-name">
                {(selectedNodeLoop.name ?? "").trim() || (
                  <span className="lab-muted">Unnamed loop</span>
                )}
              </div>
            </div>
            <div className="text-xs lab-muted space-y-0.5">
              <div>Stock: {String(nodesById.get(selectedNodeLoop.stockId)?.data?.label ?? selectedNodeLoop.stockId)}</div>
              <div>
                Controlled flow: {String(nodesById.get(selectedNodeLoop.controlledFlowId)?.data?.label ?? selectedNodeLoop.controlledFlowId)}
              </div>
              {selectedNodeLoop.type === "balancing" ? (
                <div>
                  Goal: {selectedNodeLoop.goalValue} ({selectedNodeLoop.boundaryType} bound, {selectedNodeLoop.operation}) · t={selectedNodeLoop.adjustmentTime}
                </div>
              ) : (
                <div>
                  k={selectedNodeLoop.k} · {selectedNodeLoop.polarity}
                  {selectedNodeLoop.growthLimitNodeId ? " · growth limit" : ""}
                </div>
              )}
              {selectedNodeLoop.delayEnabled ? <div>Delay: {selectedNodeLoop.delaySteps} step(s)</div> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="lab-btn lab-btn-primary"
                type="button"
                disabled={lockEditing}
                onClick={() => {
                  setCreateFeedbackLoopStockId(null);
                  setEditingFeedbackLoopId(selectedNodeLoop.id);
                }}
              >
                Edit feedback loop
              </button>
              <button
                className="lab-btn lab-btn-secondary"
                type="button"
                disabled={lockEditing}
                onClick={() => {
                  if (!window.confirm("Delete this feedback loop?")) return;
                  const result = deleteBalancingFeedbackLoop(selectedNodeLoop.id);
                  if (!result.ok) window.alert(result.error);
                  setEditingFeedbackLoopId((prev) => (prev === selectedNodeLoop.id ? null : prev));
                }}
              >
                Delete loop
              </button>
            </div>
            <div className="text-xs lab-muted">
              This node is part of a feedback loop. Edit the loop to change its name or parameters — individual node fields are managed by the loop definition.
            </div>
          </div>
        ) : selectedNode ? (
          <div className="space-y-2">
            <label className="block text-xs lab-field" data-tutorial="node-name">
              Name
              <input className="lab-input mt-1" disabled={lockEditing} value={String(selectedNode.data?.label ?? "")} onChange={(e) => updateSelectedNode({ label: e.target.value })} placeholder="Label" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className="lab-btn lab-btn-secondary" type="button" data-tutorial="copy-node" onClick={() => copySingleNode(selectedNode.id)} disabled={lockEditing} title="Copy node (Ctrl/Cmd+C)">Copy</button>
              <button className="lab-btn lab-btn-secondary" type="button" data-tutorial="delete-node" onClick={() => deleteSingleNode(selectedNode.id)} disabled={lockEditing} title="Delete node">Delete</button>
            </div>
            {isFlowNode(selectedNode) ? (
              <label className="block text-xs lab-field" data-tutorial="node-bottleneck">
                <span className="lab-label-row"><span>Bottleneck</span><span className="lab-help-dot" title="Defines how much a Flow transfers per time unit." aria-label="Bottleneck help">?</span></span>
                <input className="lab-input mt-1" disabled={lockEditing} type="text" inputMode="decimal" value={selectedNodeNumericInput} onChange={(e) => setSelectedNodeNumericInput(e.target.value)} onBlur={commitSelectedNodeNumericInput} onKeyDown={(e) => { if (e.key === "Enter") { commitSelectedNodeNumericInput(); (e.currentTarget as HTMLInputElement).blur(); } }} placeholder="Bottleneck" />
              </label>
            ) : (
              <label className="block text-xs lab-field" data-tutorial="node-quantity">
                <span className="lab-label-row"><span>Quantity</span><span className="lab-help-dot" title="Stores the current value for Stock, Constant, or Variable." aria-label="Quantity help">?</span></span>
                <input className="lab-input mt-1" disabled={lockEditing} type="text" inputMode="decimal" value={selectedNodeNumericInput} onChange={(e) => setSelectedNodeNumericInput(e.target.value)} onBlur={commitSelectedNodeNumericInput} onKeyDown={(e) => { if (e.key === "Enter") { commitSelectedNodeNumericInput(); (e.currentTarget as HTMLInputElement).blur(); } }} placeholder="Quantity" />
              </label>
            )}
            <label className="block text-xs lab-field">
              <span className="lab-label-row"><span>Unit (optional)</span><span className="lab-help-dot" title="Optional metadata, for example kg, items, or L." aria-label="Unit help">?</span></span>
              <input className="lab-input mt-1" disabled={lockEditing} type="text" value={String(selectedNode.data?.unit ?? "")} onChange={(e) => updateSelectedNode({ unit: e.target.value })} placeholder="e.g. kg, items, L" />
            </label>
            {selectedNodeIsControlSource ? (
              <div className="space-y-1" data-tutorial="node-op">
                <span className="lab-label-row text-xs lab-field">
                  <span>Operation</span>
                  <span
                    className="lab-help-dot"
                    title="Defines how this constant or variable influences the connected flow's bottleneck. The symbol and color appear on every outgoing arrow."
                    aria-label="Operation help"
                  >?</span>
                </span>
                <div className="lab-op-picker" role="group" aria-label="Control operation">
                  {CONTROL_OPS.map((op) => {
                    const opColor = labColorTokens.control[op.value];
                    const isActive = selectedNodeOp === op.value;
                    return (
                      <button
                        key={op.value}
                        type="button"
                        className={`lab-op-btn ${isActive ? "is-active" : ""}`}
                        disabled={lockEditing}
                        onClick={() => setSelectedNodeControlOp(op.value)}
                        aria-pressed={isActive}
                        title={`${op.label}  (${op.value})`}
                        style={isActive
                          ? { color: "#ffffff", background: opColor, borderColor: opColor }
                          : { color: opColor, borderColor: opColor }}
                      >
                        <span className="lab-op-btn-symbol">{op.label}</span>
                        <span className="lab-op-btn-name">{op.value}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="lab-op-hint text-xs lab-muted">
                  Each outgoing arrow uses this operation&apos;s color and symbol.
                </p>
              </div>
            ) : null}
            {isSelectedStock ? (
              <div className="space-y-2">
                <button className="lab-btn lab-btn-secondary w-full" type="button" onClick={() => { setEditingFeedbackLoopId(null); setCreateFeedbackLoopStockId(selectedNode.id); }} disabled={lockEditing}>Create Feedback Loop</button>
                <div className="text-xs lab-field">Stock color</div>
                <div className="lab-stock-palette" data-tutorial="stock-color">
                  {stockColorPresets.map((color) => (
                    <button key={color} type="button" className="lab-stock-color-btn" style={{ backgroundColor: color }} onClick={() => updateSelectedNode({ color })} aria-label={`Select stock color ${color}`} title={color} />
                  ))}
                  <input className="lab-stock-color-picker" type="color" value={resolveStockColor(String(selectedNode.data?.color ?? stockColorPresets[0]), colorblindMode)} onChange={(e) => updateSelectedNode({ color: e.target.value })} aria-label="Pick stock color" />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="lab-divider pt-3 space-y-2">
          <div className="text-sm lab-field lab-label-row">
            <span>Feedback loops</span>
            <HelpTip text={"Feedback loops create automatic control mechanisms.\n\nBalancing (B): pushes the system toward a goal value.\nReinforcing (R): amplifies change over time \u2014 growth or collapse."} />
          </div>
          {feedbackLoopList.length === 0 ? (
            <div className="text-xs lab-muted">No feedback loops yet.</div>
          ) : (
            <div className="lab-loop-list">
              {feedbackLoopList.map((loop) => (
                <div key={loop.id} className="lab-loop-item">
                  <div className="lab-loop-item-meta">
                    <div className="lab-loop-item-title">{loop.loopLabel}</div>
                    <div className="lab-loop-item-sub">
                      {loop.type === "balancing"
                        ? `${loop.stockLabel} -> ${loop.flowLabel} (${loop.operation}) | t=${loop.adjustmentTime}${loop.delayEnabled ? ` | delay=${loop.delaySteps}` : ""}`
                        : `${loop.stockLabel} -> ${loop.flowLabel} (${loop.polarity}) | k=${loop.k}${loop.delayEnabled ? ` | delay=${loop.delaySteps}` : ""}${loop.growthLimitNodeId ? " | growth limit" : ""}${loop.clampNonNegative ? " | clamp>=0" : ""}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" disabled={lockEditing} onClick={() => { setCreateFeedbackLoopStockId(null); setEditingFeedbackLoopId(loop.id); }}>Edit</button>
                    <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" disabled={lockEditing} onClick={() => {
                      if (!window.confirm("Delete this feedback loop?")) return;
                      const result = deleteBalancingFeedbackLoop(loop.id);
                      if (!result.ok) window.alert(result.error);
                      setEditingFeedbackLoopId((prev) => (prev === loop.id ? null : prev));
                    }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEdge && selectedEdgeIsControl ? (
          <div className="lab-divider pt-3 space-y-2">
            <div className="text-sm lab-field">Edge: {selectedEdge.id}</div>
            <label className="block text-xs lab-field">
              Operation on flow bottleneck
              <select className="lab-input mt-1" disabled={lockEditing} value={selectedEdgeOp} onChange={(e) => updateSelectedEdge({ op: e.target.value })}>
                {CONTROL_OPS.map((op) => (<option key={op.value} value={op.value}>{op.label} ({op.value})</option>))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="lab-divider pt-3" data-tutorial="chart">
          <div className="lab-chart-head">
            <span className="text-sm lab-field lab-label-row">
              <span>Simulation chart</span>
              <HelpTip text={"Shows all variables over time.\n\nClick a line or legend item to focus it \u2014 others will fade out.\nClick again to deselect.\nSelect a node on the canvas to view only its chart."} />
            </span>
            <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsChartModalOpen(true)} data-tutorial="chart-expand">Expand</button>
          </div>
          <SimulationChart steps={simulationSteps} focusIndex={sliderIndex} chartHeight={220} isLightTheme={isLightTheme} nodes={nodes} edges={edges} feedbackLoops={feedbackLoops} selectedNodeId={selectedNodeId} onFocusIndexChange={setSliderIndex} />
        </div>
      </aside>

      <FeedbackLoopModal
        isOpen={activeFeedbackLoopStockNode !== null}
        mode={editingFeedbackLoop ? "edit" : "create"}
        initialTab={feedbackLoopModalInitialTab}
        initialBalancingValues={feedbackLoopModalInitialBalancingValues}
        initialReinforcingValues={feedbackLoopModalInitialReinforcingValues}
        stockLabel={String(activeFeedbackLoopStockNode?.data?.label ?? activeFeedbackLoopStockNode?.id ?? "Stock")}
        connectedFlows={feedbackLoopFlowOptions}
        onClose={() => { setCreateFeedbackLoopStockId(null); setEditingFeedbackLoopId(null); }}
        onSubmitBalancingLoop={createBalancingLoopFromModal}
        onSubmitReinforcingLoop={createReinforcingLoopFromModal}
      />

      {isTaskModalOpen && lessonTaskContext ? (
        <div className="lab-modal-overlay" onClick={() => setIsTaskModalOpen(false)}>
          <div className="lab-task-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lab-chart-modal-head">
              <h3 className="lab-panel-title">Task</h3>
              <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsTaskModalOpen(false)}>Close</button>
            </div>
            <div className="lab-task-modal-body">
              <h4 className="lab-task-modal-title">{lessonTaskContext.taskTitle}</h4>
              <p className="lab-task-modal-description">{lessonTaskContext.taskDescription}</p>
              <div className={`text-sm ${isCurrentTaskCompleted ? "lab-task-status-completed" : "lab-muted"}`}>
                {isCurrentTaskCompleted ? "Task marked as completed." : "Task is not completed yet."}
              </div>
              {lessonTasksQuery.isError ? <div className="text-sm lab-error">Unable to load lesson tasks.</div> : null}
              <div className="lab-task-modal-actions">
                <button className="lab-btn lab-btn-primary" type="button" onClick={handleMarkTaskCompleted} disabled={isCurrentTaskCompleted || completeTaskMutation.isPending}>
                  {isCurrentTaskCompleted ? "Task completed" : completeTaskMutation.isPending ? "Saving..." : "Mark task as completed"}
                </button>
                <button className="lab-btn lab-btn-secondary" type="button" onClick={handleTaskProgressNavigation} disabled={!canResolveLessonNavigation}>
                  {!canResolveLessonNavigation ? "Loading lesson tasks..." : nextLessonTask ? "Go to next task" : "Finish lesson"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isChartModalOpen ? (
        <div className="lab-modal-overlay" data-tutorial="chart-modal" onClick={() => setIsChartModalOpen(false)}>
          <div className="lab-chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lab-chart-modal-head">
              <h3 className="lab-panel-title">Simulation chart</h3>
              <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsChartModalOpen(false)}>Close</button>
            </div>
            <SimulationChart
              steps={simulationSteps}
              focusIndex={sliderIndex}
              chartHeight="68vh"
              isLightTheme={isLightTheme}
              nodes={nodes}
              edges={edges}
              feedbackLoops={feedbackLoops}
              selectedNodeId={selectedNodeId}
              enableZoom
              showTimeline
              onFocusIndexChange={setSliderIndex}
            />
          </div>
        </div>
      ) : null}

      {isConfirmNewSystemOpen ? (
        <div className="lab-modal-overlay" onClick={() => setIsConfirmNewSystemOpen(false)}>
          <div className="lab-task-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lab-chart-modal-head"><h3 className="lab-panel-title">Create new system</h3></div>
            <div className="lab-task-modal-body">
              <p className="lab-task-modal-description">Are you sure you want to create a new system? Any unsaved changes will be lost.</p>
              <div className="lab-task-modal-actions">
                <button className="lab-btn lab-btn-primary" type="button" onClick={() => { setIsConfirmNewSystemOpen(false); doCreateNewSystem(); }}>Yes, create new</button>
                <button className="lab-btn lab-btn-secondary" type="button" onClick={() => setIsConfirmNewSystemOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <MarkReviewedModal
        isOpen={isReviewModalOpen}
        systemTitle={title}
        isSubmitting={markReviewedMutation.isPending}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmit={async (comment) => {
          if (!activeSystemId) return;
          await markReviewedMutation.mutateAsync({ systemId: activeSystemId, comment });
        }}
      />

      <LabHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

    </section>
  );
}

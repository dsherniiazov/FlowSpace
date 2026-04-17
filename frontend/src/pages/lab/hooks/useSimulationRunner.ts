import { useCallback, useEffect, useRef, useState } from "react";
import { Edge, Node } from "reactflow";

import { FeedbackLoop } from "../../../store/labStore";
import { RunStep } from "../../../types/api";
import { simulateTimeline } from "../simulation";
import { asNumber, isFlowNode } from "../utils";

const MAX_ANIMATION_MS = 30_000;
const TARGET_FPS = 30;

type Deps = {
  nodes: Node[];
  edges: Edge[];
  nodesById: Map<string, Node>;
  feedbackLoops: FeedbackLoop[];
  steps: number;
  dt: number;
  simulationSteps: RunStep[];
  sliderIndex: number;
  setSimulationSteps: (steps: RunStep[]) => void;
  setSliderIndex: (value: number) => void;
  setLockEditing: (value: boolean) => void;
};

function initialStateFrom(
  nodes: Node[],
  simulationSteps: RunStep[],
  sliderIndex: number,
): Record<string, number> {
  const snapshot = simulationSteps.length
    ? simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)]
    : null;
  const state: Record<string, number> = {};
  for (const node of nodes) {
    if (snapshot && snapshot.values[node.id] !== undefined) {
      const value = asNumber(snapshot.values[node.id], 0);
      state[node.id] = isFlowNode(node) ? Math.max(0, value) : value;
    } else {
      state[node.id] = isFlowNode(node)
        ? Math.max(0, asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0))
        : asNumber(node.data?.quantity ?? node.data?.initial ?? 0);
    }
  }
  return state;
}

export function useSimulationRunner(deps: Deps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const playSimulation = useCallback(
    (stepsData: RunStep[]): void => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (stepsData.length === 0) return;
      const duration = Math.min(
        MAX_ANIMATION_MS,
        Math.max(1000, stepsData.length * (1000 / TARGET_FPS)),
      );
      const start = performance.now();
      deps.setLockEditing(true);
      setIsPlaying(true);
      deps.setSliderIndex(0);

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / duration);
        const index = Math.min(
          stepsData.length - 1,
          Math.floor(progress * (stepsData.length - 1)),
        );
        deps.setSliderIndex(index);
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(tick);
          return;
        }
        deps.setSliderIndex(stepsData.length - 1);
        deps.setLockEditing(false);
        setIsPlaying(false);
        animationRef.current = null;
      };
      animationRef.current = requestAnimationFrame(tick);
    },
    [deps],
  );

  const runLocalSimulation = useCallback((): void => {
    const startState = initialStateFrom(deps.nodes, deps.simulationSteps, deps.sliderIndex);
    const stepsData = simulateTimeline(
      startState,
      deps.nodes,
      deps.edges,
      deps.nodesById,
      deps.feedbackLoops,
      deps.steps,
      deps.dt,
    );
    deps.setSimulationSteps(stepsData);
    playSimulation(stepsData);
  }, [deps, playSimulation]);

  const stopAnimation = useCallback((): void => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return { isPlaying, runLocalSimulation, stopAnimation };
}

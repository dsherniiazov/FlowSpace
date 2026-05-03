import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { fetchLessons } from "../../../features/lessons/api";
import { fetchLessonTasks } from "../../../features/lessonTasks/api";
import { fetchSections } from "../../../features/sections/api";
import { deleteSystem } from "../../../features/systems/api";
import { completeTask, fetchCompletedTasks, uncompleteTask } from "../../../features/taskProgress/api";
import { useTutorialStore } from "../../../store/tutorialStore";
import type { Lesson, LessonTask, Section } from "../../../types/api";
import type { LabTaskContext } from "../types";

type UseLessonTaskFlowArgs = {
  userId: number | null;
  activeSystemId: number | null;
  lessonTaskContext: LabTaskContext | null;
  isTaskModalOpen: boolean;
  setLessonTaskContext: (context: LabTaskContext | null) => void;
  setTaskModalOpen: (isOpen: boolean) => void;
  onLessonExitCleanup: () => void;
};

export function useLessonTaskFlow({
  userId,
  activeSystemId,
  lessonTaskContext,
  isTaskModalOpen,
  setLessonTaskContext,
  setTaskModalOpen,
  onLessonExitCleanup,
}: UseLessonTaskFlowArgs) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isExitingLesson, setIsExitingLesson] = useState(false);
  const [lessonExitError, setLessonExitError] = useState<string | null>(null);

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

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["completed-tasks", userId] });
      queryClient.invalidateQueries({ queryKey: ["completed-lessons", userId] });
      queryClient.invalidateQueries({ queryKey: ["progress", userId] });
    },
  });

  const lessonTasks: LessonTask[] = useMemo(
    () => [...(lessonTasksQuery.data ?? [])].sort(byOrder),
    [lessonTasksQuery.data],
  );
  const completedTaskSet = useMemo(
    () => new Set((completedTasksQuery.data ?? []).map((item) => item.task_id)),
    [completedTasksQuery.data],
  );
  const isCurrentTaskCompleted = lessonTaskContext
    ? completedTaskSet.has(lessonTaskContext.taskId)
    : false;
  const currentLessonTaskIndex = useMemo(() => {
    if (!lessonTaskContext) return -1;
    return lessonTasks.findIndex((task) => task.id === lessonTaskContext.taskId);
  }, [lessonTaskContext, lessonTasks]);
  const previousLessonTask = currentLessonTaskIndex > 0
    ? lessonTasks[currentLessonTaskIndex - 1] ?? null
    : null;
  const nextLessonTask = currentLessonTaskIndex >= 0
    ? lessonTasks[currentLessonTaskIndex + 1] ?? null
    : null;
  const canResolveLessonNavigation =
    lessonTaskContext !== null && !lessonTasksQuery.isLoading && !lessonTasksQuery.isError;

  const markCurrentTaskCompleted = useCallback((): void => {
    if (!lessonTaskContext || isCurrentTaskCompleted || completeTaskMutation.isPending) return;
    completeTaskMutation.mutate(lessonTaskContext.taskId);
  }, [lessonTaskContext, isCurrentTaskCompleted, completeTaskMutation]);

  const exitLesson = useCallback(async (): Promise<void> => {
    if (!lessonTaskContext || isExitingLesson) return;

    setLessonExitError(null);
    setIsExitingLesson(true);
    try {
      if (isCurrentTaskCompleted) {
        await uncompleteTask(lessonTaskContext.taskId);
      }

      if (activeSystemId) {
        await deleteSystem(activeSystemId);
      }

      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      queryClient.invalidateQueries({ queryKey: ["completed-tasks", userId] });
      queryClient.invalidateQueries({ queryKey: ["completed-lessons", userId] });
      queryClient.invalidateQueries({ queryKey: ["progress", userId] });

      onLessonExitCleanup();
      setLessonTaskContext(null);
      setTaskModalOpen(false);
      resetTutorialState();
      navigate("/app/lessons");
    } catch {
      setLessonExitError("Unable to exit lesson right now. Please try again.");
    } finally {
      setIsExitingLesson(false);
    }
  }, [
    lessonTaskContext,
    isExitingLesson,
    isCurrentTaskCompleted,
    activeSystemId,
    queryClient,
    userId,
    onLessonExitCleanup,
    setLessonTaskContext,
    setTaskModalOpen,
    navigate,
  ]);

  const requestExitLesson = useCallback((): void => {
    if (!lessonTaskContext || isExitingLesson) return;
    void exitLesson();
  }, [lessonTaskContext, isExitingLesson, exitLesson]);

  const navigateByTaskProgress = useCallback(async (): Promise<void> => {
    if (!lessonTaskContext || !canResolveLessonNavigation) return;
    if (nextLessonTask) {
      navigate(`/app/tasks/${nextLessonTask.id}`);
      return;
    }

    try {
      const [allLessons, allSections] = await Promise.all([
        queryClient.fetchQuery({ queryKey: ["lessons"], queryFn: fetchLessons }),
        queryClient.fetchQuery({ queryKey: ["sections"], queryFn: fetchSections }),
      ]);
      const nextLesson = findNextLesson(lessonTaskContext.lessonId, allLessons ?? [], allSections ?? []);

      if (nextLesson) {
        navigate(`/app/lessons?next=${nextLesson.id}`);
        return;
      }
    } catch {}

    navigate("/app/lessons");
  }, [
    lessonTaskContext,
    canResolveLessonNavigation,
    nextLessonTask,
    queryClient,
    navigate,
  ]);

  useEffect(() => {
    useTutorialStore.getState().setOnFinishCallback(() => {
      markCurrentTaskCompleted();
    });
    return () => useTutorialStore.getState().setOnFinishCallback(null);
  }, [markCurrentTaskCompleted]);

  useEffect(() => {
    if (!lessonTaskContext) {
      useTutorialStore.getState().setOnAbortCallback(null);
      return () => useTutorialStore.getState().setOnAbortCallback(null);
    }
    useTutorialStore.getState().setOnAbortCallback(requestExitLesson);
    return () => useTutorialStore.getState().setOnAbortCallback(null);
  }, [lessonTaskContext, requestExitLesson]);

  useEffect(() => {
    useTutorialStore.getState().setOverlaySuppressed(isTaskModalOpen);
    return () => useTutorialStore.getState().setOverlaySuppressed(false);
  }, [isTaskModalOpen]);

  return {
    lessonTasks,
    currentLessonTaskIndex,
    previousLessonTask,
    nextLessonTask,
    isCurrentTaskCompleted,
    canResolveLessonNavigation,
    lessonTasksError: lessonTasksQuery.isError,
    lessonExitError,
    completeTaskPending: completeTaskMutation.isPending,
    isExitingLesson,
    markCurrentTaskCompleted,
    navigateByTaskProgress,
    requestExitLesson,
  };
}

function byOrder<T extends { order_index?: number | null }>(a: T, b: T): number {
  return Number(a.order_index ?? Number.MAX_SAFE_INTEGER) -
    Number(b.order_index ?? Number.MAX_SAFE_INTEGER);
}

function findNextLesson(
  currentLessonId: number,
  lessons: Lesson[],
  sections: Section[],
): { id: number } | null {
  const current = lessons.find((lesson) => lesson.id === currentLessonId) ?? null;
  const currentSectionId = current?.section_id ?? null;
  if (!current) return null;

  const sameSection = lessons
    .filter((lesson) => (lesson.section_id ?? null) === currentSectionId)
    .sort(byOrder);
  const lessonIndex = sameSection.findIndex((lesson) => lesson.id === current.id);
  if (lessonIndex >= 0 && lessonIndex + 1 < sameSection.length) {
    return { id: sameSection[lessonIndex + 1].id };
  }

  if (currentSectionId === null) return null;

  const sortedSections = [...sections].sort(byOrder);
  const sectionIndex = sortedSections.findIndex((section) => section.id === currentSectionId);
  for (let index = sectionIndex + 1; index < sortedSections.length; index += 1) {
    const lessonsInSection = lessons
      .filter((lesson) => (lesson.section_id ?? null) === sortedSections[index].id)
      .sort(byOrder);

    if (lessonsInSection.length > 0) {
      return { id: lessonsInSection[0].id };
    }
  }

  return null;
}

function resetTutorialState(): void {
  const tutorial = useTutorialStore.getState();
  tutorial.reset();
  tutorial.setCachedLabState(null);
  tutorial.setOnFinishCallback(null);
  tutorial.setOnAbortCallback(null);
  tutorial.setOverlaySuppressed(false);
}

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

import { fetchLessons } from "../features/lessons/api";
import { fetchLessonTask, startLessonTask } from "../features/lessonTasks/api";
import { fetchSections } from "../features/sections/api";
import { completeTask, fetchCompletedTasks, uncompleteTask } from "../features/taskProgress/api";
import { AppLayoutOutletContext } from "../layouts/AppLayout";
import { useAuthStore } from "../store/authStore";
import { useLabStore } from "../store/labStore";

export function TaskExecutionPage(): JSX.Element {
  const { taskId } = useParams();
  const parsedTaskId = useMemo(() => (taskId ? Number(taskId) : null), [taskId]);
  const { setLessonHeader } = useOutletContext<AppLayoutOutletContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.userId);
  const loadGraphJson = useLabStore((state) => state.loadGraphJson);
  const setActiveSystemId = useLabStore((state) => state.setActiveSystemId);

  const taskQuery = useQuery({
    queryKey: ["lesson-task", parsedTaskId],
    queryFn: () => fetchLessonTask(parsedTaskId as number),
    enabled: !!parsedTaskId,
  });
  const lessonsQuery = useQuery({ queryKey: ["lessons"], queryFn: fetchLessons });
  const sectionsQuery = useQuery({ queryKey: ["sections"], queryFn: fetchSections });
  const completedTasksQuery = useQuery({
    queryKey: ["completed-tasks", userId],
    queryFn: fetchCompletedTasks,
    enabled: !!userId,
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async (payload: { taskId: number; completed: boolean }) =>
      payload.completed ? uncompleteTask(payload.taskId) : completeTask(payload.taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["completed-tasks", userId] });
      queryClient.invalidateQueries({ queryKey: ["completed-lessons", userId] });
      queryClient.invalidateQueries({ queryKey: ["progress", userId] });
    },
  });
  const startTaskMutation = useMutation({
    mutationFn: async (nextTaskId: number) => startLessonTask(nextTaskId),
    onSuccess: (system) => {
      if (!task) return;
      loadGraphJson(system.graph_json);
      setActiveSystemId(system.id);
      navigate("/app/lab", {
        state: {
          systemId: system.id,
          systemTitle: system.title,
          systemGraph: system.graph_json,
          taskContext: {
            taskId: task.id,
            lessonId: task.lesson_id,
            taskTitle: task.title,
            taskDescription: task.description,
          },
        },
      });
    },
  });

  const task = taskQuery.data ?? null;
  const lesson = task ? (lessonsQuery.data ?? []).find((item) => item.id === task.lesson_id) ?? null : null;
  const section = lesson ? (sectionsQuery.data ?? []).find((item) => item.id === lesson.section_id) ?? null : null;

  useEffect(() => {
    if (lesson && section) {
      setLessonHeader(`${section.title}/${lesson.title}`);
    } else {
      setLessonHeader(null);
    }
    return () => setLessonHeader(null);
  }, [lesson, section, setLessonHeader]);

  if (taskQuery.isLoading || lessonsQuery.isLoading || sectionsQuery.isLoading) return <div>Loading task...</div>;
  if (taskQuery.isError || !task) return <div className="text-zinc-400">Unable to load task.</div>;
  const done = new Set((completedTasksQuery.data ?? []).map((item) => item.task_id)).has(task.id);

  return (
    <section className="panel p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-2xl font-medium text-zinc-100">{task.title}</h2>
        <button className="btn-secondary" onClick={() => navigate(`/app/lessons/${task.lesson_id}`)}>Back to lesson</button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm text-zinc-400">{task.description}</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="btn-secondary"
          onClick={() => toggleTaskMutation.mutate({ taskId: task.id, completed: done })}
          disabled={toggleTaskMutation.isPending}
        >
          {done ? "Mark as not completed" : "Mark as completed"}
        </button>
        <button
          className="btn-primary"
          onClick={() => startTaskMutation.mutate(task.id)}
          disabled={startTaskMutation.isPending}
        >
          {startTaskMutation.isPending ? "Opening..." : "Open task system"}
        </button>
      </div>
    </section>
  );
}

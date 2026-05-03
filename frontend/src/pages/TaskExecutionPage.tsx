import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

import { fetchLessonTask, startLessonTask } from "../features/lessonTasks/api";
import { AppLayoutOutletContext } from "../layouts/AppLayout";
import { useLabStore } from "../store/labStore";

export function TaskExecutionPage(): JSX.Element {
  const { taskId } = useParams();
  const parsedTaskId = useMemo(() => (taskId ? Number(taskId) : null), [taskId]);
  const { setLessonHeader } = useOutletContext<AppLayoutOutletContext>();
  const navigate = useNavigate();
  const loadGraphJson = useLabStore((state) => state.loadGraphJson);
  const setActiveSystemId = useLabStore((state) => state.setActiveSystemId);
  const startedTaskIdRef = useRef<number | null>(null);

  const taskQuery = useQuery({
    queryKey: ["lesson-task", parsedTaskId],
    queryFn: () => fetchLessonTask(parsedTaskId as number),
    enabled: !!parsedTaskId,
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

  useEffect(() => {
    if (task) setLessonHeader(task.title);
    else setLessonHeader(null);
    return () => setLessonHeader(null);
  }, [task, setLessonHeader]);

  useEffect(() => {
    if (!task) return;
    if (startTaskMutation.isPending) return;
    if (startedTaskIdRef.current === task.id) return;
    startedTaskIdRef.current = task.id;
    startTaskMutation.mutate(task.id);
  }, [task, startTaskMutation]);

  if (taskQuery.isLoading || (task != null && startTaskMutation.isPending)) {
    return (
      <section className="panel p-6">
        <div className="text-zinc-300">Opening task…</div>
      </section>
    );
  }

  if (taskQuery.isError || !task) {
    return (
      <section className="panel p-6">
        <div className="text-zinc-400">Unable to load task.</div>
        <div className="mt-4">
          <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </section>
    );
  }

  if (startTaskMutation.isError) {
    return (
      <section className="panel p-6">
        <div className="text-zinc-400">Unable to open task system.</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              startedTaskIdRef.current = null;
              startTaskMutation.mutate(task.id);
            }}
          >
            Retry
          </button>
          <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel p-6">
      <div className="text-zinc-300">Opening task…</div>
    </section>
  );
}

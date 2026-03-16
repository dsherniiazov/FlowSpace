import { api } from "../../lib/api";
import { LessonTask, SystemModel } from "../../types/api";

export async function fetchLessonTasks(lessonId?: number): Promise<LessonTask[]> {
  const { data } = await api.get<LessonTask[]>("/lesson-tasks", {
    params: lessonId ? { lesson_id: lessonId } : undefined,
  });
  return data;
}

export async function createLessonTask(payload: {
  lesson_id: number;
  title: string;
  description: string;
  order_index?: number | null;
}): Promise<LessonTask> {
  const { data } = await api.post<LessonTask>("/lesson-tasks", payload);
  return data;
}

export async function fetchLessonTask(taskId: number): Promise<LessonTask> {
  const { data } = await api.get<LessonTask>(`/lesson-tasks/${taskId}`);
  return data;
}

export async function updateLessonTask(id: number, payload: Partial<LessonTask>): Promise<LessonTask> {
  const { data } = await api.put<LessonTask>(`/lesson-tasks/${id}`, payload);
  return data;
}

export async function deleteLessonTask(id: number): Promise<LessonTask> {
  const { data } = await api.delete<LessonTask>(`/lesson-tasks/${id}`);
  return data;
}

export async function startLessonTask(taskId: number): Promise<SystemModel> {
  const { data } = await api.post<SystemModel>(`/lesson-tasks/${taskId}/start`);
  return data;
}

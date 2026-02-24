import { api } from "../../lib/api";
import { CompletedLesson } from "../../types/api";

export async function fetchCompletedLessons(): Promise<CompletedLesson[]> {
  const { data } = await api.get<CompletedLesson[]>("/progress/completed");
  return data;
}

export async function completeLesson(lessonId: number): Promise<CompletedLesson> {
  const { data } = await api.post<CompletedLesson>(`/progress/${lessonId}/complete`);
  return data;
}

export async function uncompleteLesson(lessonId: number): Promise<CompletedLesson> {
  const { data } = await api.delete<CompletedLesson>(`/progress/${lessonId}`);
  return data;
}

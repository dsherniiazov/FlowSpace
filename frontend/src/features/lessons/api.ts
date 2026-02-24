import { api } from "../../lib/api";
import { Lesson } from "../../types/api";

export async function fetchLessons(): Promise<Lesson[]> {
  const { data } = await api.get<Lesson[]>("/lessons");
  return data;
}

export async function createLesson(payload: Pick<Lesson, "title" | "content_markdown" | "section_id">): Promise<Lesson> {
  const { data } = await api.post<Lesson>("/lessons", payload);
  return data;
}

export async function updateLesson(id: number, payload: Partial<Lesson>): Promise<Lesson> {
  const { data } = await api.put<Lesson>(`/lessons/${id}`, payload);
  return data;
}

export async function deleteLesson(id: number): Promise<Lesson> {
  const { data } = await api.delete<Lesson>(`/lessons/${id}`);
  return data;
}

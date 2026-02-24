import { api } from "../../lib/api";
import { Section } from "../../types/api";

export async function fetchSections(): Promise<Section[]> {
  const { data } = await api.get<Section[]>("/sections");
  return data;
}

export async function createSection(payload: {
  title: string;
  color?: string | null;
  order_index?: number | null;
  is_published?: boolean;
}): Promise<Section> {
  const { data } = await api.post<Section>("/sections", payload);
  return data;
}

export async function updateSection(id: number, payload: Partial<Section>): Promise<Section> {
  const { data } = await api.put<Section>(`/sections/${id}`, payload);
  return data;
}

export async function deleteSection(id: number): Promise<Section> {
  const { data } = await api.delete<Section>(`/sections/${id}`);
  return data;
}

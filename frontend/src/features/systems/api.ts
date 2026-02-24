import { api } from "../../lib/api";
import { SystemModel } from "../../types/api";

export async function fetchSystems(): Promise<SystemModel[]> {
  const { data } = await api.get<SystemModel[]>("/systems");
  return data;
}

export async function fetchSystem(systemId: number): Promise<SystemModel> {
  const { data } = await api.get<SystemModel>(`/systems/${systemId}`);
  return data;
}

export async function createSystem(payload: {
  owner_id: number;
  title: string;
  graph_json: Record<string, unknown>;
  lesson_id?: number | null;
  is_public?: boolean;
  is_template?: boolean;
}): Promise<SystemModel> {
  const { data } = await api.post<SystemModel>("/systems", payload);
  return data;
}

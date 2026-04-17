import { api } from "../../lib/api";
import { SystemModel, SystemWithOwner } from "../../types/api";

export async function fetchSystems(): Promise<SystemModel[]> {
  const { data } = await api.get<SystemModel[]>("/systems");
  return data;
}

export async function fetchSystem(systemId: number): Promise<SystemModel> {
  const { data } = await api.get<SystemModel>(`/systems/${systemId}`);
  return data;
}

export async function createSystem(payload: {
  owner_id?: number | null;
  title: string;
  graph_json: Record<string, unknown>;
  lesson_id?: number | null;
  is_public?: boolean;
  is_template?: boolean;
}): Promise<SystemModel> {
  const { data } = await api.post<SystemModel>("/systems", payload);
  return data;
}

export async function updateSystem(
  systemId: number,
  payload: {
    title?: string;
    graph_json?: Record<string, unknown>;
    owner_id?: number | null;
    lesson_id?: number | null;
    source_system_id?: number | null;
    is_public?: boolean;
    is_template?: boolean;
  },
): Promise<SystemModel> {
  const { data } = await api.put<SystemModel>(`/systems/${systemId}`, payload);
  return data;
}

export async function deleteSystem(systemId: number): Promise<SystemModel> {
  const { data } = await api.delete<SystemModel>(`/systems/${systemId}`);
  return data;
}

export async function submitSystemForReview(systemId: number): Promise<SystemModel> {
  const { data } = await api.post<SystemModel>(`/systems/${systemId}/submit-for-review`);
  return data;
}

export async function markSystemChangesSeen(systemId: number): Promise<SystemModel> {
  const { data } = await api.post<SystemModel>(`/systems/${systemId}/mark-seen`);
  return data;
}

export async function fetchPendingReviewSystems(): Promise<SystemWithOwner[]> {
  const { data } = await api.get<SystemWithOwner[]>("/systems/pending-review");
  return data;
}

export async function markSystemReviewed(
  systemId: number,
  comment?: string,
): Promise<SystemModel> {
  const payload = comment && comment.trim() ? { comment: comment.trim() } : undefined;
  const { data } = await api.post<SystemModel>(
    `/systems/pending-review/${systemId}/mark-reviewed`,
    payload,
  );
  return data;
}

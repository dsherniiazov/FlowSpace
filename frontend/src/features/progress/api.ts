import { api } from "../../lib/api";
import { ProgressSummary } from "../../types/api";

export async function fetchProgressSummary(): Promise<ProgressSummary> {
  const { data } = await api.get<ProgressSummary>("/progress");
  return data;
}

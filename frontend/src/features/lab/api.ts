import { api } from "../../lib/api";
import { RunCreatePayload, RunDetail, RunStep } from "../../types/api";

export async function runSimulation(payload: RunCreatePayload): Promise<RunDetail> {
  const { data } = await api.post<RunDetail>("/runs", payload);
  return data;
}

export async function fetchRunSteps(runId: number): Promise<RunStep[]> {
  const { data } = await api.get<RunStep[]>(`/runs/${runId}/steps`);
  return data;
}

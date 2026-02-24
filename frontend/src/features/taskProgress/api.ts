import { api } from "../../lib/api";
import { CompletedTask } from "../../types/api";

export async function fetchCompletedTasks(): Promise<CompletedTask[]> {
  const { data } = await api.get<CompletedTask[]>("/task-progress/completed");
  return data;
}

export async function completeTask(taskId: number): Promise<CompletedTask> {
  const { data } = await api.post<CompletedTask>(`/task-progress/${taskId}/complete`);
  return data;
}

export async function uncompleteTask(taskId: number): Promise<CompletedTask> {
  const { data } = await api.delete<CompletedTask>(`/task-progress/${taskId}`);
  return data;
}

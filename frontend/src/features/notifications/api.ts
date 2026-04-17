import { api } from "../../lib/api";
import { InboxNotification } from "../../types/api";

export async function fetchNotifications(): Promise<InboxNotification[]> {
  const { data } = await api.get<InboxNotification[]>("/notifications");
  return data;
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>("/notifications/unread-count");
  return data.count ?? 0;
}

export async function markNotificationRead(notificationId: number): Promise<InboxNotification> {
  const { data } = await api.post<InboxNotification>(`/notifications/${notificationId}/read`);
  return data;
}

export async function deleteNotification(notificationId: number): Promise<InboxNotification> {
  const { data } = await api.delete<InboxNotification>(`/notifications/${notificationId}`);
  return data;
}

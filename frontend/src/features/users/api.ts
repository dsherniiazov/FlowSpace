import { api } from "../../lib/api";
import { API_BASE_URL } from "../../lib/env";
import { UserPublic } from "../../types/api";

export async function fetchUsers(): Promise<UserPublic[]> {
  const { data } = await api.get<UserPublic[]>("/users");
  return data;
}

export async function fetchUserById(userId: number): Promise<UserPublic> {
  const { data } = await api.get<UserPublic>(`/users/${userId}`);
  return data;
}

export async function setUserAdmin(userId: number, isAdmin: boolean): Promise<UserPublic> {
  const { data } = await api.patch<UserPublic>(`/users/${userId}/admin`, { is_admin: isAdmin });
  return data;
}

export async function deleteUser(userId: number): Promise<UserPublic> {
  const { data } = await api.delete<UserPublic>(`/users/${userId}`);
  return data;
}

export async function uploadUserAvatar(userId: number, file: File): Promise<UserPublic> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<UserPublic>(`/users/${userId}/avatar`, formData);
  return data;
}

export async function changeUserPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<UserPublic> {
  const { data } = await api.post<UserPublic>(`/users/${userId}/change-password`, {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

export function getAvatarUrl(avatarPath?: string | null): string | null {
  if (!avatarPath) return null;
  if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://")) return avatarPath;
  return `${API_BASE_URL}${avatarPath}`;
}

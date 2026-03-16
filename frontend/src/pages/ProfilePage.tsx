import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ProfileAvatarModal } from "../components/ProfileAvatarModal";
import { ProfileConfirmModal } from "../components/ProfileConfirmModal";
import { ProfilePasswordModal } from "../components/ProfilePasswordModal";
import { fetchProgressSummary } from "../features/progress/api";
import { deleteSystem, fetchSystems } from "../features/systems/api";
import { changeUserPassword, deleteUser, getAvatarUrl, uploadUserAvatar } from "../features/users/api";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { UserPublic } from "../types/api";
import { useLabStore } from "../store/labStore";

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response;
    if (typeof response?.data?.detail === "string" && response.data.detail.trim()) {
      return response.data.detail;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function ProfilePage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.userId);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const clearSession = useAuthStore((state) => state.clearSession);
  const loadGraphJson = useLabStore((state) => state.loadGraphJson);
  const setActiveSystemId = useLabStore((state) => state.setActiveSystemId);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) throw new Error("No user id in token");
      const { data } = await api.get<UserPublic>(`/users/${userId}`);
      return data;
    },
    enabled: !!userId,
  });
  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: fetchProgressSummary,
    enabled: !!userId,
  });
  const systemsQuery = useQuery({
    queryKey: ["systems", userId],
    queryFn: fetchSystems,
    enabled: !!userId,
  });
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user id");
      return deleteUser(userId);
    },
    onSuccess: () => {
      queryClient.clear();
      clearSession();
      navigate("/auth/login", { replace: true });
    },
  });
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error("No user id");
      return uploadUserAvatar(userId, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-user", userId] });
    },
  });
  const changePasswordMutation = useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => {
      if (!userId) throw new Error("No user id");
      return changeUserPassword(userId, payload.currentPassword, payload.newPassword);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });
  const deleteSystemMutation = useMutation({
    mutationFn: async (systemId: number) => deleteSystem(systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    },
  });

  if (profileQuery.isLoading) return <div>Loading profile...</div>;
  if (profileQuery.isError || !profileQuery.data) return <div className="text-zinc-400">Unable to load profile.</div>;

  const profile = profileQuery.data;
  const systems = systemsQuery.data ?? [];
  const completion = Math.max(0, Math.min(100, progressQuery.data?.progress_percent ?? 0));
  const completedTasks = progressQuery.data?.completed_tasks ?? 0;
  const totalTasks = progressQuery.data?.total_tasks ?? 0;
  const initials = `${profile.name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase();
  const avatarUrl = getAvatarUrl(profile.avatar_path);

  async function handleAvatarUpload(file: File): Promise<void> {
    setProfileNotice(null);
    try {
      await uploadAvatarMutation.mutateAsync(file);
      setProfileNotice({ tone: "success", text: "Avatar updated." });
    } catch (error) {
      throw new Error(resolveErrorMessage(error, "Unable to upload avatar."));
    }
  }

  async function handlePasswordChange(currentPassword: string, newPassword: string): Promise<void> {
    setProfileNotice(null);
    try {
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
      setProfileNotice({ tone: "success", text: "Password updated." });
    } catch (error) {
      throw new Error(resolveErrorMessage(error, "Unable to update password."));
    }
  }

  return (
    <>
      <section className="profile-shell mx-auto max-w-5xl space-y-6">
        <div className="panel profile-main-panel p-8">
          <h2 className="profile-page-heading text-3xl font-medium text-white">Profile</h2>
          <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
            <div className="space-y-5">
              <div className="profile-block p-5">
                <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-4xl font-semibold text-zinc-100">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    initials || "U"
                  )}
                </div>
                <div className="profile-block-copy mt-3 text-center text-sm text-zinc-500">Profile avatar</div>
                <div className="mt-3 flex items-center justify-center">
                  <button className="btn-secondary" onClick={() => setIsAvatarModalOpen(true)} disabled={uploadAvatarMutation.isPending}>
                    {uploadAvatarMutation.isPending ? "Uploading..." : "Upload avatar"}
                  </button>
                </div>
                <div className="mt-4">
                  <div className="profile-block-copy mb-1 flex items-center justify-between text-xs text-zinc-500">
                    <span>Task progress</span>
                    <span>{progressQuery.isLoading ? "..." : `${completion}%`}</span>
                  </div>
                  <div className="profile-progress-track h-2.5 bg-zinc-800">
                    <div className="profile-progress-fill h-2.5 bg-zinc-200" style={{ width: `${completion}%` }} />
                  </div>
                  <div className="profile-block-copy mt-2 text-center text-xs text-zinc-500">
                    {progressQuery.isError ? "Unable to load task progress." : `${completedTasks} / ${totalTasks} tasks completed`}
                  </div>
                </div>
              </div>
            </div>

            <div className="profile-details grid gap-3 text-sm text-zinc-300">
              <div><span className="profile-label text-zinc-500">ID:</span> {profile.id}</div>
              <div>
                <span className="profile-label text-zinc-500">Name:</span> {profile.name} {profile.last_name}
                {isAdmin ? <span className="profile-role-badge ml-2 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200">admin</span> : null}
              </div>
              <div><span className="profile-label text-zinc-500">Email:</span> {profile.email}</div>
              <div><span className="profile-label text-zinc-500">Saved systems:</span> {systems.length}</div>
              <div>
                <span className="profile-label text-zinc-500">Tasks completed:</span>{" "}
                {progressQuery.isError ? "Unable to load" : `${completedTasks} / ${totalTasks}`}
              </div>
              {profileNotice ? (
                <div className={`profile-notice border px-4 py-3 text-sm ${profileNotice.tone === "success" ? "border-emerald-700/60 bg-emerald-950/50 text-emerald-100" : "border-red-700/60 bg-red-950/50 text-red-100"}`}>
                  {profileNotice.text}
                </div>
              ) : null}
              <div className="pt-2">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsPasswordModalOpen(true)}
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? "Updating..." : "Change password"}
                </button>
              </div>
              <div className="pt-2">
                <button
                  className="btn-secondary"
                  disabled={deleteAccountMutation.isPending}
                  onClick={() => setIsDeleteAccountModalOpen(true)}
                >
                  {deleteAccountMutation.isPending ? "Deleting..." : "Delete account"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="panel profile-main-panel p-6">
          <h3 className="profile-page-heading text-2xl font-medium text-white">My Systems</h3>
          {systemsQuery.isLoading ? <div className="mt-3 text-zinc-500">Loading systems...</div> : null}
          {systemsQuery.isError ? <div className="mt-3 text-zinc-400">Unable to fetch systems.</div> : null}
          {systems.length === 0 && !systemsQuery.isLoading ? <div className="mt-3 text-zinc-500">No systems saved yet.</div> : null}
          <div className="mt-4 grid gap-3">
            {systems.map((system) => (
              <div key={system.id} className="profile-system-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="profile-system-title font-semibold text-zinc-100">{system.title}</div>
                    <div className="profile-label text-xs text-zinc-500">ID {system.id}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        loadGraphJson(system.graph_json);
                        setActiveSystemId(system.id);
                        navigate("/app/lab", {
                          state: {
                            systemId: system.id,
                            systemTitle: system.title,
                            systemGraph: system.graph_json,
                          },
                        });
                      }}
                    >
                      Open in Lab
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        if (window.confirm(`Delete system "${system.title}"?`)) {
                          deleteSystemMutation.mutate(system.id);
                        }
                      }}
                      disabled={deleteSystemMutation.isPending}
                    >
                      {deleteSystemMutation.isPending ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProfilePasswordModal
        isOpen={isPasswordModalOpen}
        isSubmitting={changePasswordMutation.isPending}
        onClose={() => setIsPasswordModalOpen(false)}
        onSubmit={handlePasswordChange}
      />
      <ProfileAvatarModal
        isOpen={isAvatarModalOpen}
        isSubmitting={uploadAvatarMutation.isPending}
        currentAvatarUrl={avatarUrl}
        avatarFallbackText={initials || "U"}
        onClose={() => setIsAvatarModalOpen(false)}
        onUpload={handleAvatarUpload}
      />
      <ProfileConfirmModal
        isOpen={isDeleteAccountModalOpen}
        isSubmitting={deleteAccountMutation.isPending}
        title="Are you sure?"
        description="Deleting your account cannot be undone. Your profile data and access will be removed."
        confirmLabel="Yes"
        cancelLabel="No"
        onClose={() => setIsDeleteAccountModalOpen(false)}
        onConfirm={() => {
          setIsDeleteAccountModalOpen(false);
          deleteAccountMutation.mutate();
        }}
      />
    </>
  );
}

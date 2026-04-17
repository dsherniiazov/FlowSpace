import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ProfileAvatarModal } from "../components/ProfileAvatarModal";
import { ProfileConfirmModal } from "../components/ProfileConfirmModal";
import { ProfilePasswordModal } from "../components/ProfilePasswordModal";
import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
} from "../features/notifications/api";
import { fetchProgressSummary } from "../features/progress/api";
import { createSystem, deleteSystem, fetchSystems } from "../features/systems/api";
import { changeUserPassword, deleteUser, getAvatarUrl, uploadUserAvatar } from "../features/users/api";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { InboxNotification, UserPublic } from "../types/api";
import { useLabStore } from "../store/labStore";

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response;
    if (typeof response?.data?.detail === "string" && response.data.detail.trim()) {
      return response.data.detail;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.toLowerCase() === "network error"
  ) {
    return "Network error. Verify that the API is running and reachable at the configured VITE_API_BASE_URL.";
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
  // Id of the most recently imported system in this session — used to anchor
  // the tutorial spotlight on the specific card the user just created.
  const [lastImportedSystemId, setLastImportedSystemId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "inbox">("profile");
  const [openNotificationId, setOpenNotificationId] = useState<number | null>(null);

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

  const notificationsQuery = useQuery({
    queryKey: ["notifications", userId],
    queryFn: fetchNotifications,
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markReadMutation = useMutation({
    mutationFn: (notificationId: number) => markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", userId] });
    },
  });
  const deleteNotificationMutation = useMutation({
    mutationFn: (notificationId: number) => deleteNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", userId] });
    },
  });

  const importFileRef = useRef<HTMLInputElement>(null);
  const importSystemMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const graph = JSON.parse(text) as Record<string, unknown>;
      const title = file.name.replace(/\.json$/i, "");
      if (!userId) throw new Error("No user id");
      return createSystem({ owner_id: userId, title, graph_json: graph });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      setProfileNotice({ tone: "success", text: "System imported successfully." });
      if (created && typeof created.id === "number") setLastImportedSystemId(created.id);
    },
    onError: (error) => {
      setProfileNotice({ tone: "error", text: resolveErrorMessage(error, "Unable to import system.") });
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

  const openNotification = notifications.find((n) => n.id === openNotificationId) ?? null;

  return (
    <>
      <section className="profile-shell mx-auto max-w-5xl space-y-6">
        <div className="profile-tabs" role="tablist" aria-label="Profile sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "profile"}
            className={`profile-tab ${activeTab === "profile" ? "is-active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "inbox"}
            className={`profile-tab ${activeTab === "inbox" ? "is-active" : ""}`}
            onClick={() => setActiveTab("inbox")}
          >
            Inbox
            {unreadCount > 0 ? (
              <span className="profile-tab-badge" aria-label={`${unreadCount} unread`}>
                {unreadCount}
              </span>
            ) : null}
          </button>
        </div>

        {activeTab === "profile" ? (
        <>
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
                {isAdmin ? <span className="profile-role-badge ml-2 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200">teacher</span> : null}
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
          <div className="flex items-center justify-between">
            <h3 className="profile-page-heading text-2xl font-medium text-white">My Systems</h3>
            <div>
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importSystemMutation.mutate(file);
                  e.target.value = "";
                }}
              />
              <button
                className="btn-secondary"
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={importSystemMutation.isPending}
                data-tutorial="import-system"
              >
                {importSystemMutation.isPending ? "Importing..." : "Import system"}
              </button>
            </div>
          </div>
          {systemsQuery.isLoading ? <div className="mt-3 text-zinc-500">Loading systems...</div> : null}
          {systemsQuery.isError ? <div className="mt-3 text-zinc-400">Unable to fetch systems.</div> : null}
          {systems.length === 0 && !systemsQuery.isLoading ? <div className="mt-3 text-zinc-500">No systems saved yet.</div> : null}
          <div className="mt-4 grid gap-3">
            {systems.map((system) => {
              const isImported = system.id === lastImportedSystemId;
              return (
              <div
                key={system.id}
                className="profile-system-card p-4"
                style={{ position: "relative" }}
                data-tutorial={isImported ? "imported-system-card" : undefined}
              >
                {system.has_unseen_changes ? (
                  <div className="profile-system-new-badge">new changes!</div>
                ) : null}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="profile-system-title font-semibold text-zinc-100">{system.title}</div>
                    <div className="profile-label text-xs text-zinc-500">ID {system.id}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      className="btn-secondary"
                      data-tutorial={isImported ? "open-imported-system" : undefined}
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
              );
            })}
          </div>
        </div>
        </>
        ) : (
          <InboxPanel
            notifications={notifications}
            isLoading={notificationsQuery.isLoading}
            isError={notificationsQuery.isError}
            openNotification={openNotification}
            onOpen={(n) => {
              setOpenNotificationId(n.id);
              if (!n.read_at) markReadMutation.mutate(n.id);
            }}
            onClose={() => setOpenNotificationId(null)}
            onDelete={(n) => {
              if (openNotificationId === n.id) setOpenNotificationId(null);
              deleteNotificationMutation.mutate(n.id);
            }}
            onOpenSystem={(n) => {
              if (!n.system_id) return;
              navigate("/app/lab", { state: { systemId: n.system_id, systemTitle: n.system_title ?? "" } });
            }}
          />
        )}
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

type InboxPanelProps = {
  notifications: InboxNotification[];
  isLoading: boolean;
  isError: boolean;
  openNotification: InboxNotification | null;
  onOpen: (n: InboxNotification) => void;
  onClose: () => void;
  onDelete: (n: InboxNotification) => void;
  onOpenSystem: (n: InboxNotification) => void;
};

function InboxPanel(props: InboxPanelProps): JSX.Element {
  const { notifications, isLoading, isError, openNotification, onOpen, onClose, onDelete, onOpenSystem } = props;

  return (
    <div className="panel profile-main-panel p-6">
      <div className="flex items-center justify-between">
        <h3 className="profile-page-heading text-2xl font-medium text-white">Inbox</h3>
        <div className="text-xs text-zinc-500">
          {notifications.length} {notifications.length === 1 ? "message" : "messages"}
        </div>
      </div>

      {isLoading ? <div className="mt-3 text-zinc-500">Loading inbox...</div> : null}
      {isError ? <div className="mt-3 text-zinc-400">Unable to load notifications.</div> : null}
      {notifications.length === 0 && !isLoading ? (
        <div className="mt-3 text-zinc-500">Your inbox is empty. Teacher feedback on submitted systems will appear here.</div>
      ) : null}

      <ul className="mt-4 grid gap-2" role="list">
        {notifications.map((n) => {
          const unread = !n.read_at;
          const date = new Date(n.created_at);
          return (
            <li key={n.id}>
              <button
                type="button"
                className={`inbox-item w-full text-left ${unread ? "inbox-item-unread" : ""}`}
                onClick={() => onOpen(n)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="inbox-item-title truncate">
                      {unread ? <span className="inbox-dot" aria-hidden="true" /> : null}
                      {n.title}
                    </div>
                    <div className="inbox-item-meta truncate text-xs text-zinc-500">
                      {n.sender_name ? `From ${n.sender_name}` : "System"} ·{" "}
                      {isNaN(date.valueOf()) ? "" : date.toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(n);
                      }}
                      aria-label="Delete notification"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {openNotification ? (
        <div className="profile-modal-overlay" onClick={onClose}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="profile-modal-head">
              <div>
                <h3 className="profile-modal-title">{openNotification.title}</h3>
                <p className="profile-modal-subtitle">
                  {openNotification.sender_name ? `From ${openNotification.sender_name}` : "System"}
                  {openNotification.system_title ? ` · "${openNotification.system_title}"` : ""}
                </p>
              </div>
            </div>
            <div className="inbox-modal-body">
              {openNotification.body && openNotification.body.trim() ? (
                <p className="inbox-modal-text">{openNotification.body}</p>
              ) : (
                <p className="inbox-modal-text text-zinc-500">
                  Your teacher marked the system as reviewed without leaving a written comment.
                </p>
              )}
            </div>
            <div className="profile-modal-actions">
              {openNotification.system_id ? (
                <button className="btn-secondary" type="button" onClick={() => onOpenSystem(openNotification)}>
                  Open system in Lab
                </button>
              ) : null}
              <button className="btn-primary" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

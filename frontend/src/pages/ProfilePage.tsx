import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ProfileAvatarModal } from "../components/ProfileAvatarModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
import { UserPublic } from "../types/api";
import { useLabStore } from "../store/labStore";
import { InboxPanel } from "./profile/InboxPanel";
import { MySystemsPanel } from "./profile/MySystemsPanel";
import { ProfileSummaryPanel } from "./profile/ProfileSummaryPanel";
import { ProfileTabs } from "./profile/ProfileTabs";

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
  const [lastImportedSystemId, setLastImportedSystemId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "inbox">("profile");
  const [openNotificationId, setOpenNotificationId] = useState<number | null>(null);
  const [systemPendingDeletion, setSystemPendingDeletion] = useState<{ id: number; title: string } | null>(null);

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
      setSystemPendingDeletion(null);
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
        <ProfileTabs activeTab={activeTab} unreadCount={unreadCount} onChange={setActiveTab} />

        {activeTab === "profile" ? (
          <>
            <ProfileSummaryPanel
              profile={profile}
              initials={initials}
              avatarUrl={avatarUrl}
              isAdmin={isAdmin}
              systemsCount={systems.length}
              completionPercent={completion}
              completedTasks={completedTasks}
              totalTasks={totalTasks}
              isProgressLoading={progressQuery.isLoading}
              isProgressError={progressQuery.isError}
              notice={profileNotice}
              isAvatarUploading={uploadAvatarMutation.isPending}
              isPasswordUpdating={changePasswordMutation.isPending}
              isAccountDeleting={deleteAccountMutation.isPending}
              onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
              onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
              onOpenDeleteAccountModal={() => setIsDeleteAccountModalOpen(true)}
            />
            <MySystemsPanel
              systems={systems}
              isLoading={systemsQuery.isLoading}
              isError={systemsQuery.isError}
              isImporting={importSystemMutation.isPending}
              isDeleting={deleteSystemMutation.isPending}
              lastImportedSystemId={lastImportedSystemId}
              importFileRef={importFileRef}
              onImportFile={(file) => importSystemMutation.mutate(file)}
              onOpenSystem={(system) => {
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
              onDeleteSystem={(system) => {
                setSystemPendingDeletion({ id: system.id, title: system.title });
              }}
            />
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
            onOpenSystem={async (n) => {
              if (!n.system_id || !userId) return;
              const systems = await queryClient.fetchQuery({ queryKey: ["systems", userId], queryFn: fetchSystems });
              const sys = systems.find((s) => s.id === n.system_id);
              const graph = sys?.graph_json && typeof sys.graph_json === "object" ? sys.graph_json : undefined;
              navigate("/app/lab", {
                state: {
                  systemId: n.system_id,
                  systemTitle: (sys?.title ?? n.system_title ?? "") || "",
                  ...(graph ? { systemGraph: graph } : {}),
                },
              });
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
      <ConfirmDialog
        isOpen={systemPendingDeletion !== null}
        title="Delete system?"
        description={`Delete "${systemPendingDeletion?.title ?? "this system"}"? This action cannot be undone.`}
        confirmLabel="Delete system"
        isSubmitting={deleteSystemMutation.isPending}
        onClose={() => setSystemPendingDeletion(null)}
        onConfirm={() => {
          if (systemPendingDeletion) deleteSystemMutation.mutate(systemPendingDeletion.id);
        }}
      />
    </>
  );
}

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { deleteSystem, fetchSystems } from "../features/systems/api";
import { changeUserPassword, deleteUser, getAvatarUrl, uploadUserAvatar } from "../features/users/api";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { UserPublic } from "../types/api";
import { useLabStore } from "../store/labStore";

export function ProfilePage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.userId);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const clearSession = useAuthStore((state) => state.clearSession);
  const loadGraphJson = useLabStore((state) => state.loadGraphJson);
  const setActiveSystemId = useLabStore((state) => state.setActiveSystemId);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) throw new Error("No user id in token");
      const { data } = await api.get<UserPublic>(`/users/${userId}`);
      return data;
    },
    enabled: !!userId,
  });
  const systemsQuery = useQuery({ queryKey: ["systems"], queryFn: fetchSystems });
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user id");
      return deleteUser(userId);
    },
    onSuccess: () => {
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
    mutationFn: async () => {
      if (!userId) throw new Error("No user id");
      return changeUserPassword(userId, currentPassword, newPassword);
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
    onError: () => setPasswordMessage("Unable to update password."),
  });
  const deleteSystemMutation = useMutation({
    mutationFn: async (systemId: number) => deleteSystem(systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systems"] });
    },
  });

  if (profileQuery.isLoading) return <div>Loading profile...</div>;
  if (profileQuery.isError || !profileQuery.data) return <div className="text-zinc-400">Unable to load profile.</div>;

  const profile = profileQuery.data;
  const systems = systemsQuery.data ?? [];
  const completion = Math.min(100, 40 + (profile.name ? 20 : 0) + (profile.last_name ? 15 : 0) + (systems.length > 0 ? 25 : 0));
  const initials = `${profile.name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase();
  const avatarUrl = getAvatarUrl(profile.avatar_path);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="panel p-8">
        <h2 className="text-3xl font-medium text-white">Profile</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
          <div className="space-y-5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-4xl font-semibold text-zinc-100">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full rounded-full object-cover" />
                ) : (
                  initials || "U"
                )}
              </div>
              <div className="mt-3 text-center text-sm text-zinc-500">Profile avatar</div>
              <div className="mt-3 flex items-center justify-center">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    uploadAvatarMutation.mutate(file);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  className="btn-secondary"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadAvatarMutation.isPending}
                >
                  {uploadAvatarMutation.isPending ? "Uploading..." : "Upload avatar"}
                </button>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>Profile progress</span>
                  <span>{completion}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-zinc-800">
                  <div className="h-2.5 rounded-full bg-zinc-200" style={{ width: `${completion}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-sm text-zinc-300">
            <div><span className="text-zinc-500">ID:</span> {profile.id}</div>
            <div>
              <span className="text-zinc-500">Name:</span> {profile.name} {profile.last_name}
              {isAdmin ? <span className="ml-2 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200">admin</span> : null}
            </div>
            <div><span className="text-zinc-500">Email:</span> {profile.email}</div>
            <div><span className="text-zinc-500">Saved systems:</span> {systems.length}</div>
            <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="mb-3 text-xs uppercase tracking-wider text-zinc-500">Change password</div>
              <div className="space-y-2">
                <input
                  className="input"
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <button
                  className="btn-secondary"
                  disabled={
                    changePasswordMutation.isPending
                    || !currentPassword
                    || !newPassword
                    || newPassword !== confirmPassword
                  }
                  onClick={() => {
                    setPasswordMessage(null);
                    if (newPassword !== confirmPassword) {
                      setPasswordMessage("New password confirmation does not match.");
                      return;
                    }
                    changePasswordMutation.mutate();
                  }}
                >
                  {changePasswordMutation.isPending ? "Updating..." : "Change password"}
                </button>
                {passwordMessage ? <div className="text-xs text-zinc-400">{passwordMessage}</div> : null}
              </div>
            </div>
            <div className="pt-2">
              <button
                className="btn-secondary"
                disabled={deleteAccountMutation.isPending}
                onClick={() => {
                  if (window.confirm("Delete your account? This action cannot be undone.")) {
                    deleteAccountMutation.mutate();
                  }
                }}
              >
                {deleteAccountMutation.isPending ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel p-6">
        <h3 className="text-2xl font-medium text-white">My Systems</h3>
        {systemsQuery.isLoading ? <div className="mt-3 text-zinc-500">Loading systems...</div> : null}
        {systemsQuery.isError ? <div className="mt-3 text-zinc-400">Unable to fetch systems.</div> : null}
        {systems.length === 0 && !systemsQuery.isLoading ? <div className="mt-3 text-zinc-500">No systems saved yet.</div> : null}
        <div className="mt-4 grid gap-3">
          {systems.map((system) => (
            <div key={system.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-zinc-100">{system.title}</div>
                  <div className="text-xs text-zinc-500">ID {system.id}</div>
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
  );
}

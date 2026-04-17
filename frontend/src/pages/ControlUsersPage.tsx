import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteUser, fetchUsers, getAvatarUrl, setUserAdmin } from "../features/users/api";
import { useAuthStore } from "../store/authStore";

export function ControlUsersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.userId);
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const adminMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: number; isAdmin: boolean }) => setUserAdmin(userId, isAdmin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="panel control-panel p-4">
      <h3 className="control-section-heading mb-3 text-lg font-medium">Users</h3>
      {usersQuery.isLoading ? <div>Loading users...</div> : null}
      {usersQuery.isError ? <div className="text-zinc-400">Failed to load users</div> : null}
      <div className="space-y-2">
        {(usersQuery.data ?? []).map((user) => {
          const isSelf = user.id === currentUserId;
          const avatarUrl = getAvatarUrl(user.avatar_path);
          const initials = `${user.name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "U";
          return (
            <div key={user.id} className="control-user-card flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <div className="user-chip-avatar">
                  {avatarUrl ? <img src={avatarUrl} alt={`${user.email} avatar`} className="block h-full w-full rounded-full object-cover" /> : initials}
                </div>
                <div>
                <div className="control-user-title font-medium">{user.name} {user.last_name}</div>
                <div className="control-user-copy text-xs text-slate-500">{user.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="control-user-copy text-xs">{isSelf ? "you" : user.is_admin ? "teacher" : "student"}</span>
                {!isSelf ? (
                  <>
                    <button
                      className="btn-secondary"
                      disabled={adminMutation.isPending}
                      onClick={() => adminMutation.mutate({ userId: user.id, isAdmin: !user.is_admin })}
                    >
                      {user.is_admin ? "Remove teacher" : "Make teacher"}
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete user ${user.email}?`)) {
                          deleteMutation.mutate(user.id);
                        }
                      }}
                    >
                      Delete user
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

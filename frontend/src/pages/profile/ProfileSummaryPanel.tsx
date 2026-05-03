import type { UserPublic } from "../../types/api";

type ProfileNotice = { tone: "success" | "error"; text: string };

type ProfileSummaryPanelProps = {
  profile: UserPublic;
  initials: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  systemsCount: number;
  completionPercent: number;
  completedTasks: number;
  totalTasks: number;
  isProgressLoading: boolean;
  isProgressError: boolean;
  notice: ProfileNotice | null;
  isAvatarUploading: boolean;
  isPasswordUpdating: boolean;
  isAccountDeleting: boolean;
  onOpenAvatarModal: () => void;
  onOpenPasswordModal: () => void;
  onOpenDeleteAccountModal: () => void;
};

export function ProfileSummaryPanel({
  profile,
  initials,
  avatarUrl,
  isAdmin,
  systemsCount,
  completionPercent,
  completedTasks,
  totalTasks,
  isProgressLoading,
  isProgressError,
  notice,
  isAvatarUploading,
  isPasswordUpdating,
  isAccountDeleting,
  onOpenAvatarModal,
  onOpenPasswordModal,
  onOpenDeleteAccountModal,
}: ProfileSummaryPanelProps): JSX.Element {
  return (
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
              <button className="btn-secondary" onClick={onOpenAvatarModal} disabled={isAvatarUploading}>
                {isAvatarUploading ? "Uploading..." : "Upload avatar"}
              </button>
            </div>
            <div className="mt-4">
              <div className="profile-block-copy mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>Task progress</span>
                <span>{isProgressLoading ? "..." : `${completionPercent}%`}</span>
              </div>
              <div className="profile-progress-track h-2.5 bg-zinc-800">
                <div className="profile-progress-fill h-2.5 bg-zinc-200" style={{ width: `${completionPercent}%` }} />
              </div>
              <div className="profile-block-copy mt-2 text-center text-xs text-zinc-500">
                {isProgressError ? "Unable to load task progress." : `${completedTasks} / ${totalTasks} tasks completed`}
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
          <div><span className="profile-label text-zinc-500">Saved systems:</span> {systemsCount}</div>
          <div>
            <span className="profile-label text-zinc-500">Tasks completed:</span>{" "}
            {isProgressError ? "Unable to load" : `${completedTasks} / ${totalTasks}`}
          </div>
          {notice ? (
            <div className={`profile-notice border px-4 py-3 text-sm ${notice.tone === "success" ? "border-emerald-700/60 bg-emerald-950/50 text-emerald-100" : "border-red-700/60 bg-red-950/50 text-red-100"}`}>
              {notice.text}
            </div>
          ) : null}
          <div className="pt-2">
            <button className="btn-secondary" type="button" onClick={onOpenPasswordModal} disabled={isPasswordUpdating}>
              {isPasswordUpdating ? "Updating..." : "Change password"}
            </button>
          </div>
          <div className="pt-2">
            <button className="btn-secondary" disabled={isAccountDeleting} onClick={onOpenDeleteAccountModal}>
              {isAccountDeleting ? "Deleting..." : "Delete account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

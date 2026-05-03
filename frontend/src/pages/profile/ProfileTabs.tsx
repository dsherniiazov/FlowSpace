type ProfileTabsProps = {
  activeTab: "profile" | "inbox";
  unreadCount: number;
  onChange: (tab: "profile" | "inbox") => void;
};

export function ProfileTabs({ activeTab, unreadCount, onChange }: ProfileTabsProps): JSX.Element {
  return (
    <div className="profile-tabs" role="tablist" aria-label="Profile sections">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "profile"}
        className={`profile-tab ${activeTab === "profile" ? "is-active" : ""}`}
        onClick={() => onChange("profile")}
      >
        Profile
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "inbox"}
        className={`profile-tab ${activeTab === "inbox" ? "is-active" : ""}`}
        onClick={() => onChange("inbox")}
      >
        Inbox
        {unreadCount > 0 ? (
          <span className="profile-tab-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}

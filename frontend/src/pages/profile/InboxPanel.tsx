import type { InboxNotification } from "../../types/api";

type InboxPanelProps = {
  notifications: InboxNotification[];
  isLoading: boolean;
  isError: boolean;
  openNotification: InboxNotification | null;
  onOpen: (notification: InboxNotification) => void;
  onClose: () => void;
  onDelete: (notification: InboxNotification) => void;
  onOpenSystem: (notification: InboxNotification) => void;
};

export function InboxPanel({
  notifications,
  isLoading,
  isError,
  openNotification,
  onOpen,
  onClose,
  onDelete,
  onOpenSystem,
}: InboxPanelProps): JSX.Element {
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
        {notifications.map((notification) => (
          <NotificationListItem
            key={notification.id}
            notification={notification}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </ul>

      {openNotification ? (
        <NotificationModal
          notification={openNotification}
          onClose={onClose}
          onOpenSystem={onOpenSystem}
        />
      ) : null}
    </div>
  );
}

function NotificationListItem({
  notification,
  onOpen,
  onDelete,
}: {
  notification: InboxNotification;
  onOpen: (notification: InboxNotification) => void;
  onDelete: (notification: InboxNotification) => void;
}): JSX.Element {
  const unread = !notification.read_at;
  const date = new Date(notification.created_at);

  return (
    <li>
      <button
        type="button"
        className={`inbox-item w-full text-left ${unread ? "inbox-item-unread" : ""}`}
        onClick={() => onOpen(notification)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inbox-item-title truncate">
              {unread ? <span className="inbox-dot" aria-hidden="true" /> : null}
              {notification.title}
            </div>
            <div className="inbox-item-meta truncate text-xs text-zinc-500">
              {notification.sender_name ? `From ${notification.sender_name}` : "System"}{" "}
              {isNaN(date.valueOf()) ? "" : date.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(notification);
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
}

function NotificationModal({
  notification,
  onClose,
  onOpenSystem,
}: {
  notification: InboxNotification;
  onClose: () => void;
  onOpenSystem: (notification: InboxNotification) => void;
}): JSX.Element {
  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="profile-modal-head">
          <div>
            <h3 className="profile-modal-title">{notification.title}</h3>
            <p className="profile-modal-subtitle">
              {notification.sender_name ? `From ${notification.sender_name}` : "System"}
              {notification.system_title ? ` "${notification.system_title}"` : ""}
            </p>
          </div>
        </div>
        <div className="inbox-modal-body">
          {notification.body && notification.body.trim() ? (
            <p className="inbox-modal-text">{notification.body}</p>
          ) : (
            <p className="inbox-modal-text text-zinc-500">
              Your teacher marked the system as reviewed without leaving a written comment.
            </p>
          )}
        </div>
        <div className="profile-modal-actions">
          {notification.system_id ? (
            <button className="btn-secondary" type="button" onClick={() => onOpenSystem(notification)}>
              Open system in Lab
            </button>
          ) : null}
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

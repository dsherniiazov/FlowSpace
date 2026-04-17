type Props = {
  isOpen: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function CommentEntryOverlay({
  isOpen,
  draft,
  onDraftChange,
  onSave,
  onCancel,
}: Props): JSX.Element | null {
  if (!isOpen) return null;
  return (
    <div
      className="lab-comment-entry-overlay"
      data-tutorial="comment-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="lab-comment-entry" data-tutorial="comment-entry">
        <div className="lab-comment-entry-title">Add comment</div>
        <textarea
          className="lab-comment-entry-textarea"
          autoFocus
          rows={4}
          placeholder="Write your comment..."
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
        />
        <div className="lab-comment-entry-actions">
          <button className="lab-btn lab-btn-secondary" onClick={onSave}>Save</button>
          <button className="lab-btn lab-btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

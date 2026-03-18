import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NodeProps } from "reactflow";
import { fetchUserById, getAvatarUrl } from "../features/users/api";

export type CommentNodeData = {
  text: string;
  authorId: number;
  authorName: string;
  authorEmail: string;
  authorAvatarPath?: string | null;
};

function useAuthorProfile(authorId: number) {
  return useQuery({
    queryKey: ["comment-author", authorId],
    queryFn: () => fetchUserById(authorId),
    enabled: authorId > 0,
    staleTime: 60_000,
  });
}

function CommentPopup({
  data,
  onClose,
}: {
  data: CommentNodeData;
  onClose: () => void;
}): JSX.Element {
  const profileQuery = useAuthorProfile(data.authorId);
  const avatarUrl = getAvatarUrl(profileQuery.data?.avatar_path ?? data.authorAvatarPath);
  const initials = String(data.authorName || data.authorEmail || "?")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div
      className="comment-popup-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="comment-popup">
        <div className="comment-popup-header">
          <div className="comment-popup-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Author avatar" className="block h-full w-full rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="comment-popup-author">
            <div className="comment-popup-author-name">{data.authorName || "Unknown"}</div>
            <div className="comment-popup-author-email">{data.authorEmail}</div>
          </div>
          <button className="comment-popup-close" onClick={onClose} aria-label="Close comment">
            ✕
          </button>
        </div>
        <div className="comment-popup-body">{data.text}</div>
      </div>
    </div>
  );
}

export function CommentNode({ data }: NodeProps<CommentNodeData>): JSX.Element {
  const [showPopup, setShowPopup] = useState(false);
  const profileQuery = useAuthorProfile(data.authorId);
  const avatarUrl = getAvatarUrl(profileQuery.data?.avatar_path ?? data.authorAvatarPath);
  const initials = String(data.authorName || data.authorEmail || "?")
    .slice(0, 1)
    .toUpperCase();
  const previewText = data.text.length > 60 ? data.text.slice(0, 57) + "…" : data.text;

  return (
    <>
      <div
        className="comment-node"
        onClick={(e) => {
          e.stopPropagation();
          setShowPopup(true);
        }}
        title="Click to read comment"
      >
        <div className="comment-node-bubble">
          <div className="comment-node-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Author" className="block h-full w-full rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="comment-node-preview">{previewText || "(empty comment)"}</div>
        </div>
        <div className="comment-node-tail" />
      </div>

      {showPopup ? (
        <CommentPopup data={data} onClose={() => setShowPopup(false)} />
      ) : null}
    </>
  );
}

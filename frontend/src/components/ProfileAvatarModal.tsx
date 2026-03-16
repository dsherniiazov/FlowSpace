import { ChangeEvent, DragEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { matchesShortcutEvent, useShortcutStore } from "../store/shortcutStore";

const AVATAR_VIEWPORT_SIZE = 320;
const AVATAR_PREVIEW_SIZE = 112;
const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_MIN_ZOOM = 1;
const AVATAR_MAX_ZOOM = 4;
const SUPPORTED_AVATAR_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
]);
const SUPPORTED_AVATAR_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif", ".jfif"]);

type ProfileAvatarModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  currentAvatarUrl: string | null;
  avatarFallbackText: string;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
};

type ImageDimensions = {
  width: number;
  height: number;
};

type Offset = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
};

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function isSupportedAvatarFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return SUPPORTED_AVATAR_MIME_TYPES.has(file.type) || SUPPORTED_AVATAR_EXTENSIONS.has(extension);
}

function clampOffset(offset: Offset, dimensions: ImageDimensions, scale: number): Offset {
  const displayWidth = dimensions.width * scale;
  const displayHeight = dimensions.height * scale;
  const maxOffsetX = Math.max(0, (displayWidth - AVATAR_VIEWPORT_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - AVATAR_VIEWPORT_SIZE) / 2);

  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, offset.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, offset.y)),
  };
}

function buildOutputFileName(originalName: string): string {
  const safeBaseName = originalName
    .replace(/\.[^.]+$/, "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return `${safeBaseName || "avatar"}.png`;
}

function cropAvatarToPngFile(
  image: HTMLImageElement,
  originalName: string,
  dimensions: ImageDimensions,
  scale: number,
  offset: Offset,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;

    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Unable to prepare avatar canvas."));
      return;
    }

    const sourceSize = AVATAR_VIEWPORT_SIZE / scale;
    const rawSourceX = dimensions.width / 2 - sourceSize / 2 - offset.x / scale;
    const rawSourceY = dimensions.height / 2 - sourceSize / 2 - offset.y / scale;
    const sourceX = Math.max(0, Math.min(dimensions.width - sourceSize, rawSourceX));
    const sourceY = Math.max(0, Math.min(dimensions.height - sourceSize, rawSourceY));

    context.clearRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
    context.save();
    context.beginPath();
    context.arc(AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, 0, Math.PI * 2);
    context.closePath();
    context.clip();
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_OUTPUT_SIZE,
      AVATAR_OUTPUT_SIZE,
    );
    context.restore();

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to prepare avatar image."));
        return;
      }
      resolve(new File([blob], buildOutputFileName(originalName), { type: "image/png" }));
    }, "image/png");
  });
}

export function ProfileAvatarModal({
  isOpen,
  isSubmitting,
  currentAvatarUrl,
  avatarFallbackText,
  onClose,
  onUpload,
}: ProfileAvatarModalProps): JSX.Element | null {
  const closeDialogShortcut = useShortcutStore((state) => state.bindings.close_dialog);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const [zoom, setZoom] = useState(AVATAR_MIN_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseScale = useMemo(() => {
    if (!imageDimensions) return 1;
    return Math.max(AVATAR_VIEWPORT_SIZE / imageDimensions.width, AVATAR_VIEWPORT_SIZE / imageDimensions.height);
  }, [imageDimensions]);

  const actualScale = baseScale * zoom;
  const previewScale = actualScale * (AVATAR_PREVIEW_SIZE / AVATAR_VIEWPORT_SIZE);

  const cropImageStyle = useMemo(() => {
    if (!imageDimensions) return undefined;

    return {
      width: `${imageDimensions.width * actualScale}px`,
      height: `${imageDimensions.height * actualScale}px`,
      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
    };
  }, [imageDimensions, actualScale, offset]);

  const previewImageStyle = useMemo(() => {
    if (!imageDimensions) return undefined;

    return {
      width: `${imageDimensions.width * previewScale}px`,
      height: `${imageDimensions.height * previewScale}px`,
      transform: `translate(calc(-50% + ${offset.x * (AVATAR_PREVIEW_SIZE / AVATAR_VIEWPORT_SIZE)}px), calc(-50% + ${offset.y * (AVATAR_PREVIEW_SIZE / AVATAR_VIEWPORT_SIZE)}px))`,
    };
  }, [imageDimensions, previewScale, offset]);

  useEffect(() => {
    if (!selectedImageUrl) return undefined;
    return () => URL.revokeObjectURL(selectedImageUrl);
  }, [selectedImageUrl]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setSelectedImageUrl(null);
      setImageDimensions(null);
      setZoom(AVATAR_MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
      setIsDragActive(false);
      setError(null);
      dragStateRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcutEvent(event, closeDialogShortcut) && !isSubmitting) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDialogShortcut, isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  async function loadFile(file: File) {
    if (!isSupportedAvatarFile(file)) {
      setError("Unsupported format. Use PNG, JPG, JPEG, WEBP, GIF, BMP, or AVIF.");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      setSelectedFile(file);
      setSelectedImageUrl(nextUrl);
      setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setZoom(AVATAR_MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
      setError(null);
      setIsDragActive(false);
      dragStateRef.current = null;
    };

    image.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      setError("Unable to read this image.");
    };

    image.src = nextUrl;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void loadFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!isSubmitting) setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    if (isSubmitting) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void loadFile(file);
  }

  function handleZoomChange(event: ChangeEvent<HTMLInputElement>) {
    if (!imageDimensions) return;

    const nextZoom = Number(event.target.value);
    const nextScale = baseScale * nextZoom;
    const nextOffset = clampOffset(offset, imageDimensions, nextScale);

    setZoom(nextZoom);
    setOffset(nextOffset);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageDimensions || isSubmitting) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !imageDimensions) return;

    const nextOffset = clampOffset(
      {
        x: dragState.startOffsetX + event.clientX - dragState.startClientX,
        y: dragState.startOffsetY + event.clientY - dragState.startClientY,
      },
      imageDimensions,
      actualScale,
    );

    setOffset(nextOffset);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function handleUpload() {
    if (!selectedFile || !imageDimensions || !imageRef.current) {
      setError("Choose an image first.");
      return;
    }

    try {
      setError(null);
      const croppedFile = await cropAvatarToPngFile(imageRef.current, selectedFile.name, imageDimensions, actualScale, offset);
      await onUpload(croppedFile);
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload avatar.");
    }
  }

  return (
    <div
      className="profile-modal-overlay"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="profile-modal profile-avatar-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-avatar-modal-title"
      >
        <div className="profile-modal-head">
          <div>
            <h3 id="profile-avatar-modal-title" className="profile-modal-title">Update avatar</h3>
            <p className="profile-modal-subtitle">
              Upload an image, then position the circle the way you want it to appear in the profile.
            </p>
          </div>
          <button className="btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Close
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.jfif,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
          className="hidden"
          onChange={handleFileChange}
        />

        {!selectedImageUrl || !imageDimensions ? (
          <div className="profile-avatar-start">
            <div className="profile-avatar-current">
              <div className="profile-avatar-current-title">Current avatar</div>
              <div className="profile-avatar-current-preview">
                {currentAvatarUrl ? (
                  <img src={currentAvatarUrl} alt="Current avatar" className="h-full w-full rounded-full object-cover" />
                ) : (
                  avatarFallbackText || "U"
                )}
              </div>
            </div>

            <div
              className={`profile-avatar-dropzone ${isDragActive ? "is-active" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="profile-avatar-dropzone-title">Drag an image here</div>
              <div className="profile-avatar-dropzone-text">or use the button below to choose a file</div>
              <button className="btn-primary" type="button" onClick={() => fileInputRef.current?.click()}>
                Choose image
              </button>
              <div className="profile-avatar-dropzone-hint">
                Supported: PNG, JPG, JPEG, WEBP, GIF, BMP, AVIF
              </div>
            </div>

            {error ? <div className="profile-modal-error">{error}</div> : null}
          </div>
        ) : (
          <div className="profile-avatar-editor">
            <div className="profile-avatar-crop-panel">
              <div className="profile-avatar-editor-label">Drag image to position your avatar</div>
              <div
                className="profile-avatar-crop-frame"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <img
                  ref={imageRef}
                  src={selectedImageUrl}
                  alt="Avatar crop source"
                  className="profile-avatar-crop-image"
                  style={cropImageStyle}
                  draggable={false}
                />
                <div className="profile-avatar-crop-ring" />
              </div>
            </div>

            <div className="profile-avatar-sidebar">
              <div className="profile-avatar-preview-block">
                <div className="profile-avatar-editor-label">Preview</div>
                <div className="profile-avatar-preview-frame">
                  <img
                    src={selectedImageUrl}
                    alt="Avatar preview"
                    className="profile-avatar-preview-image"
                    style={previewImageStyle}
                    draggable={false}
                  />
                </div>
              </div>

              <label className="profile-avatar-zoom">
                <span className="profile-avatar-editor-label">Zoom</span>
                <input
                  type="range"
                  min={AVATAR_MIN_ZOOM}
                  max={AVATAR_MAX_ZOOM}
                  step="0.01"
                  value={zoom}
                  onChange={handleZoomChange}
                  disabled={isSubmitting}
                />
              </label>

              <div className="profile-avatar-sidebar-text">
                The uploaded avatar will be saved as a circular PNG, so the preview matches the profile image.
              </div>

              {error ? <div className="profile-modal-error">{error}</div> : null}

              <div className="profile-modal-actions">
                <button className="btn-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
                  Choose another
                </button>
                <button className="btn-primary" type="button" onClick={() => void handleUpload()} disabled={isSubmitting}>
                  {isSubmitting ? "Uploading..." : "Save avatar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

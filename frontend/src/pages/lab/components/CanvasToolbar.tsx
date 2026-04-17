import { LockToggleIcon } from "../LockToggleIcon";

type CanvasToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  canvasLocked: boolean;
  zoomPercent: number;
  onUndo: () => void;
  onRedo: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleCanvasLock: () => void;
  onExport: () => void;
  onOpenHelp: () => void;
};

function IconButton({
  label,
  title,
  onClick,
  disabled,
  className,
  tutorial,
  children,
  active,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  tutorial?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`lab-canvas-btn ${active ? "lab-canvas-btn-active" : ""} ${className ?? ""}`.trim()}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      data-tutorial={tutorial}
    >
      {children}
    </button>
  );
}

export function CanvasToolbar({
  canUndo,
  canRedo,
  canvasLocked,
  zoomPercent,
  onUndo,
  onRedo,
  onZoomReset,
  onZoomIn,
  onZoomOut,
  onToggleCanvasLock,
  onExport,
  onOpenHelp,
}: CanvasToolbarProps): JSX.Element {
  return (
    <div className="lab-canvas-toolbar" role="group" aria-label="Canvas controls" data-tutorial="toolbar">
      <IconButton label="Undo" title="Undo (Ctrl/Cmd+Z)" onClick={onUndo} disabled={!canUndo} tutorial="undo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
        </svg>
      </IconButton>
      <IconButton label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" onClick={onRedo} disabled={!canRedo} tutorial="redo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
        </svg>
      </IconButton>
      <div className="lab-canvas-sep" />
      <IconButton label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={onZoomReset} tutorial="zoom-reset">
        <span aria-hidden="true">&#x2922;</span>
      </IconButton>
      <div className="lab-canvas-sep" />
      <IconButton label="Zoom in" title="Zoom in" onClick={onZoomIn} tutorial="zoom-in">
        <span aria-hidden="true">&#x2295;</span>
      </IconButton>
      <div className="lab-canvas-zoom">{Math.max(1, zoomPercent)}%</div>
      <IconButton label="Zoom out" title="Zoom out" onClick={onZoomOut} tutorial="zoom-out">
        <span aria-hidden="true">&#x2296;</span>
      </IconButton>
      <div className="lab-canvas-sep" />
      <IconButton
        label={canvasLocked ? "Unlock workspace" : "Lock workspace"}
        title={canvasLocked ? "Unlock workspace" : "Lock workspace"}
        onClick={onToggleCanvasLock}
        active={canvasLocked}
        tutorial="lock-canvas"
      >
        <span className="lab-canvas-lock-icon" aria-hidden="true"><LockToggleIcon locked={canvasLocked} /></span>
      </IconButton>
      <div className="lab-canvas-sep" />
      <button className="lab-canvas-btn lab-canvas-export" type="button" onClick={onExport} data-tutorial="export">
        <span>Export</span>
        <span aria-hidden="true">&#x21E9;</span>
      </button>
      <div className="lab-canvas-sep" />
      <button
        className="lab-canvas-btn lab-canvas-help"
        type="button"
        onClick={onOpenHelp}
        aria-label="Open systems-thinking help"
        title="Help — key systems-thinking concepts"
        data-tutorial="help"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 4.9 0.7c0 1.6-2.4 2-2.4 3.3" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
        </svg>
        <span className="lab-canvas-help-label">Help</span>
      </button>
    </div>
  );
}

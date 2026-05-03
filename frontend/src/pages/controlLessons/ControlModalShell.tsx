import type { ReactNode } from "react";

import { DEFAULT_SECTION_COLORS } from "./types";

export function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {DEFAULT_SECTION_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`h-7 w-7 rounded-full border border-slate-200 ${value === color ? "ring-2 ring-slate-400" : ""}`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <input
        className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-transparent p-1"
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        title="Pick color"
      />
    </div>
  );
}

export function ControlModal({
  title,
  subtitle,
  onClose,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6" onClick={onClose}>
      <div
        className="panel control-panel control-modal-panel max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {onBack ? (
                <button className="btn-secondary" type="button" onClick={onBack}>
                  Back
                </button>
              ) : null}
              <h3 className="control-section-heading text-xl font-semibold">{title}</h3>
            </div>
            {subtitle ? <p className="control-copy text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

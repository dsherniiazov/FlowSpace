import { useEffect, useMemo, useState } from "react";
import {
  captureShortcutFromEvent,
  findShortcutConflict,
  formatShortcutBindings,
  getShortcutDefinition,
  SHORTCUT_DEFINITIONS,
  ShortcutActionId,
  useShortcutStore,
} from "../store/shortcutStore";
import { ColorblindMode, getLabColorTokens, UiScale, useUiPreferencesStore } from "../store/uiPreferencesStore";

const UI_SCALE_OPTIONS: Array<{ value: UiScale; label: string; description: string; previewClassName: string }> = [
  {
    value: "small",
    label: "Small",
    description: "Compact spacing and tighter controls.",
    previewClassName: "is-small",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced default density.",
    previewClassName: "is-medium",
  },
  {
    value: "large",
    label: "Large",
    description: "Larger text and roomier controls.",
    previewClassName: "is-large",
  },
];

const COLORBLIND_MODE_OPTIONS: Array<{ value: ColorblindMode; label: string; description: string }> = [
  {
    value: "off",
    label: "Off",
    description: "Default app palette.",
  },
  {
    value: "deuteranopia",
    label: "Deuteranopia",
    description: "Red-green safe preset with blue/orange focus.",
  },
  {
    value: "protanopia",
    label: "Protanopia",
    description: "Alternative red-green preset with stronger amber/cyan separation.",
  },
  {
    value: "tritanopia",
    label: "Tritanopia",
    description: "Blue-yellow safe preset with magenta/teal emphasis.",
  },
];

export function SettingsPage(): JSX.Element {
  const uiScale = useUiPreferencesStore((state) => state.uiScale);
  const colorblindMode = useUiPreferencesStore((state) => state.colorblindMode);
  const highContrastMode = useUiPreferencesStore((state) => state.highContrastMode);
  const setUiScale = useUiPreferencesStore((state) => state.setUiScale);
  const setColorblindMode = useUiPreferencesStore((state) => state.setColorblindMode);
  const setHighContrastMode = useUiPreferencesStore((state) => state.setHighContrastMode);
  const shortcutBindings = useShortcutStore((state) => state.bindings);
  const setShortcutBinding = useShortcutStore((state) => state.setShortcutBinding);
  const resetShortcutBinding = useShortcutStore((state) => state.resetShortcutBinding);
  const resetAllShortcuts = useShortcutStore((state) => state.resetAllShortcuts);

  const [recordingActionId, setRecordingActionId] = useState<ShortcutActionId | null>(null);
  const [shortcutNotice, setShortcutNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const palette = getLabColorTokens(colorblindMode, highContrastMode);
  const recordingAction = useMemo(
    () => (recordingActionId ? getShortcutDefinition(recordingActionId) : null),
    [recordingActionId],
  );
  const palettePreview = [
    { label: "Inflow / positive", color: palette.inflow },
    { label: "Outflow / negative", color: palette.outflow },
    { label: "Multiply", color: palette.control.mul },
    { label: "Modulo", color: palette.control.mod },
  ];

  useEffect(() => {
    if (!recordingActionId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextBinding = captureShortcutFromEvent(event);
      if (!nextBinding) return;

      const conflictId = findShortcutConflict(shortcutBindings, recordingActionId, nextBinding);
      if (conflictId) {
        const conflictDefinition = getShortcutDefinition(conflictId);
        setShortcutNotice({
          tone: "error",
          text: `${formatShortcutBindings([nextBinding])} is already used for ${conflictDefinition.label}.`,
        });
        return;
      }

      setShortcutBinding(recordingActionId, nextBinding);
      setShortcutNotice({
        tone: "success",
        text: `${getShortcutDefinition(recordingActionId).label} set to ${formatShortcutBindings([nextBinding])}.`,
      });
      setRecordingActionId(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingActionId, setShortcutBinding, shortcutBindings]);

  function handleResetShortcut(actionId: ShortcutActionId): void {
    resetShortcutBinding(actionId);
    setRecordingActionId(null);
    setShortcutNotice({
      tone: "success",
      text: `${getShortcutDefinition(actionId).label} reset to default.`,
    });
  }

  function handleResetAllShortcuts(): void {
    resetAllShortcuts();
    setRecordingActionId(null);
    setShortcutNotice({
      tone: "success",
      text: "All shortcuts reset to default.",
    });
  }

  return (
    <section className="settings-shell mx-auto max-w-5xl space-y-6">
      <div className="panel settings-main-panel p-8">
        <h2 className="settings-page-heading text-3xl font-medium">Settings</h2>
        <p className="settings-page-intro mt-2 text-sm">
          Personalize interface size, accessibility and keyboard controls for the workspace.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="settings-block p-5">
            <div className="settings-panel-head">
              <div>
                <h3 className="settings-panel-title">Interface size</h3>
                <p className="settings-panel-copy">Choose how dense the workspace should feel across pages, forms and controls.</p>
              </div>
            </div>

            <div className="settings-size-grid">
              {UI_SCALE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`settings-size-option ${uiScale === option.value ? "is-active" : ""}`}
                  onClick={() => setUiScale(option.value)}
                  aria-pressed={uiScale === option.value}
                >
                  <span className={`settings-size-preview ${option.previewClassName}`}>Aa</span>
                  <span className="settings-size-label">{option.label}</span>
                  <span className="settings-size-note">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-block p-5">
            <div className="settings-panel-head">
              <div>
                <h3 className="settings-panel-title">Accessibility</h3>
                <p className="settings-panel-copy">Choose a color-vision preset and optionally boost contrast on top of it.</p>
              </div>
            </div>

            <div className="settings-mode-grid">
              {COLORBLIND_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`settings-mode-option ${colorblindMode === option.value ? "is-active" : ""}`}
                  onClick={() => setColorblindMode(option.value)}
                  aria-pressed={colorblindMode === option.value}
                >
                  <span className="settings-mode-title">{option.label}</span>
                  <span className="settings-mode-note">{option.description}</span>
                </button>
              ))}
            </div>

            <div className="settings-palette">
              {palettePreview.map((item) => (
                <div key={item.label} className="settings-palette-card">
                  <div className="settings-palette-sample">
                    <span className="settings-palette-dot" style={{ backgroundColor: item.color }} aria-hidden="true" />
                    <span className="settings-palette-name">{item.label}</span>
                  </div>
                  <div className="settings-palette-value">{item.color.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <div className="settings-switch settings-switch-spaced">
              <div className="settings-switch-copy">
                <strong>{highContrastMode ? "High contrast is on" : "High contrast is off"}</strong>
                <span>Sharpens borders, text and active states separately from the selected colorblind preset.</span>
              </div>
              <button
                type="button"
                className={`settings-switch-button ${highContrastMode ? "is-active" : ""}`}
                onClick={() => setHighContrastMode(!highContrastMode)}
                aria-pressed={highContrastMode}
                aria-label={highContrastMode ? "Disable high contrast mode" : "Enable high contrast mode"}
              />
            </div>

            <div className="settings-note">
              The selected color mode affects Lab edges, stock presets and charts. High contrast stays separate and can be enabled on top of any preset.
            </div>
          </div>
        </div>
      </div>

      <div className="panel settings-main-panel p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="settings-page-heading text-2xl font-medium">Shortcuts</h3>
            <p className="settings-page-intro mt-1 text-sm">All keyboard shortcuts currently used in the app. Click any binding to record a new combination.</p>
          </div>
          <button className="btn-secondary" type="button" onClick={handleResetAllShortcuts}>
            Reset all to default
          </button>
        </div>

        {shortcutNotice ? (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${shortcutNotice.tone === "success" ? "border-emerald-700/60 bg-emerald-950/50 text-emerald-100" : "border-red-700/60 bg-red-950/50 text-red-100"}`}>
            {shortcutNotice.text}
          </div>
        ) : null}

        {recordingAction ? (
          <div className="settings-shortcut-hint">
            Recording for <strong>{recordingAction.label}</strong>. Press the new combination now.
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {SHORTCUT_DEFINITIONS.map((shortcut) => {
            const isRecording = recordingActionId === shortcut.id;
            return (
              <div key={shortcut.id} className="settings-shortcut-row">
                <div className="settings-shortcut-meta">
                  <div className="settings-shortcut-topline">
                    <span className="settings-shortcut-title">{shortcut.label}</span>
                    <span className="settings-shortcut-scope">{shortcut.scope}</span>
                  </div>
                  <div className="settings-shortcut-copy">{shortcut.description}</div>
                </div>

                <div className="settings-shortcut-actions">
                  <button
                    className={`settings-shortcut-binding ${isRecording ? "is-recording" : ""}`}
                    type="button"
                    onClick={() => {
                      setShortcutNotice(null);
                      setRecordingActionId((current) => (current === shortcut.id ? null : shortcut.id));
                    }}
                  >
                    {isRecording ? "Press keys..." : formatShortcutBindings(shortcutBindings[shortcut.id])}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => handleResetShortcut(shortcut.id)}
                  >
                    Reset
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

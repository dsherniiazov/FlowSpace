import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UiScale = "small" | "medium" | "large";
export type ColorblindMode = "off" | "deuteranopia" | "protanopia" | "tritanopia";
type ControlOp = "add" | "sub" | "mul" | "div" | "pow" | "mod";

type UiPreferencesSnapshot = {
  uiScale: UiScale;
  colorblindMode: ColorblindMode;
  highContrastMode: boolean;
};

type UiPreferencesState = UiPreferencesSnapshot & {
  setUiScale: (value: UiScale) => void;
  setColorblindMode: (value: ColorblindMode) => void;
  setHighContrastMode: (value: boolean) => void;
};

export type LabColorTokens = {
  flowAccent: string;
  inflow: string;
  outflow: string;
  neutral: string;
  neutralLabel: string;
  labelBgDark: string;
  labelBgLight: string;
  discrepancy: {
    positive: string;
    negative: string;
    neutral: string;
  };
  reinforcing: {
    positive: string;
    negative: string;
  };
  control: Record<ControlOp, string>;
  stockPresets: string[];
};

export const UI_PREFERENCES_STORAGE_KEY = "flowspace-ui-preferences";

const DEFAULT_UI_PREFERENCES: UiPreferencesSnapshot = {
  uiScale: "medium",
  colorblindMode: "off",
  highContrastMode: false,
};

const LAB_COLOR_TOKENS_BY_MODE: Record<ColorblindMode, LabColorTokens> = {
  off: {
    flowAccent: "#3b82f6",
    inflow: "#22c55e",
    outflow: "#ef4444",
    neutral: "#6b7280",
    neutralLabel: "#a3a3a3",
    labelBgDark: "#050505",
    labelBgLight: "#ffffff",
    discrepancy: {
      positive: "#22c55e",
      negative: "#ef4444",
      neutral: "#a3a3a3",
    },
    reinforcing: {
      positive: "#22c55e",
      negative: "#ef4444",
    },
    control: {
      add: "#22c55e",
      sub: "#ef4444",
      mul: "#a855f7",
      div: "#eab308",
      pow: "#06b6d4",
      mod: "#f97316",
    },
    stockPresets: ["#ef4444", "#f97316", "#22c55e", "#0ea5e9", "#3b82f6", "#a855f7"],
  },
  deuteranopia: {
    flowAccent: "#0072b2",
    inflow: "#0072b2",
    outflow: "#d55e00",
    neutral: "#5b6472",
    neutralLabel: "#7c8799",
    labelBgDark: "#050505",
    labelBgLight: "#ffffff",
    discrepancy: {
      positive: "#0072b2",
      negative: "#d55e00",
      neutral: "#7c8799",
    },
    reinforcing: {
      positive: "#0072b2",
      negative: "#d55e00",
    },
    control: {
      add: "#0072b2",
      sub: "#d55e00",
      mul: "#cc79a7",
      div: "#e69f00",
      pow: "#56b4e9",
      mod: "#009e73",
    },
    stockPresets: ["#0072b2", "#d55e00", "#009e73", "#56b4e9", "#e69f00", "#cc79a7"],
  },
  protanopia: {
    flowAccent: "#3366cc",
    inflow: "#3366cc",
    outflow: "#cc6600",
    neutral: "#667085",
    neutralLabel: "#8a94a6",
    labelBgDark: "#050505",
    labelBgLight: "#ffffff",
    discrepancy: {
      positive: "#3366cc",
      negative: "#cc6600",
      neutral: "#8a94a6",
    },
    reinforcing: {
      positive: "#3366cc",
      negative: "#cc6600",
    },
    control: {
      add: "#3366cc",
      sub: "#cc6600",
      mul: "#aa4499",
      div: "#ddcc77",
      pow: "#88ccee",
      mod: "#44aa99",
    },
    stockPresets: ["#3366cc", "#cc6600", "#44aa99", "#88ccee", "#ddcc77", "#aa4499"],
  },
  tritanopia: {
    flowAccent: "#c03a8c",
    inflow: "#c03a8c",
    outflow: "#00897b",
    neutral: "#636a75",
    neutralLabel: "#8b94a2",
    labelBgDark: "#050505",
    labelBgLight: "#ffffff",
    discrepancy: {
      positive: "#c03a8c",
      negative: "#00897b",
      neutral: "#8b94a2",
    },
    reinforcing: {
      positive: "#c03a8c",
      negative: "#00897b",
    },
    control: {
      add: "#c03a8c",
      sub: "#00897b",
      mul: "#6a4c93",
      div: "#e67e22",
      pow: "#8c564b",
      mod: "#7a9e47",
    },
    stockPresets: ["#c03a8c", "#00897b", "#6a4c93", "#e67e22", "#7a9e47", "#8c564b"],
  },
};

const CHART_PALETTES_BY_MODE: Record<ColorblindMode, string[]> = {
  off: ["#18e0c2", "#f97316", "#8b5cf6", "#22c55e", "#38bdf8", "#ef4444"],
  deuteranopia: ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#e69f00", "#56b4e9"],
  protanopia: ["#3366cc", "#cc6600", "#44aa99", "#aa4499", "#ddcc77", "#88ccee"],
  tritanopia: ["#c03a8c", "#00897b", "#6a4c93", "#e67e22", "#7a9e47", "#8c564b"],
};

const HIGH_CONTRAST_CHART_PALETTES_BY_MODE: Record<ColorblindMode, string[]> = {
  off: ["#00e5ff", "#ff6a00", "#c026d3", "#16a34a", "#2563eb", "#dc2626"],
  deuteranopia: ["#0072b2", "#b44600", "#007f66", "#b65e92", "#c18a00", "#3da5d9"],
  protanopia: ["#234db8", "#a64f00", "#238b85", "#8a2f7f", "#b8a95a", "#5eaad6"],
  tritanopia: ["#a12f73", "#00695c", "#52307c", "#b85c00", "#5b7a31", "#6e4d45"],
};

function sanitizeUiScale(value: unknown): UiScale {
  return value === "small" || value === "medium" || value === "large" ? value : DEFAULT_UI_PREFERENCES.uiScale;
}

function sanitizeColorblindMode(value: unknown): ColorblindMode {
  if (value === true) return "deuteranopia";
  if (value === false) return "off";
  return value === "off" || value === "deuteranopia" || value === "protanopia" || value === "tritanopia"
    ? value
    : DEFAULT_UI_PREFERENCES.colorblindMode;
}

function sanitizeUiPreferencesSnapshot(value: unknown): UiPreferencesSnapshot {
  if (!value || typeof value !== "object") return DEFAULT_UI_PREFERENCES;
  const source = value as Partial<Record<keyof UiPreferencesSnapshot, unknown> & { colorblindMode?: unknown }>;
  return {
    uiScale: sanitizeUiScale(source.uiScale),
    colorblindMode: sanitizeColorblindMode(source.colorblindMode),
    highContrastMode: source.highContrastMode === true,
  };
}

function applyHighContrastToLabTokens(tokens: LabColorTokens): LabColorTokens {
  return {
    ...tokens,
    neutral: "#94a3b8",
    neutralLabel: "#e2e8f0",
    discrepancy: {
      ...tokens.discrepancy,
      neutral: "#e2e8f0",
    },
  };
}

export function getStoredUiPreferences(): UiPreferencesSnapshot {
  if (typeof window === "undefined") return DEFAULT_UI_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFERENCES;
    const parsed = JSON.parse(raw) as { state?: unknown } | unknown;
    return sanitizeUiPreferencesSnapshot(
      typeof parsed === "object" && parsed !== null && "state" in parsed ? parsed.state : parsed,
    );
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function applyUiPreferencesToDocument(preferences: UiPreferencesSnapshot): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-ui-scale", preferences.uiScale);
  document.documentElement.setAttribute("data-colorblind", preferences.colorblindMode);
  document.documentElement.setAttribute("data-contrast", preferences.highContrastMode ? "high" : "normal");
}

export function getLabColorTokens(colorblindMode: ColorblindMode, highContrastMode = false): LabColorTokens {
  const baseTokens = LAB_COLOR_TOKENS_BY_MODE[sanitizeColorblindMode(colorblindMode)];
  return highContrastMode ? applyHighContrastToLabTokens(baseTokens) : baseTokens;
}

export function getChartColorPalette(colorblindMode: ColorblindMode, highContrastMode = false): string[] {
  const safeMode = sanitizeColorblindMode(colorblindMode);
  return highContrastMode ? HIGH_CONTRAST_CHART_PALETTES_BY_MODE[safeMode] : CHART_PALETTES_BY_MODE[safeMode];
}

export function getCurrentLabColorTokens(): LabColorTokens {
  const { colorblindMode, highContrastMode } = useUiPreferencesStore.getState();
  return getLabColorTokens(colorblindMode, highContrastMode);
}

export function getStockColorPresets(colorblindMode = useUiPreferencesStore.getState().colorblindMode): string[] {
  return LAB_COLOR_TOKENS_BY_MODE[sanitizeColorblindMode(colorblindMode)].stockPresets;
}

export function resolveStockColor(color: string, colorblindMode: ColorblindMode): string {
  const normalized = color.trim().toLowerCase();
  const paletteIndex = (Object.values(LAB_COLOR_TOKENS_BY_MODE) as LabColorTokens[])
    .map((tokens) => tokens.stockPresets.findIndex((item) => item.toLowerCase() === normalized))
    .find((index) => index >= 0) ?? -1;
  if (paletteIndex < 0) return color;
  return LAB_COLOR_TOKENS_BY_MODE[sanitizeColorblindMode(colorblindMode)].stockPresets[paletteIndex] ?? color;
}

const initialUiPreferences = getStoredUiPreferences();

export const useUiPreferencesStore = create<UiPreferencesState>()(
  persist(
    (set) => ({
      ...initialUiPreferences,
      setUiScale: (value) =>
        set((state) => {
          const next = {
            uiScale: sanitizeUiScale(value),
            colorblindMode: state.colorblindMode,
            highContrastMode: state.highContrastMode,
          };
          applyUiPreferencesToDocument(next);
          return { uiScale: next.uiScale };
        }),
      setColorblindMode: (value) =>
        set((state) => {
          const next = {
            uiScale: state.uiScale,
            colorblindMode: sanitizeColorblindMode(value),
            highContrastMode: state.highContrastMode,
          };
          applyUiPreferencesToDocument(next);
          return { colorblindMode: next.colorblindMode };
        }),
      setHighContrastMode: (value) =>
        set((state) => {
          const next = {
            uiScale: state.uiScale,
            colorblindMode: state.colorblindMode,
            highContrastMode: value === true,
          };
          applyUiPreferencesToDocument(next);
          return { highContrastMode: next.highContrastMode };
        }),
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      partialize: (state) => ({
        uiScale: state.uiScale,
        colorblindMode: state.colorblindMode,
        highContrastMode: state.highContrastMode,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted && typeof persisted === "object"
          ? (persisted as Partial<Record<keyof UiPreferencesSnapshot, unknown>>)
          : {};
        return {
          ...current,
          uiScale: sanitizeUiScale(persistedState.uiScale),
          colorblindMode: sanitizeColorblindMode(persistedState.colorblindMode),
          highContrastMode: persistedState.highContrastMode === true,
        };
      },
      onRehydrateStorage: () => (state) => {
        applyUiPreferencesToDocument({
          uiScale: sanitizeUiScale(state?.uiScale),
          colorblindMode: sanitizeColorblindMode(state?.colorblindMode),
          highContrastMode: state?.highContrastMode === true,
        });
      },
    },
  ),
);

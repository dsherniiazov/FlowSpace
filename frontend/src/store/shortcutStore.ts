import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ShortcutActionId =
  | "save_system"
  | "undo_graph"
  | "copy_selection"
  | "cut_selection"
  | "paste_selection"
  | "delete_selection"
  | "close_dialog";

export type ShortcutBindings = Record<ShortcutActionId, string[]>;

type ShortcutDefinition = {
  id: ShortcutActionId;
  label: string;
  description: string;
  scope: "Lab" | "Dialogs";
};

type ShortcutState = {
  bindings: ShortcutBindings;
  setShortcutBinding: (actionId: ShortcutActionId, binding: string) => void;
  resetShortcutBinding: (actionId: ShortcutActionId) => void;
  resetAllShortcuts: () => void;
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: "save_system",
    label: "Save system",
    description: "Saves the current system in Lab.",
    scope: "Lab",
  },
  {
    id: "undo_graph",
    label: "Undo",
    description: "Reverts the last graph change in Lab.",
    scope: "Lab",
  },
  {
    id: "copy_selection",
    label: "Copy selection",
    description: "Copies selected nodes and edges.",
    scope: "Lab",
  },
  {
    id: "cut_selection",
    label: "Cut selection",
    description: "Cuts selected nodes and edges.",
    scope: "Lab",
  },
  {
    id: "paste_selection",
    label: "Paste selection",
    description: "Pastes the current clipboard into Lab.",
    scope: "Lab",
  },
  {
    id: "delete_selection",
    label: "Delete selection",
    description: "Deletes selected nodes and edges.",
    scope: "Lab",
  },
  {
    id: "close_dialog",
    label: "Close dialog",
    description: "Closes open dialogs and popups.",
    scope: "Dialogs",
  },
];

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
  save_system: ["Primary+S"],
  undo_graph: ["Primary+Z"],
  copy_selection: ["Primary+C"],
  cut_selection: ["Primary+X"],
  paste_selection: ["Primary+V"],
  delete_selection: ["Delete", "Backspace"],
  close_dialog: ["Escape"],
};

const SHORTCUT_STORAGE_KEY = "flowspace-shortcuts";

const DISPLAY_TOKEN_MAP: Record<string, string> = {
  Primary: "Ctrl/Cmd",
  Alt: "Alt",
  Shift: "Shift",
  Escape: "Esc",
  Delete: "Del",
  Backspace: "Backspace",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Plus: "+",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
};

const SPECIAL_KEY_MAP: Record<string, string> = {
  " ": "Space",
  Escape: "Escape",
  Esc: "Escape",
  Delete: "Delete",
  Del: "Delete",
  Backspace: "Backspace",
  Enter: "Enter",
  Tab: "Tab",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  "`": "Backquote",
  "-": "Minus",
  "=": "Equal",
  "+": "Plus",
};

function uniqueBindings(bindings: string[]): string[] {
  return Array.from(new Set(bindings));
}

export function normalizeShortcutKey(key: string): string | null {
  if (!key) return null;
  if (SPECIAL_KEY_MAP[key]) return SPECIAL_KEY_MAP[key];
  if (/^F\d{1,2}$/i.test(key)) return key.toUpperCase();
  if (key.length === 1 && /[a-z0-9]/i.test(key)) return key.toUpperCase();
  return null;
}

function isModifierOnlyKey(key: string | null): boolean {
  return key === "Shift" || key === "Control" || key === "Meta" || key === "Alt";
}

function normalizeShortcutBindingValue(binding: string): string | null {
  const tokens = binding
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const rawKey = tokens[tokens.length - 1];
  if (isModifierOnlyKey(rawKey)) return null;
  const normalizedKey = normalizeShortcutKey(rawKey);
  if (!normalizedKey) return null;

  const modifiers = new Set(tokens.slice(0, -1).map((token) => token.toLowerCase()));
  const parts: string[] = [];
  if (modifiers.has("primary") || modifiers.has("ctrl") || modifiers.has("control") || modifiers.has("cmd") || modifiers.has("meta")) {
    parts.push("Primary");
  }
  if (modifiers.has("alt") || modifiers.has("option")) parts.push("Alt");
  if (modifiers.has("shift")) parts.push("Shift");
  parts.push(normalizedKey);
  return parts.join("+");
}

function sanitizeShortcutBindingList(value: unknown, fallback: string[]): string[] {
  const rawList =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
  const sanitized = uniqueBindings(rawList.map((item) => normalizeShortcutBindingValue(item)).filter((item): item is string => Boolean(item)));
  return sanitized.length > 0 ? sanitized : fallback;
}

function sanitizeShortcutBindings(value: unknown): ShortcutBindings {
  const source = value && typeof value === "object" ? (value as Partial<Record<ShortcutActionId, unknown>>) : {};
  return {
    save_system: sanitizeShortcutBindingList(source.save_system, DEFAULT_SHORTCUT_BINDINGS.save_system),
    undo_graph: sanitizeShortcutBindingList(source.undo_graph, DEFAULT_SHORTCUT_BINDINGS.undo_graph),
    copy_selection: sanitizeShortcutBindingList(source.copy_selection, DEFAULT_SHORTCUT_BINDINGS.copy_selection),
    cut_selection: sanitizeShortcutBindingList(source.cut_selection, DEFAULT_SHORTCUT_BINDINGS.cut_selection),
    paste_selection: sanitizeShortcutBindingList(source.paste_selection, DEFAULT_SHORTCUT_BINDINGS.paste_selection),
    delete_selection: sanitizeShortcutBindingList(source.delete_selection, DEFAULT_SHORTCUT_BINDINGS.delete_selection),
    close_dialog: sanitizeShortcutBindingList(source.close_dialog, DEFAULT_SHORTCUT_BINDINGS.close_dialog),
  };
}

function matchesSingleShortcut(event: KeyboardEvent, binding: string): boolean {
  const normalizedBinding = normalizeShortcutBindingValue(binding);
  const normalizedKey = normalizeShortcutKey(event.key);
  if (!normalizedBinding || !normalizedKey) return false;

  const tokens = normalizedBinding.split("+");
  const expectedKey = tokens[tokens.length - 1];
  const requiresPrimary = tokens.includes("Primary");
  const requiresAlt = tokens.includes("Alt");
  const requiresShift = tokens.includes("Shift");

  return (
    expectedKey === normalizedKey &&
    requiresPrimary === (event.ctrlKey || event.metaKey) &&
    requiresAlt === event.altKey &&
    requiresShift === event.shiftKey
  );
}

export function matchesShortcutEvent(event: KeyboardEvent, bindings: string | string[]): boolean {
  const bindingList = Array.isArray(bindings) ? bindings : [bindings];
  return bindingList.some((binding) => matchesSingleShortcut(event, binding));
}

export function captureShortcutFromEvent(event: KeyboardEvent): string | null {
  if (isModifierOnlyKey(event.key)) return null;
  const normalizedKey = normalizeShortcutKey(event.key);
  if (!normalizedKey) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Primary");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(normalizedKey);
  return parts.join("+");
}

export function formatShortcutBinding(binding: string): string {
  const normalizedBinding = normalizeShortcutBindingValue(binding);
  if (!normalizedBinding) return "Not assigned";
  return normalizedBinding
    .split("+")
    .map((token) => DISPLAY_TOKEN_MAP[token] ?? token)
    .join(" + ");
}

export function formatShortcutBindings(bindings: string[]): string {
  return bindings.map((binding) => formatShortcutBinding(binding)).join(" / ");
}

export function findShortcutConflict(
  bindings: ShortcutBindings,
  actionId: ShortcutActionId,
  binding: string,
): ShortcutActionId | null {
  const normalizedBinding = normalizeShortcutBindingValue(binding);
  if (!normalizedBinding) return null;

  for (const definition of SHORTCUT_DEFINITIONS) {
    if (definition.id === actionId) continue;
    const list = bindings[definition.id] ?? [];
    if (list.some((item) => normalizeShortcutBindingValue(item) === normalizedBinding)) {
      return definition.id;
    }
  }
  return null;
}

export function getShortcutDefinition(actionId: ShortcutActionId): ShortcutDefinition {
  return SHORTCUT_DEFINITIONS.find((item) => item.id === actionId) ?? SHORTCUT_DEFINITIONS[0];
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      bindings: DEFAULT_SHORTCUT_BINDINGS,
      setShortcutBinding: (actionId, binding) =>
        set((state) => ({
          bindings: {
            ...state.bindings,
            [actionId]: [normalizeShortcutBindingValue(binding) ?? binding],
          },
        })),
      resetShortcutBinding: (actionId) =>
        set((state) => ({
          bindings: {
            ...state.bindings,
            [actionId]: [...DEFAULT_SHORTCUT_BINDINGS[actionId]],
          },
        })),
      resetAllShortcuts: () =>
        set({
          bindings: {
            save_system: [...DEFAULT_SHORTCUT_BINDINGS.save_system],
            undo_graph: [...DEFAULT_SHORTCUT_BINDINGS.undo_graph],
            copy_selection: [...DEFAULT_SHORTCUT_BINDINGS.copy_selection],
            cut_selection: [...DEFAULT_SHORTCUT_BINDINGS.cut_selection],
            paste_selection: [...DEFAULT_SHORTCUT_BINDINGS.paste_selection],
            delete_selection: [...DEFAULT_SHORTCUT_BINDINGS.delete_selection],
            close_dialog: [...DEFAULT_SHORTCUT_BINDINGS.close_dialog],
          },
        }),
    }),
    {
      name: SHORTCUT_STORAGE_KEY,
      partialize: (state) => ({ bindings: state.bindings }),
      merge: (persisted, current) => {
        const persistedState =
          persisted && typeof persisted === "object" && "bindings" in persisted
            ? (persisted as { bindings?: unknown }).bindings
            : undefined;
        return {
          ...current,
          bindings: sanitizeShortcutBindings(persistedState),
        };
      },
    },
  ),
);

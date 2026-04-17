type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: BlobPart) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

function safeFileName(title: string): string {
  const safe = title.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return (safe || "system") + ".json";
}

async function trySaveFilePicker(json: string, suggestedName: string): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== "function") return false;
  try {
    const handle = await picker({
      suggestedName,
      types: [{ description: "JSON system export", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    return false;
  }
}

function downloadFallback(json: string, suggestedName: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportGraphAsJson(
  graph: Record<string, unknown>,
  title: string,
): Promise<void> {
  const json = JSON.stringify(graph, null, 2);
  const suggestedName = safeFileName(title.trim());
  const handled = await trySaveFilePicker(json, suggestedName);
  if (handled) return;
  downloadFallback(json, suggestedName);
}

import type { RefObject } from "react";

import type { SystemModel } from "../../types/api";

type MySystemsPanelProps = {
  systems: SystemModel[];
  isLoading: boolean;
  isError: boolean;
  isImporting: boolean;
  isDeleting: boolean;
  lastImportedSystemId: number | null;
  importFileRef: RefObject<HTMLInputElement>;
  onImportFile: (file: File) => void;
  onOpenSystem: (system: SystemModel) => void;
  onDeleteSystem: (system: SystemModel) => void;
};

export function MySystemsPanel({
  systems,
  isLoading,
  isError,
  isImporting,
  isDeleting,
  lastImportedSystemId,
  importFileRef,
  onImportFile,
  onOpenSystem,
  onDeleteSystem,
}: MySystemsPanelProps): JSX.Element {
  return (
    <div className="panel profile-main-panel p-6">
      <div className="flex items-center justify-between">
        <h3 className="profile-page-heading text-2xl font-medium text-white">My Systems</h3>
        <div>
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFile(file);
              event.target.value = "";
            }}
          />
          <button
            className="btn-secondary"
            type="button"
            onClick={() => importFileRef.current?.click()}
            disabled={isImporting}
            data-tutorial="import-system"
          >
            {isImporting ? "Importing..." : "Import system"}
          </button>
        </div>
      </div>
      {isLoading ? <div className="mt-3 text-zinc-500">Loading systems...</div> : null}
      {isError ? <div className="mt-3 text-zinc-400">Unable to fetch systems.</div> : null}
      {systems.length === 0 && !isLoading ? <div className="mt-3 text-zinc-500">No systems saved yet.</div> : null}
      <div className="mt-4 grid gap-3">
        {systems.map((system) => (
          <SystemCard
            key={system.id}
            system={system}
            isImported={system.id === lastImportedSystemId}
            isDeleting={isDeleting}
            onOpen={onOpenSystem}
            onDelete={onDeleteSystem}
          />
        ))}
      </div>
    </div>
  );
}

function SystemCard({
  system,
  isImported,
  isDeleting,
  onOpen,
  onDelete,
}: {
  system: SystemModel;
  isImported: boolean;
  isDeleting: boolean;
  onOpen: (system: SystemModel) => void;
  onDelete: (system: SystemModel) => void;
}): JSX.Element {
  return (
    <div
      className="profile-system-card p-4"
      style={{ position: "relative" }}
      data-tutorial={isImported ? "imported-system-card" : undefined}
    >
      {system.has_unseen_changes ? <div className="profile-system-new-badge">new changes!</div> : null}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="profile-system-title font-semibold text-zinc-100">{system.title}</div>
          <div className="profile-label text-xs text-zinc-500">ID {system.id}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-secondary"
            data-tutorial={isImported ? "open-imported-system" : undefined}
            onClick={() => onOpen(system)}
          >
            Open in Lab
          </button>
          <button className="btn-secondary" onClick={() => onDelete(system)} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

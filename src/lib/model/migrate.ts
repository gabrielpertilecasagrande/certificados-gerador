import { DEFAULT_EXPORT } from "./defaults";
import type { Project } from "./types";

/** Normaliza projetos salvos por versões anteriores (campos novos recebem padrões). */
export function migrateProject(raw: Project): Project {
  return {
    ...raw,
    schemaVersion: 1,
    globals: raw.globals ?? [],
    columns: raw.columns ?? [],
    participants: (raw.participants ?? []).map((p) => ({ ...p, overrides: p.overrides ?? {} })),
    exportSettings: { ...DEFAULT_EXPORT, ...raw.exportSettings },
    lastExportAt: raw.lastExportAt ?? null,
    thumbnailAssetId: raw.thumbnailAssetId ?? null,
  };
}

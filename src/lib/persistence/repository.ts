import type { AssetRecord, ID, Project, ProjectSummary } from "@/lib/model/types";

/**
 * Contrato de persistência. A implementação atual usa IndexedDB (navegador);
 * uma implementação Supabase pode substituí-la sem mudar a interface.
 */
export interface ProjectRepository {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: ID): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: ID): Promise<void>;

  putAsset(asset: AssetRecord): Promise<void>;
  getAsset(id: ID): Promise<AssetRecord | undefined>;
  listAssets(projectId: ID): Promise<AssetRecord[]>;
  deleteAsset(id: ID): Promise<void>;
}

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    status: deriveStatus(p),
    participantCount: p.participants.length,
    thumbnailAssetId: p.thumbnailAssetId,
  };
}

/** "Pronto" quando já há participantes e campos no modelo; "Exportado" após a primeira exportação. */
export function deriveStatus(p: Project): Project["status"] {
  if (p.status === "exported") return "exported";
  return p.participants.length > 0 && p.templates.some((t) => t.elements.length > 0) ? "ready" : "draft";
}

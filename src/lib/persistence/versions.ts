import type { Project, ProjectVersion, VersionData } from "@/lib/model/types";
import { newId } from "@/lib/utils/id";
import type { ProjectRepository } from "./repository";

export const MAX_AUTO_VERSIONS = 30;

export function snapshotOf(project: Project): VersionData {
  return structuredClone({
    templates: project.templates,
    globals: project.globals,
    customFonts: project.customFonts,
    templateRules: project.templateRules,
  });
}

/** Assinatura simples para saber se o layout mudou desde a última versão. */
export function snapshotKey(data: VersionData): string {
  return JSON.stringify(data);
}

/**
 * Restaura modelos, dados fixos, fontes e regras de uma versão, mantendo os participantes.
 * Participantes de modelos que deixaram de existir passam ao primeiro modelo; ajustes
 * individuais de elementos que não existem mais são descartados.
 */
export function restoreVersion(project: Project, data: VersionData): Project {
  const snap = structuredClone(data);
  const templateIds = new Set(snap.templates.map((t) => t.id));
  const elementIds = new Set(snap.templates.flatMap((t) => t.elements.map((e) => e.id)));
  const fallback = snap.templates[0]?.id ?? project.templates[0].id;
  return {
    ...project,
    templates: snap.templates.length ? snap.templates.map((t) => ({ ...t, guides: t.guides ?? [] })) : project.templates,
    globals: snap.globals,
    customFonts: snap.customFonts ?? [],
    templateRules: (snap.templateRules ?? []).filter((r) => templateIds.has(r.templateId)),
    participants: project.participants.map((p) => {
      const overrides = Object.fromEntries(Object.entries(p.overrides).filter(([id]) => elementIds.has(id)));
      const templateId = templateIds.has(p.templateId) ? p.templateId : fallback;
      const same = templateId === p.templateId && Object.keys(overrides).length === Object.keys(p.overrides).length;
      return same ? p : { ...p, templateId, overrides };
    }),
  };
}

/** Grava uma versão do layout atual. Versões automáticas iguais à última não são repetidas. */
export async function saveVersion(repo: ProjectRepository, project: Project, label: string, auto: boolean): Promise<ProjectVersion | null> {
  const data = snapshotOf(project);
  const existing = await repo.listVersions(project.id);
  if (auto && existing[0] && snapshotKey(existing[0].data) === snapshotKey(data)) return null;
  const version: ProjectVersion = { id: newId(), projectId: project.id, createdAt: Date.now(), label, auto, data };
  await repo.saveVersion(version);
  // Mantém as automáticas mais recentes; as manuais ficam para sempre.
  const autos = [version, ...existing].filter((v) => v.auto);
  for (const old of autos.slice(MAX_AUTO_VERSIONS)) await repo.deleteVersion(old.id);
  return version;
}

import type { Project, VersionData } from "@/lib/model/types";

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
    templates: snap.templates.length ? snap.templates : project.templates,
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

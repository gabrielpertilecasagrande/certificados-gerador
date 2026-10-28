import type { ID, Project } from "@/lib/model/types";
import { normalizeForCompare } from "@/lib/import/validate";

/** Calcula o modelo de cada participante segundo as regras (ex.: Categoria = Palestrante → modelo Palestrante). */
export function templateAssignments(project: Pick<Project, "participants" | "templateRules" | "templates">, ids?: Iterable<ID>): { participantId: ID; templateId: ID }[] {
  const validTemplates = new Set(project.templates.map((t) => t.id));
  const rules = project.templateRules.filter((r) => validTemplates.has(r.templateId));
  if (!rules.length) return [];
  const filter = ids ? new Set(ids) : null;
  const out: { participantId: ID; templateId: ID }[] = [];
  for (const p of project.participants) {
    if (filter && !filter.has(p.id)) continue;
    const rule = rules.find((r) => normalizeForCompare(p.values[r.columnId] ?? "") === normalizeForCompare(r.value));
    if (rule && rule.templateId !== p.templateId) out.push({ participantId: p.id, templateId: rule.templateId });
  }
  return out;
}

/** Valores distintos de uma coluna (para montar as regras), com a contagem de participantes. */
export function distinctValues(project: Pick<Project, "participants">, columnId: ID): { value: string; count: number }[] {
  const map = new Map<string, { value: string; count: number }>();
  for (const p of project.participants) {
    const v = (p.values[columnId] ?? "").trim();
    const key = normalizeForCompare(v);
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { value: v, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

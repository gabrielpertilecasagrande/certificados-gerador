import type { Column, Participant } from "@/lib/model/types";
import { stripAccents } from "@/lib/variables";

export interface DataIssues {
  emptyName: string[];
  duplicates: string[][];
  emptyCells: Record<string, number>;
}

export const normalizeForCompare = (s: string) => stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();

export function validateParticipants(participants: Participant[], columns: Column[], nameColumnId?: string): DataIssues {
  const emptyName: string[] = [];
  const groups = new Map<string, string[]>();
  const emptyCells: Record<string, number> = {};
  for (const c of columns) emptyCells[c.id] = 0;
  for (const p of participants) {
    for (const c of columns) if (!(p.values[c.id] ?? "").trim()) emptyCells[c.id]++;
    if (!nameColumnId) continue;
    const name = normalizeForCompare(p.values[nameColumnId] ?? "");
    if (!name) {
      emptyName.push(p.id);
      continue;
    }
    const g = groups.get(name);
    if (g) g.push(p.id);
    else groups.set(name, [p.id]);
  }
  return { emptyName, duplicates: [...groups.values()].filter((g) => g.length > 1), emptyCells };
}

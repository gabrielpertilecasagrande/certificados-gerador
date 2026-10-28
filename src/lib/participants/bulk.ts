import Papa from "papaparse";
import type { ID, Participant } from "@/lib/model/types";
import { capitalizeWords } from "@/lib/variables";

export type TextOp = "upper" | "lower" | "capitalize" | "trim";

export const TEXT_OPS: { id: TextOp; label: string }[] = [
  { id: "upper", label: "MAIÚSCULAS" },
  { id: "lower", label: "minúsculas" },
  { id: "capitalize", label: "Capitalizar Palavras" },
  { id: "trim", label: "Remover espaços extras" },
];

export function applyTextOp(value: string, op: TextOp): string {
  switch (op) {
    case "upper":
      return value.toLocaleUpperCase("pt-BR");
    case "lower":
      return value.toLocaleLowerCase("pt-BR");
    case "capitalize":
      return capitalizeWords(value.trim().replace(/\s+/g, " "));
    case "trim":
      return value.replace(/\s+/g, " ").trim();
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface FindReplaceOptions {
  caseSensitive: boolean;
  wholeCell: boolean;
}

export function findReplace(value: string, find: string, replace: string, opts: FindReplaceOptions): string {
  if (!find) return value;
  if (opts.wholeCell) {
    const eq = opts.caseSensitive ? value === find : value.toLocaleLowerCase("pt-BR") === find.toLocaleLowerCase("pt-BR");
    return eq ? replace : value;
  }
  return value.replace(new RegExp(escapeRegExp(find), opts.caseSensitive ? "g" : "gi"), () => replace);
}

export interface CellChange {
  participantId: ID;
  columnId: ID;
  value: string;
}

/** Calcula apenas as células que realmente mudam (base para a prévia de "N registros afetados"). */
export function computeChanges(
  participants: Participant[],
  ids: Iterable<ID> | null,
  columnIds: ID[],
  fn: (value: string) => string,
): CellChange[] {
  const filter = ids ? new Set(ids) : null;
  const out: CellChange[] = [];
  for (const p of participants) {
    if (filter && !filter.has(p.id)) continue;
    for (const columnId of columnIds) {
      const before = p.values[columnId] ?? "";
      const after = fn(before);
      if (after !== before) out.push({ participantId: p.id, columnId, value: after });
    }
  }
  return out;
}

/** Converte texto TSV colado (Excel/Sheets) em matriz. */
export function parseClipboardGrid(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!clean.includes("\t") && !clean.includes('"')) return clean.split("\n").map((r) => [r]);
  // O Excel envia células com quebra de linha ou aspas entre aspas: usa um parser TSV de verdade.
  return Papa.parse<string[]>(clean, { delimiter: "\t", newline: "\n" }).data;
}

export function toClipboardGrid(rows: string[][]): string {
  return rows.map((r) => r.map((c) => c.replace(/[\t\n]/g, " ")).join("\t")).join("\n");
}

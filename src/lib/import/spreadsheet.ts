import Papa from "papaparse";
import readXlsxFile from "read-excel-file/universal";
import type { Column, Participant } from "@/lib/model/types";
import { newId } from "@/lib/utils/id";
import { slugify, uniqueKey } from "@/lib/variables";

export interface SheetTable {
  headers: string[];
  rows: string[][];
  sheetName?: string;
  sheetNames?: string[];
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const d = String(v.getUTCDate()).padStart(2, "0");
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12))).replace(".", ",");
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v).replace(/\r\n?/g, "\n").trim();
}

/** Primeira linha não vazia vira cabeçalho; linhas totalmente vazias são descartadas. */
export function normalizeTable(raw: unknown[][]): SheetTable {
  const rows = raw.map((r) => (r ?? []).map(cellToString)).filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) return { headers: [], rows: [] };
  const width = Math.max(...rows.map((r) => r.length));
  const headerRow = rows[0];
  const headers = Array.from({ length: width }, (_, i) => headerRow[i]?.trim() || `Coluna ${i + 1}`);
  const body = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  // Remove colunas sem cabeçalho original e sem nenhum dado.
  const keep = headers.map((_, i) => Boolean(headerRow[i]?.trim()) || body.some((r) => r[i] !== ""));
  return {
    headers: headers.filter((_, i) => keep[i]),
    rows: body.map((r) => r.filter((_, i) => keep[i])),
  };
}

export function parseCsvText(text: string): SheetTable {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy", delimiter: "" });
  return normalizeTable(result.data);
}

/** Texto colado de uma planilha (Excel/Google Sheets usam TAB). */
export function parsePastedText(text: string): SheetTable {
  if (text.includes("\t")) {
    const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { delimiter: "\t", skipEmptyLines: "greedy" });
    return normalizeTable(result.data);
  }
  return parseCsvText(text);
}

async function decodeCsv(buf: ArrayBuffer): Promise<string> {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // Planilhas exportadas pelo Excel em português costumam vir em Windows-1252.
  if (utf8.includes("�")) return new TextDecoder("windows-1252").decode(buf);
  return utf8;
}

export async function parseSpreadsheetFile(file: Blob & { name?: string }, sheet?: string): Promise<SheetTable> {
  const name = (file.name ?? "").toLowerCase();
  const buf = await file.arrayBuffer();
  const isZip = new Uint8Array(buf.slice(0, 2)).every((b, i) => b === [0x50, 0x4b][i]);
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv") || !isZip) {
    if (name.endsWith(".xls")) throw new Error("Formato .xls antigo não suportado. Salve como .xlsx ou .csv.");
    const text = await decodeCsv(buf);
    return name.endsWith(".tsv") ? parsePastedText(text) : parseCsvText(text);
  }
  const sheets = await readXlsxFile(buf);
  if (sheets.length === 0) return { headers: [], rows: [] };
  const chosen = sheets.find((s) => s.sheet === sheet) ?? sheets.find((s) => s.data.length > 0) ?? sheets[0];
  return { ...normalizeTable(chosen.data as unknown[][]), sheetName: chosen.sheet, sheetNames: sheets.map((s) => s.sheet) };
}

export type ColumnTarget = { kind: "new"; label: string; key: string } | { kind: "existing"; columnId: string } | { kind: "ignore" };

/** Sugere o destino de cada coluna da planilha: coluna existente com mesmo nome ou nova coluna. */
export function suggestMapping(headers: string[], existing: Column[]): ColumnTarget[] {
  const used = new Set<string>();
  const keys = new Set(existing.map((c) => c.key));
  return headers.map((h) => {
    let key = slugify(h);
    if (["nome_completo", "nome_do_participante", "participante", "name", "aluno"].includes(key) && !keys.has(key)) {
      const nome = existing.find((c) => c.key === "nome");
      if (nome && !used.has(nome.id)) {
        used.add(nome.id);
        return { kind: "existing", columnId: nome.id };
      }
      if (!existing.length) key = "nome";
    }
    const match = existing.find((c) => c.key === key && !used.has(c.id));
    if (match) {
      used.add(match.id);
      return { kind: "existing", columnId: match.id };
    }
    return { kind: "new", label: h, key };
  });
}

export interface ImportResult {
  columns: Column[];
  participants: Participant[];
}

/** Aplica o mapeamento: cria colunas novas e gera participantes. */
export function buildImport(
  table: SheetTable,
  mapping: ColumnTarget[],
  existing: Column[],
  templateId: string,
): ImportResult {
  const columns = [...existing];
  const colIds: (string | null)[] = mapping.map((m) => {
    if (m.kind === "ignore") return null;
    if (m.kind === "existing") return m.columnId;
    const col: Column = { id: newId(), key: uniqueKey(slugify(m.key || m.label), columns.map((c) => c.key)), label: m.label };
    columns.push(col);
    return col.id;
  });
  const participants = table.rows.map((row): Participant => {
    const values: Record<string, string> = {};
    row.forEach((v, i) => {
      const id = colIds[i];
      if (id) values[id] = values[id] ? `${values[id]} ${v}`.trim() : v;
    });
    return { id: newId(), values, templateId, overrides: {} };
  });
  return { columns, participants };
}

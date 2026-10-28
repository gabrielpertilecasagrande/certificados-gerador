import type { Column, GlobalVariable, Participant, Project } from "@/lib/model/types";

/** Remove acentos: "Carga horária" → "Carga horaria". */
export const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Converte um rótulo em nome de variável: "Carga horária" → "carga_horaria". */
export function slugify(label: string): string {
  const slug = stripAccents(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "campo";
}

/** Garante que `key` não colida com chaves existentes (adiciona _2, _3…). */
export function uniqueKey(key: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(key)) return key;
  let i = 2;
  while (taken.has(`${key}_${i}`)) i++;
  return `${key}_${i}`;
}

export type Token =
  | { type: "text"; value: string }
  | { type: "var"; key: string; filters: string[]; raw: string };

const VAR_RE = /\{\{\s*([\p{L}\p{N}_.-]+)\s*((?:\|\s*[a-z_]+\s*)*)\}\}/giu;

export function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of content.matchAll(VAR_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ type: "text", value: content.slice(last, idx) });
    const filters = (m[2] ?? "")
      .split("|")
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean);
    tokens.push({ type: "var", key: m[1].toLowerCase(), filters, raw: m[0] });
    last = idx + m[0].length;
  }
  if (last < content.length) tokens.push({ type: "text", value: content.slice(last) });
  return tokens;
}

export function variablesIn(content: string): string[] {
  return [...new Set(tokenize(content).flatMap((t) => (t.type === "var" ? [t.key] : [])))];
}

const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "la", "van", "von"]);

/** Capitaliza palavras respeitando conectivos em português ("Ana da Silva"). */
export function capitalizeWords(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|-)/)
    .map((w, i) => {
      if (!w.trim() || w === "-") return w;
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      return w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1);
    })
    .join("");
}

export function applyFilter(value: string, filter: string): string {
  switch (filter) {
    case "upper":
    case "maiusculas":
      return value.toLocaleUpperCase("pt-BR");
    case "lower":
    case "minusculas":
      return value.toLocaleLowerCase("pt-BR");
    case "title":
    case "capitalizar":
      return capitalizeWords(value);
    case "trim":
      return value.trim().replace(/\s+/g, " ");
    case "first":
    case "primeiro":
      return value.trim().split(/\s+/)[0] ?? "";
    case "last":
    case "ultimo":
      return value.trim().split(/\s+/).slice(-1)[0] ?? "";
    default:
      return value;
  }
}

export const NAME_KEYS = ["nome", "nome_completo", "name", "participante", "aluno", "nome_do_participante"];

export function findNameColumn(columns: Column[]): Column | undefined {
  for (const k of NAME_KEYS) {
    const c = columns.find((col) => col.key === k);
    if (c) return c;
  }
  return columns.find((c) => c.key.startsWith("nome"));
}

/** Variáveis sugeridas no menu "Adicionar campo". */
export const PRESET_VARIABLES: { key: string; label: string }[] = [
  { key: "nome", label: "Nome completo" },
  { key: "primeiro_nome", label: "Primeiro nome" },
  { key: "sobrenome", label: "Sobrenome" },
  { key: "evento", label: "Evento" },
  { key: "data", label: "Data" },
  { key: "carga_horaria", label: "Carga horária" },
  { key: "categoria", label: "Categoria" },
  { key: "instituicao", label: "Instituição" },
  { key: "funcao", label: "Função" },
  { key: "codigo", label: "Código" },
];

export const DERIVED_KEYS = ["primeiro_nome", "sobrenome"] as const;

export type VariableContext = Map<string, string>;

export function buildContext(
  project: Pick<Project, "columns" | "globals">,
  participant: Pick<Participant, "values"> | null,
): VariableContext {
  const ctx: VariableContext = new Map();
  for (const g of project.globals) ctx.set(g.key, g.value ?? "");
  for (const c of project.columns) {
    const v = participant?.values[c.id] ?? "";
    // Um valor global serve de padrão quando a célula está vazia.
    if (v.trim() !== "" || !ctx.has(c.key)) ctx.set(c.key, v);
  }
  const nameCol = findNameColumn(project.columns);
  const fullName = nameCol ? (ctx.get(nameCol.key) ?? "") : "";
  if (!ctx.has("nome")) ctx.set("nome", fullName);
  if (!ctx.has("nome_completo")) ctx.set("nome_completo", fullName);
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!ctx.has("primeiro_nome")) ctx.set("primeiro_nome", parts[0] ?? "");
  if (!ctx.has("sobrenome")) ctx.set("sobrenome", parts.slice(1).join(" "));
  return ctx;
}

export interface RenderedText {
  text: string;
  /** Variáveis que não existem em lugar nenhum (nem coluna, nem global). */
  missing: string[];
  /** Variáveis conhecidas mas vazias para este participante. */
  empty: string[];
}

export function renderContent(content: string, ctx: VariableContext): RenderedText {
  const missing: string[] = [];
  const empty: string[] = [];
  let text = "";
  for (const t of tokenize(content)) {
    if (t.type === "text") {
      text += t.value;
      continue;
    }
    if (!ctx.has(t.key)) {
      missing.push(t.key);
      continue;
    }
    let v = ctx.get(t.key) ?? "";
    for (const f of t.filters) v = applyFilter(v, f);
    if (v.trim() === "") empty.push(t.key);
    text += v;
  }
  return { text, missing, empty };
}

/** Lista de variáveis conhecidas no projeto (para menus e validação). */
export function knownVariables(project: Pick<Project, "columns" | "globals">): { key: string; label: string; source: "column" | "global" | "derived" }[] {
  const out: { key: string; label: string; source: "column" | "global" | "derived" }[] = [];
  const seen = new Set<string>();
  for (const c of project.columns) {
    out.push({ key: c.key, label: c.label, source: "column" });
    seen.add(c.key);
  }
  for (const g of project.globals) {
    if (seen.has(g.key)) continue;
    out.push({ key: g.key, label: g.label, source: "global" });
    seen.add(g.key);
  }
  if (findNameColumn(project.columns)) {
    for (const k of DERIVED_KEYS) {
      if (seen.has(k)) continue;
      out.push({ key: k, label: k === "primeiro_nome" ? "Primeiro nome" : "Sobrenome", source: "derived" });
    }
  }
  return out;
}

export type { Column, GlobalVariable };

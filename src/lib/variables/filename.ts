import { renderContent, type VariableContext } from "./index";

const INVALID = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function sanitizeFileName(name: string, fallback = "certificado"): string {
  const clean = name
    .replace(INVALID, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s_]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
  return clean || fallback;
}

export function renderFileName(pattern: string, ctx: VariableContext, fallback: string): string {
  const base = pattern.replace(/\.(pdf|png|jpe?g)$/i, "");
  return sanitizeFileName(renderContent(base, ctx).text, fallback);
}

/** Gera nomes únicos (case-insensitive) dentro de uma mesma pasta: "Ana.pdf", "Ana (2).pdf". */
export class FileNameRegistry {
  private used = new Set<string>();

  take(folder: string, base: string, ext: string): string {
    const prefix = folder ? `${folder}/` : "";
    let candidate = `${prefix}${base}.${ext}`;
    let i = 2;
    while (this.used.has(candidate.toLowerCase())) {
      candidate = `${prefix}${base} (${i}).${ext}`;
      i++;
    }
    this.used.add(candidate.toLowerCase());
    return candidate;
  }
}

import type { CustomFont } from "@/lib/model/types";
import { FONT_FAMILIES, fontkit } from "@/lib/render/fonts";

export const PT_CHARS = "ÁÂÃÀÉÊÍÓÔÕÚÜÇáâãàéêíóôõúüç";
export const MAX_FONT_BYTES = 15 * 1024 * 1024;

export interface FontInfo {
  family: string;
  weight: number;
  italic: boolean;
  /** Caracteres do português sem glifo na fonte (sairiam como caixa vazia). */
  missingChars: string[];
}

/** Valida e lê os metadados de um arquivo TTF/OTF. */
export function readFontInfo(bytes: Uint8Array, existing: Pick<CustomFont, "family" | "weight" | "italic">[] = []): FontInfo {
  const sig = String.fromCharCode(...bytes.slice(0, 4));
  const isFont = sig === "\u0000\u0001\u0000\u0000" || sig === "true" || sig === "OTTO";
  if (!isFont) throw new Error("Arquivo de fonte inválido. Use TTF ou OTF.");
  if (bytes.length > MAX_FONT_BYTES) throw new Error("Fonte maior que 15 MB");
  let font: ReturnType<typeof fontkit.create>;
  try {
    font = fontkit.create(bytes);
  } catch {
    throw new Error("Não foi possível ler esta fonte");
  }
  const os2 = (font as unknown as { "OS/2"?: { usWeightClass?: number; fsSelection?: { italic?: boolean } } })["OS/2"];
  const sub = (font.subfamilyName ?? "").toLowerCase();
  const italic = Boolean(os2?.fsSelection?.italic) || font.italicAngle !== 0 || /italic|oblique/.test(sub);
  const rawWeight = os2?.usWeightClass ?? (/bold/.test(sub) ? 700 : 400);
  const weight = Math.min(900, Math.max(100, Math.round(rawWeight / 100) * 100));
  let family = (font.familyName || "Fonte personalizada").trim();
  // Não sobrepõe as famílias embutidas.
  if (FONT_FAMILIES.includes(family)) family = `${family} (projeto)`;
  if (existing.some((f) => f.family === family && f.weight === weight && f.italic === italic)) {
    throw new Error(`A fonte "${family}" com esse estilo já foi adicionada`);
  }
  const missingChars = Array.from(PT_CHARS).filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)!));
  return { family, weight, italic, missingChars };
}

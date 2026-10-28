import type { FitMode, HAlign, TextFit, TextTransform, VAlign } from "@/lib/model/types";
import { capitalizeWords } from "@/lib/variables";
import type { FontkitFont } from "./fonts";

/**
 * Motor de layout de texto compartilhado pelo editor (canvas) e pela exportação (PDF).
 * Mede com as métricas reais da fonte (fontkit), exatamente como o pdf-lib calcula as larguras,
 * para que a quebra de linha, o tamanho e o alinhamento sejam idênticos nas duas saídas.
 */

export interface LayoutInput {
  text: string;
  font: FontkitFont;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  align: HAlign;
  verticalAlign: VAlign;
  padding: number;
  width: number;
  height: number;
  fit: TextFit;
  textTransform: TextTransform;
}

export interface LayoutLine {
  text: string;
  width: number;
  /** Deslocamento horizontal da linha dentro da caixa (pt). */
  x: number;
  /** Posição da linha de base, a partir do topo da caixa (pt). */
  baseline: number;
}

export interface LayoutResult {
  fontSize: number;
  lines: LayoutLine[];
  /** true quando o texto não coube nem no tamanho mínimo — nunca cortamos silenciosamente. */
  overflow: boolean;
  /** true quando o tamanho foi reduzido em relação ao configurado. */
  reduced: boolean;
  blockHeight: number;
}

const EPS = 0.01;

export function applyTextTransform(text: string, t: TextTransform): string {
  switch (t) {
    case "uppercase":
      return text.toLocaleUpperCase("pt-BR");
    case "lowercase":
      return text.toLocaleLowerCase("pt-BR");
    case "capitalize":
      return capitalizeWords(text);
    default:
      return text;
  }
}

/** Largura de um texto em unidades da fonte (sem escala), igual ao pdf-lib (soma dos advanceWidth). */
function advanceUnits(font: FontkitFont, text: string): { units: number; glyphs: number } {
  if (!text) return { units: 0, glyphs: 0 };
  const { glyphs } = font.layout(text);
  let units = 0;
  for (const g of glyphs) units += g.advanceWidth;
  return { units, glyphs: glyphs.length };
}

export function measureText(font: FontkitFont, text: string, size: number, letterSpacing: number): number {
  const { units, glyphs } = advanceUnits(font, text);
  return (units * size) / font.unitsPerEm + letterSpacing * Math.max(0, glyphs - 1);
}

/** Quebra gulosa por palavras; palavras maiores que a largura são quebradas por caractere. */
function wrapParagraph(
  font: FontkitFont,
  paragraph: string,
  size: number,
  letterSpacing: number,
  maxWidth: number,
): string[] {
  const words = paragraph.split(/ +/).filter((w, i, arr) => w !== "" || arr.length === 1);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  const fits = (s: string) => measureText(font, s, size, letterSpacing) <= maxWidth + EPS;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (fits(word)) {
      current = word;
      continue;
    }
    // Palavra sozinha não cabe: quebra por caractere.
    let chunk = "";
    for (const ch of Array.from(word)) {
      if (chunk && !fits(chunk + ch)) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  }
  lines.push(current);
  return lines;
}

function breakLines(
  font: FontkitFont,
  text: string,
  size: number,
  letterSpacing: number,
  maxWidth: number,
  allowWrap: boolean,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  if (!allowWrap) return paragraphs;
  return paragraphs.flatMap((p) => wrapParagraph(font, p, size, letterSpacing, maxWidth));
}

interface Attempt {
  size: number;
  lines: string[];
  widths: number[];
  blockHeight: number;
  fits: boolean;
}

function attempt(input: LayoutInput, size: number, maxLines: number, allowWrap: boolean): Attempt {
  const { font, letterSpacing, lineHeight, padding } = input;
  const availW = Math.max(0, input.width - 2 * padding);
  const availH = Math.max(0, input.height - 2 * padding);
  const lines = breakLines(font, input.text, size, letterSpacing, availW, allowWrap);
  const widths = lines.map((l) => measureText(font, l, size, letterSpacing));
  const blockHeight = textBlockHeight(font, size, lineHeight, lines.length);
  const fits =
    widths.every((w) => w <= availW + EPS) && lines.length <= Math.max(1, maxLines) && blockHeight <= availH + EPS;
  return { size, lines, widths, blockHeight, fits };
}

export function textBlockHeight(font: FontkitFont, size: number, lineHeight: number, lineCount: number): number {
  const ascent = (font.ascent * size) / font.unitsPerEm;
  const descent = (Math.abs(font.descent) * size) / font.unitsPerEm;
  return ascent + descent + Math.max(0, lineCount - 1) * size * lineHeight;
}

/** Maior tamanho em [lo, hi] (passo 0,1 pt) que cabe; null se nem `lo` couber. */
function largestFitting(input: LayoutInput, lo: number, hi: number, maxLines: number, allowWrap: boolean): Attempt | null {
  const atLo = attempt(input, lo, maxLines, allowWrap);
  if (!atLo.fits) return null;
  const atHi = attempt(input, hi, maxLines, allowWrap);
  if (atHi.fits) return atHi;
  let best = atLo;
  let a = Math.round(lo * 10);
  let b = Math.round(hi * 10);
  while (b - a > 1) {
    const mid = Math.floor((a + b) / 2);
    const r = attempt(input, mid / 10, maxLines, allowWrap);
    if (r.fits) {
      best = r;
      a = mid;
    } else {
      b = mid;
    }
  }
  return best;
}

export function layoutText(raw: LayoutInput): LayoutResult {
  const input = { ...raw, text: applyTextTransform(raw.text, raw.textTransform) };
  const { fit } = input;
  const mode: FitMode = fit.mode;
  const minSize = Math.max(1, Math.min(fit.minSize, input.fontSize));
  const maxLines = mode === "shrink" ? Math.max(1, input.text.split(/\r?\n/).length) : Math.max(1, fit.maxLines);
  const allowWrap = mode === "wrap" || (mode !== "shrink" && fit.maxLines > 1);

  let chosen: Attempt;
  let overflow = false;

  if (mode === "fixed") {
    chosen = attempt(input, input.fontSize, maxLines, allowWrap);
    overflow = !chosen.fits;
  } else if (mode === "grow") {
    const hi = Math.max(fit.maxSize, minSize);
    const r = largestFitting(input, minSize, hi, maxLines, allowWrap);
    chosen = r ?? attempt(input, minSize, maxLines, allowWrap);
    overflow = !r;
  } else {
    // shrink / wrap: mantém o tamanho configurado; só reduz quando necessário.
    const first = attempt(input, input.fontSize, maxLines, allowWrap);
    if (first.fits) {
      chosen = first;
    } else {
      const r = largestFitting(input, minSize, input.fontSize, maxLines, allowWrap);
      chosen = r ?? attempt(input, minSize, maxLines, allowWrap);
      overflow = !r;
    }
  }

  return positionLines(input, chosen, overflow);
}

function positionLines(input: LayoutInput, a: Attempt, overflow: boolean): LayoutResult {
  const { font, padding, lineHeight } = input;
  const availW = Math.max(0, input.width - 2 * padding);
  const availH = Math.max(0, input.height - 2 * padding);
  const ascent = (font.ascent * a.size) / font.unitsPerEm;
  let top = padding;
  if (input.verticalAlign === "middle") top = padding + (availH - a.blockHeight) / 2;
  else if (input.verticalAlign === "bottom") top = padding + availH - a.blockHeight;

  const lines: LayoutLine[] = a.lines.map((text, i) => {
    const width = a.widths[i];
    let x = padding;
    if (input.align === "center") x = padding + (availW - width) / 2;
    else if (input.align === "right") x = padding + availW - width;
    return { text, width, x, baseline: top + ascent + i * a.size * lineHeight };
  });

  return { fontSize: a.size, lines, overflow, reduced: a.size < input.fontSize - EPS, blockHeight: a.blockHeight };
}

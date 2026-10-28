import { mmToPt } from "@/lib/utils/units";
import { newId } from "@/lib/utils/id";
import type {
  ExportSettings,
  PagePreset,
  PageSize,
  Project,
  ShapeElement,
  Template,
  TextElement,
} from "./types";

export const PAGE_PRESETS: Record<Exclude<PagePreset, "custom">, { label: string; widthMm: number; heightMm: number }> = {
  "A4-landscape": { label: "A4 horizontal", widthMm: 297, heightMm: 210 },
  "A4-portrait": { label: "A4 vertical", widthMm: 210, heightMm: 297 },
  "A5-landscape": { label: "A5 horizontal", widthMm: 210, heightMm: 148 },
  "A5-portrait": { label: "A5 vertical", widthMm: 148, heightMm: 210 },
};

export function pageFromPreset(preset: Exclude<PagePreset, "custom">): PageSize {
  const p = PAGE_PRESETS[preset];
  return { widthPt: mmToPt(p.widthMm), heightPt: mmToPt(p.heightMm), preset };
}

/** Identifica um preset a partir de dimensões em pt (tolerância de 2 mm). */
export function detectPreset(widthPt: number, heightPt: number): PagePreset {
  const tol = mmToPt(2);
  for (const [key, p] of Object.entries(PAGE_PRESETS)) {
    if (Math.abs(mmToPt(p.widthMm) - widthPt) < tol && Math.abs(mmToPt(p.heightMm) - heightPt) < tol) {
      return key as PagePreset;
    }
  }
  return "custom";
}

export const DEFAULT_EXPORT: ExportSettings = {
  format: "pdf-zip",
  fileNamePattern: "Certificado_{{nome}}",
  zipLayout: "flat",
  zipGroupColumnId: null,
  dpi: 300,
  jpgQuality: 0.92,
};

export function createTemplate(name = "Modelo principal", page: PageSize = pageFromPreset("A4-landscape")): Template {
  return { id: newId(), name, page, background: null, elements: [], marginPt: mmToPt(10), guides: [] };
}

export function createProject(name: string, template?: Template): Project {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    templates: [template ?? createTemplate()],
    columns: [],
    participants: [],
    globals: [],
    exportSettings: { ...DEFAULT_EXPORT },
    thumbnailAssetId: null,
    lastExportAt: null,
    templateRules: [],
    customFonts: [],
  };
}

export function createTextElement(page: PageSize, partial: Partial<TextElement> = {}): TextElement {
  const width = Math.min(page.widthPt * 0.7, mmToPt(200));
  const fontSize = partial.fontSize ?? 34;
  const height = partial.height ?? Math.round(fontSize * 1.6);
  return {
    id: newId(),
    type: "text",
    name: "Texto",
    x: (page.widthPt - width) / 2,
    y: (page.heightPt - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: "Texto",
    fontFamily: "Montserrat",
    fontSize,
    fontWeight: 700,
    italic: false,
    color: "#1f2937",
    letterSpacing: 0,
    lineHeight: 1.2,
    textTransform: "none",
    align: "center",
    verticalAlign: "middle",
    padding: 0,
    fit: { mode: "shrink", minSize: 14, maxSize: fontSize, maxLines: 1 },
    ...partial,
  };
}

export function createShapeElement(page: PageSize, type: ShapeElement["type"]): ShapeElement {
  const isLine = type === "line";
  const width = isLine ? mmToPt(70) : mmToPt(50);
  const height = isLine ? 0 : type === "ellipse" ? mmToPt(50) : mmToPt(30);
  return {
    id: newId(),
    type,
    name: type === "rect" ? "Retângulo" : type === "ellipse" ? "Círculo" : "Linha",
    x: (page.widthPt - width) / 2,
    y: (page.heightPt - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fill: isLine ? null : "#e5e7eb",
    stroke: isLine ? "#1f2937" : null,
    strokeWidth: 1,
    cornerRadius: 0,
  };
}

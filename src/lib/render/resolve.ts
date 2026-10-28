import type {
  Element,
  ElementOverride,
  Participant,
  Project,
  Template,
  TextElement,
} from "@/lib/model/types";
import { buildContext, renderContent, variablesIn, type VariableContext } from "@/lib/variables";
import { layoutText, type LayoutResult } from "./layout";
import { resolveFontVariant, type FontStore } from "./fonts";

export type IssueCode =
  | "overflow"
  | "empty-text"
  | "empty-var"
  | "missing-var"
  | "outside-page"
  | "no-background"
  | "font-error"
  | "duplicate";

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning";
  message: string;
  elementId?: string;
}

export interface ResolvedText {
  kind: "text";
  el: TextElement;
  text: string;
  fontFile: string;
  layout: LayoutResult;
}
export interface ResolvedOther {
  kind: "other";
  el: Exclude<Element, TextElement>;
}
export type ResolvedItem = ResolvedText | ResolvedOther;

export interface ResolvedCertificate {
  template: Template;
  items: ResolvedItem[];
  issues: Issue[];
}

export function applyOverride<T extends Element>(el: T, ov: ElementOverride | undefined): T {
  if (!ov) return el;
  if (el.type === "text") return { ...el, ...ov, fit: ov.fit ? { ...ov.fit } : el.fit } as T;
  // Imagens e formas aceitam apenas ajustes de geometria/visibilidade.
  const { x, y, width, height, rotation, hidden } = ov;
  const geo = Object.fromEntries(Object.entries({ x, y, width, height, rotation, hidden }).filter(([, v]) => v !== undefined));
  return { ...el, ...geo } as T;
}

export function fontFileFor(el: Pick<TextElement, "fontFamily" | "fontWeight" | "italic">): string {
  return resolveFontVariant(el.fontFamily, el.fontWeight, el.italic).file;
}

export function fontFilesForTemplates(templates: Template[]): string[] {
  const files = new Set<string>();
  for (const t of templates) for (const el of t.elements) if (el.type === "text") files.add(fontFileFor(el));
  return [...files];
}

const SAMPLE_VALUES: Record<string, string> = {
  nome: "Maria Aparecida dos Santos",
  nome_completo: "Maria Aparecida dos Santos",
  primeiro_nome: "Maria",
  sobrenome: "Aparecida dos Santos",
};

/** Contexto usado no editor quando ainda não há participantes: mostra exemplos/placeholders. */
export function sampleContext(project: Pick<Project, "columns" | "globals">): VariableContext {
  const ctx = buildContext(project, null);
  for (const [k, v] of ctx) {
    if (v.trim() === "") ctx.set(k, SAMPLE_VALUES[k] ?? `[${project.columns.find((c) => c.key === k)?.label ?? k}]`);
  }
  for (const [k, v] of Object.entries(SAMPLE_VALUES)) if (!ctx.get(k)) ctx.set(k, v);
  return ctx;
}

export function templateFor(project: Project, participant: Participant | null): Template {
  return project.templates.find((t) => t.id === participant?.templateId) ?? project.templates[0];
}

function outsidePage(el: Element, t: Template): boolean {
  const tol = 1;
  return el.x < -tol || el.y < -tol || el.x + el.width > t.page.widthPt + tol || el.y + el.height > t.page.heightPt + tol;
}

export function resolveCertificate(
  project: Project,
  participant: Participant | null,
  fonts: FontStore,
  opts: { template?: Template; ctx?: VariableContext; includeHidden?: boolean } = {},
): ResolvedCertificate {
  const template = opts.template ?? templateFor(project, participant);
  const ctx = opts.ctx ?? (participant ? buildContext(project, participant) : sampleContext(project));
  const items: ResolvedItem[] = [];
  const issues: Issue[] = [];

  if (!template.background) {
    issues.push({ code: "no-background", severity: "warning", message: "Modelo sem arte de fundo" });
  }

  for (const base of template.elements) {
    const el = applyOverride(base, participant?.overrides[base.id]);
    if (el.hidden && !opts.includeHidden) continue;
    if (outsidePage(el, template)) {
      issues.push({ code: "outside-page", severity: "warning", elementId: el.id, message: `"${el.name}" está fora da página` });
    }
    if (el.type !== "text") {
      items.push({ kind: "other", el });
      continue;
    }
    const rendered = renderContent(el.content, ctx);
    for (const key of rendered.missing) {
      issues.push({ code: "missing-var", severity: "error", elementId: el.id, message: `Variável {{${key}}} sem correspondência` });
    }
    if (variablesIn(el.content).length > 0 && rendered.text.trim() === "") {
      issues.push({ code: "empty-text", severity: "error", elementId: el.id, message: `"${el.name}" ficou vazio` });
    } else {
      for (const key of rendered.empty) {
        issues.push({ code: "empty-var", severity: "warning", elementId: el.id, message: `Campo {{${key}}} vazio` });
      }
    }
    const fontFile = fontFileFor(el);
    let layout: LayoutResult;
    try {
      layout = layoutText({
        text: rendered.text,
        font: fonts.get(fontFile),
        fontSize: el.fontSize,
        letterSpacing: el.letterSpacing,
        lineHeight: el.lineHeight,
        align: el.align,
        verticalAlign: el.verticalAlign,
        padding: el.padding,
        width: el.width,
        height: el.height,
        fit: el.fit,
        textTransform: el.textTransform,
      });
    } catch (e) {
      issues.push({ code: "font-error", severity: "error", elementId: el.id, message: `Fonte indisponível: ${el.fontFamily}` });
      console.error(e);
      continue;
    }
    if (layout.overflow) {
      issues.push({
        code: "overflow",
        severity: "error",
        elementId: el.id,
        message: `"${el.name}" não coube na caixa, mesmo em ${el.fit.minSize} pt`,
      });
    }
    items.push({ kind: "text", el, text: rendered.text, fontFile, layout });
  }
  return { template, items, issues };
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === "error");

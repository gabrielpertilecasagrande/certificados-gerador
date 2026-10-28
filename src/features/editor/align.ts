import type { Element, Template } from "@/lib/model/types";

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Alinha elementos entre si (2+) ou em relação à página/margens (1 elemento). */
export function alignPatches(
  els: Element[],
  kind: AlignKind,
  template: Template,
  relativeTo: "selection" | "page" | "margins",
): { id: string; patch: Partial<Element> }[] {
  if (!els.length) return [];
  let box: { x: number; y: number; w: number; h: number };
  if (relativeTo === "selection" && els.length > 1) {
    const x = Math.min(...els.map((e) => e.x));
    const y = Math.min(...els.map((e) => e.y));
    box = { x, y, w: Math.max(...els.map((e) => e.x + e.width)) - x, h: Math.max(...els.map((e) => e.y + e.height)) - y };
  } else if (relativeTo === "margins") {
    const m = template.marginPt;
    box = { x: m, y: m, w: template.page.widthPt - 2 * m, h: template.page.heightPt - 2 * m };
  } else {
    box = { x: 0, y: 0, w: template.page.widthPt, h: template.page.heightPt };
  }
  return els.map((e) => {
    const patch: Partial<Element> = {};
    if (kind === "left") patch.x = box.x;
    if (kind === "hcenter") patch.x = box.x + (box.w - e.width) / 2;
    if (kind === "right") patch.x = box.x + box.w - e.width;
    if (kind === "top") patch.y = box.y;
    if (kind === "vcenter") patch.y = box.y + (box.h - e.height) / 2;
    if (kind === "bottom") patch.y = box.y + box.h - e.height;
    return { id: e.id, patch };
  });
}

export function distributePatches(els: Element[], axis: "h" | "v"): { id: string; patch: Partial<Element> }[] {
  if (els.length < 3) return [];
  const sorted = [...els].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const size = (e: Element) => (axis === "h" ? e.width : e.height);
  const start = axis === "h" ? first.x : first.y;
  const end = axis === "h" ? last.x + last.width : last.y + last.height;
  const total = sorted.reduce((s, e) => s + size(e), 0);
  const gap = (end - start - total) / (sorted.length - 1);
  let cursor = start;
  return sorted.map((e) => {
    const patch = axis === "h" ? { x: cursor } : { y: cursor };
    cursor += size(e) + gap;
    return { id: e.id, patch };
  });
}

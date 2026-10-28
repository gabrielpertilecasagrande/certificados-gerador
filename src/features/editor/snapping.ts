import type { Element, Template } from "@/lib/model/types";

export interface Guide {
  orientation: "v" | "h";
  pos: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Encaixe magnético: bordas/centro da página, margens e bordas/centros de outros elementos. */
export function snapBox(box: Box, template: Template, others: Element[], threshold: number): SnapResult {
  const W = template.page.widthPt;
  const H = template.page.heightPt;
  const m = template.marginPt;
  const vTargets = [0, W / 2, W, m, W - m];
  const hTargets = [0, H / 2, H, m, H - m];
  for (const g of template.guides ?? []) (g.orientation === "v" ? vTargets : hTargets).push(g.pos);
  for (const o of others) {
    if (o.hidden || o.rotation % 360 !== 0) continue;
    vTargets.push(o.x, o.x + o.width / 2, o.x + o.width);
    hTargets.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  const best = (edges: number[], targets: number[]) => {
    let found: { delta: number; pos: number } | null = null;
    for (const e of edges) {
      for (const t of targets) {
        const d = t - e;
        if (Math.abs(d) <= threshold && (!found || Math.abs(d) < Math.abs(found.delta))) found = { delta: d, pos: t };
      }
    }
    return found;
  };
  const v = best([box.x, box.x + box.width / 2, box.x + box.width], vTargets);
  const h = best([box.y, box.y + box.height / 2, box.y + box.height], hTargets);
  const guides: Guide[] = [];
  if (v) guides.push({ orientation: "v", pos: v.pos });
  if (h) guides.push({ orientation: "h", pos: h.pos });
  return { dx: v?.delta ?? 0, dy: h?.delta ?? 0, guides };
}

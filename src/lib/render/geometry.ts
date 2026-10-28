import type { Background, PageSize } from "@/lib/model/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Retângulo (coordenadas a partir do topo esquerdo, em pt) ocupado pelo fundo na página. */
export function backgroundRect(bg: Background, page: PageSize): Rect {
  const W = page.widthPt;
  const H = page.heightPt;
  if (bg.fit === "stretch" || !bg.naturalWidthPt || !bg.naturalHeightPt) return { x: 0, y: 0, width: W, height: H };
  const sx = W / bg.naturalWidthPt;
  const sy = H / bg.naturalHeightPt;
  const s = bg.fit === "contain" ? Math.min(sx, sy) : Math.max(sx, sy);
  const width = bg.naturalWidthPt * s;
  const height = bg.naturalHeightPt * s;
  return { x: (W - width) / 2, y: (H - height) / 2, width, height };
}

export function parseHexColor(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

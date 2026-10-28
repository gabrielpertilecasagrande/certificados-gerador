import type { ImageElement, ShapeElement } from "@/lib/model/types";
import { cssFontName } from "./fonts";
import { backgroundRect } from "./geometry";
import type { ResolvedCertificate, ResolvedText } from "./resolve";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Desenha um texto já diagramado, em coordenadas locais (pt) com origem no topo esquerdo da caixa. */
export function drawTextLines(ctx: Ctx, item: Pick<ResolvedText, "el" | "fontFile" | "layout">) {
  const { el, layout } = item;
  ctx.save();
  ctx.font = `${layout.fontSize}px "${cssFontName(item.fontFile)}"`;
  ctx.fillStyle = el.color;
  ctx.globalAlpha *= el.opacity;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // O PDF não aplica kerning (usa apenas a largura de avanço dos glifos): desliga no canvas também.
  if ("fontKerning" in ctx) ctx.fontKerning = "none";
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${el.letterSpacing}px`;
  for (const line of layout.lines) if (line.text) ctx.fillText(line.text, line.x, line.baseline);
  ctx.restore();
}

export function drawShape(ctx: Ctx, el: ShapeElement) {
  ctx.save();
  ctx.globalAlpha *= el.opacity;
  ctx.beginPath();
  if (el.type === "line") {
    ctx.moveTo(0, el.height / 2);
    ctx.lineTo(el.width, el.height / 2);
    ctx.strokeStyle = el.stroke ?? "#000";
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (el.type === "ellipse") ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
  else if (el.cornerRadius > 0) ctx.roundRect(0, 0, el.width, el.height, Math.min(el.cornerRadius, el.width / 2, el.height / 2));
  else ctx.rect(0, 0, el.width, el.height);
  if (el.fill) {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
  ctx.restore();
}

export type Drawable = CanvasImageSource & { width: number; height: number };

export interface CanvasSources {
  /** Fundo já rasterizado para a resolução desejada. */
  background?: Drawable | null;
  images: Map<string, Drawable>;
}

/** Renderiza um certificado completo num canvas (miniaturas e exportação PNG/JPG). */
export function drawCertificate(ctx: Ctx, cert: ResolvedCertificate, scale: number, sources: CanvasSources) {
  const { template } = cert;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, template.page.widthPt, template.page.heightPt);
  if (template.background?.visible && sources.background) {
    const r = backgroundRect(template.background, template.page);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, template.page.widthPt, template.page.heightPt);
    ctx.clip();
    ctx.drawImage(sources.background, r.x, r.y, r.width, r.height);
    ctx.restore();
  }
  for (const item of cert.items) {
    const el = item.el;
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.rotate((el.rotation * Math.PI) / 180);
    if (item.kind === "text") drawTextLines(ctx, item);
    else if (el.type === "image") {
      const img = sources.images.get((el as ImageElement).assetId);
      if (img) {
        ctx.globalAlpha *= el.opacity;
        ctx.drawImage(img, 0, 0, el.width, el.height);
      }
    } else drawShape(ctx, el as ShapeElement);
    ctx.restore();
  }
  ctx.restore();
}

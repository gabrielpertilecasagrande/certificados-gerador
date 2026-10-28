import {
  PDFDocument,
  type PDFEmbeddedPage,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  clip,
  concatTransformationMatrix,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setCharacterSpacing,
} from "pdf-lib";
import type { Background, ImageElement, ShapeElement, Template } from "@/lib/model/types";
import { fontkit, type FontStore } from "@/lib/render/fonts";
import { backgroundRect, parseHexColor } from "@/lib/render/geometry";
import type { ResolvedCertificate, ResolvedText } from "@/lib/render/resolve";

export interface AssetBytes {
  bytes: Uint8Array;
  mime: string;
}

export type AssetSource = (assetId: string) => Promise<AssetBytes>;

interface DocCache {
  fonts: Map<string, PDFFont>;
  images: Map<string, PDFImage>;
  pages: Map<string, PDFEmbeddedPage>;
}

/** Posiciona uma página com /Rotate para que ocupe `box` na orientação em que é exibida. */
function rotatedBox(box: { x: number; y: number; width: number; height: number }, rotation: number) {
  const { x, y, width: w, height: h } = box;
  switch (rotation) {
    case 90:
      return { x, y: y + h, width: h, height: w, rotate: degrees(-90) };
    case 180:
      return { x: x + w, y: y + h, width: w, height: h, rotate: degrees(180) };
    case 270:
      return { x: x + w, y, width: h, height: w, rotate: degrees(90) };
    default:
      return box;
  }
}

const toRgb = (hex: string | null | undefined) => {
  const c = parseHexColor(hex);
  return c ? rgb(c.r, c.g, c.b) : undefined;
};

/**
 * Compõe certificados em PDF. O fundo em PDF é incorporado como página vetorial (embedPage),
 * sem rasterização; textos usam as mesmas fontes TTF do editor, embutidas com subset.
 */
export class PdfComposer {
  private caches = new WeakMap<PDFDocument, DocCache>();
  private sourcePdfs = new Map<string, Promise<PDFDocument>>();
  private assetBytes = new Map<string, Promise<AssetBytes>>();

  constructor(
    private readonly fonts: FontStore,
    private readonly assets: AssetSource,
  ) {}

  async createDocument(title?: string): Promise<PDFDocument> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setProducer("Estúdio de Certificados");
    doc.setCreator("Estúdio de Certificados");
    if (title) doc.setTitle(title);
    this.caches.set(doc, { fonts: new Map(), images: new Map(), pages: new Map() });
    return doc;
  }

  private cache(doc: PDFDocument): DocCache {
    const c = this.caches.get(doc);
    if (!c) throw new Error("Documento não criado pelo PdfComposer");
    return c;
  }

  private getAsset(id: string): Promise<AssetBytes> {
    let p = this.assetBytes.get(id);
    if (!p) {
      p = this.assets(id);
      this.assetBytes.set(id, p);
    }
    return p;
  }

  private async font(doc: PDFDocument, file: string): Promise<PDFFont> {
    const c = this.cache(doc);
    let f = c.fonts.get(file);
    if (!f) {
      f = await doc.embedFont(this.fonts.getBytes(file), { subset: true });
      c.fonts.set(file, f);
    }
    return f;
  }

  private async image(doc: PDFDocument, assetId: string): Promise<PDFImage> {
    const c = this.cache(doc);
    let img = c.images.get(assetId);
    if (!img) {
      const { bytes, mime } = await this.getAsset(assetId);
      img = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      c.images.set(assetId, img);
    }
    return img;
  }

  private async backgroundPage(doc: PDFDocument, bg: Background): Promise<{ page: PDFEmbeddedPage; rotation: number }> {
    const c = this.cache(doc);
    const key = `${bg.assetId}#${bg.pdfPage}`;
    let src = this.sourcePdfs.get(bg.assetId);
    if (!src) {
      src = this.getAsset(bg.assetId).then(({ bytes }) => PDFDocument.load(bytes, { ignoreEncryption: true }));
      this.sourcePdfs.set(bg.assetId, src);
    }
    const source = await src;
    const srcPage = source.getPage(Math.min(Math.max(bg.pdfPage, 1), source.getPageCount()) - 1);
    const rotation = ((srcPage.getRotation().angle % 360) + 360) % 360;
    let embedded = c.pages.get(key);
    if (!embedded) {
      // Usa a CropBox (área visível), como os leitores de PDF e o pdf.js.
      const box = srcPage.getCropBox();
      embedded = await doc.embedPage(srcPage, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
      c.pages.set(key, embedded);
    }
    return { page: embedded, rotation };
  }

  async addCertificate(doc: PDFDocument, cert: ResolvedCertificate): Promise<PDFPage> {
    const { template } = cert;
    const W = template.page.widthPt;
    const H = template.page.heightPt;
    const page = doc.addPage([W, H]);

    if (template.background?.visible) await this.drawBackground(doc, page, template);

    for (const item of cert.items) {
      const el = item.el;
      // Transformação local: origem no canto superior esquerdo do elemento, eixo Y para cima,
      // rotação horária (mesma convenção do canvas/Konva).
      const rad = (el.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(cos, -sin, sin, cos, el.x, H - el.y));
      if (item.kind === "text") await this.drawText(doc, page, item);
      else if (item.el.type === "image") await this.drawImage(doc, page, item.el);
      else this.drawShape(page, item.el as ShapeElement);
      page.pushOperators(popGraphicsState());
    }
    return page;
  }

  private async drawBackground(doc: PDFDocument, page: PDFPage, template: Template) {
    const bg = template.background!;
    const H = template.page.heightPt;
    const r = backgroundRect(bg, template.page);
    const box = { x: r.x, y: H - r.y - r.height, width: r.width, height: r.height };
    page.pushOperators(pushGraphicsState(), rectangle(0, 0, template.page.widthPt, H), clip(), endPath());
    if (bg.kind === "pdf") {
      const { page: embedded, rotation } = await this.backgroundPage(doc, bg);
      page.drawPage(embedded, rotatedBox(box, rotation));
    }
    else page.drawImage(await this.image(doc, bg.assetId), box);
    page.pushOperators(popGraphicsState());
  }

  private async drawText(doc: PDFDocument, page: PDFPage, item: ResolvedText) {
    const { el, layout } = item;
    const font = await this.font(doc, item.fontFile);
    const color = toRgb(el.color) ?? rgb(0, 0, 0);
    if (el.letterSpacing) page.pushOperators(setCharacterSpacing(el.letterSpacing));
    for (const line of layout.lines) {
      if (!line.text) continue;
      page.drawText(line.text, {
        x: line.x,
        y: -line.baseline,
        size: layout.fontSize,
        font,
        color,
        opacity: el.opacity,
      });
    }
    if (el.letterSpacing) page.pushOperators(setCharacterSpacing(0));
  }

  private async drawImage(doc: PDFDocument, page: PDFPage, el: ImageElement) {
    const img = await this.image(doc, el.assetId);
    page.drawImage(img, { x: 0, y: -el.height, width: el.width, height: el.height, opacity: el.opacity });
  }

  private drawShape(page: PDFPage, el: ShapeElement) {
    const fill = toRgb(el.fill);
    const stroke = toRgb(el.stroke);
    const borderWidth = stroke ? el.strokeWidth : 0;
    if (el.type === "line") {
      page.drawLine({
        start: { x: 0, y: -el.height / 2 },
        end: { x: el.width, y: -el.height / 2 },
        thickness: el.strokeWidth,
        color: stroke ?? rgb(0, 0, 0),
        opacity: el.opacity,
      });
    } else if (el.type === "ellipse") {
      page.drawEllipse({
        x: el.width / 2,
        y: -el.height / 2,
        xScale: el.width / 2,
        yScale: el.height / 2,
        color: fill,
        borderColor: stroke,
        borderWidth,
        opacity: el.opacity,
        borderOpacity: el.opacity,
      });
    } else if (el.cornerRadius > 0) {
      const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2);
      const w = el.width;
      const h = el.height;
      // drawSvgPath usa Y para baixo a partir de (x, y).
      const path = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
      page.drawSvgPath(path, { x: 0, y: 0, color: fill, borderColor: stroke, borderWidth, opacity: el.opacity, borderOpacity: el.opacity });
    } else {
      page.drawRectangle({
        x: 0,
        y: -el.height,
        width: el.width,
        height: el.height,
        color: fill,
        borderColor: stroke,
        borderWidth,
        opacity: el.opacity,
        borderOpacity: el.opacity,
      });
    }
  }
}

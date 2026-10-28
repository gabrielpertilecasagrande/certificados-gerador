import { PDFDocument } from "pdf-lib";
import { detectFileKind, MAX_UPLOAD_BYTES, MIME } from "./files";

export interface PreparedArtwork {
  kind: "pdf" | "image";
  blob: Blob;
  mime: string;
  /** Para PDF: dimensões de cada página (pt). Para imagem: uma entrada. */
  pages: { widthPt: number; heightPt: number }[];
  pixelWidth?: number;
  pixelHeight?: number;
}

/** Lado máximo, em pixels, ao converter SVG/WEBP para PNG (≈ A4 a 300 DPI). */
const MAX_RASTER_SIDE = 3508;

async function rasterizeToPng(blob: Blob, isSvg: boolean): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    let w = img.naturalWidth || 1000;
    let h = img.naturalHeight || 700;
    // SVG é vetorial: rasteriza em alta resolução.
    const scale = isSvg ? MAX_RASTER_SIDE / Math.max(w, h) : Math.min(1, MAX_RASTER_SIDE * 2 / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao converter imagem"))), "image/png"));
    return { blob: png, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

/** Valida e prepara uma arte (PDF ou imagem) para uso como fundo ou elemento. */
export async function prepareArtwork(file: Blob): Promise<PreparedArtwork> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Arquivo maior que 60 MB");
  const kind = await detectFileKind(file);
  switch (kind) {
    case "pdf": {
      let doc: PDFDocument;
      try {
        doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      } catch {
        throw new Error("Não foi possível ler este PDF");
      }
      if (doc.isEncrypted) {
        throw new Error("Este PDF está protegido (criptografado) e não pode ser usado como fundo. Remova a proteção ou exporte a arte como PNG/JPG.");
      }
      const pages = doc.getPages().map((p) => {
        const { width, height } = p.getCropBox();
        const rot = p.getRotation().angle % 180 !== 0;
        return rot ? { widthPt: height, heightPt: width } : { widthPt: width, heightPt: height };
      });
      if (pages.length === 0) throw new Error("PDF sem páginas");
      return { kind: "pdf", blob: new Blob([await file.arrayBuffer()], { type: MIME.pdf }), mime: MIME.pdf, pages };
    }
    case "png":
    case "jpg": {
      const { width, height } = await imageSize(file);
      const mime = MIME[kind];
      return {
        kind: "image",
        blob: new Blob([await file.arrayBuffer()], { type: mime }),
        mime,
        pages: [{ widthPt: width * 0.75, heightPt: height * 0.75 }],
        pixelWidth: width,
        pixelHeight: height,
      };
    }
    case "webp":
    case "svg": {
      const r = await rasterizeToPng(file, kind === "svg");
      return {
        kind: "image",
        blob: r.blob,
        mime: "image/png",
        pages: [{ widthPt: r.width * 0.75, heightPt: r.height * 0.75 }],
        pixelWidth: r.width,
        pixelHeight: r.height,
      };
    }
    default:
      throw new Error("Formato não suportado. Use PDF, PNG, JPG, WEBP ou SVG.");
  }
}

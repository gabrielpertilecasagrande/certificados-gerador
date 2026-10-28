/** Identificação de arquivos pelo conteúdo (assinatura), não pela extensão. */
export type DetectedKind = "pdf" | "png" | "jpg" | "webp" | "svg" | "unknown";

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export async function detectFileKind(blob: Blob): Promise<DetectedKind> {
  const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
  const ascii = String.fromCharCode(...head.slice(0, 16));
  if (ascii.startsWith("%PDF")) return "pdf";
  if (head[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  const text = new TextDecoder().decode(head).trimStart().toLowerCase();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return "svg";
  return "unknown";
}

export const MIME: Record<Exclude<DetectedKind, "unknown">, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

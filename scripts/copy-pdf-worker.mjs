// Copia o worker do pdf.js para /public (servido pelo próprio app, sem CDN externo).
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
await mkdir("public/pdfjs", { recursive: true });
await copyFile(src, "public/pdfjs/pdf.worker.min.mjs");

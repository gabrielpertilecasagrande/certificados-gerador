/**
 * Gera arquivos de teste: artes (PDF horizontal/vertical, PNG, JPG), planilhas (CSV, XLSX).
 * Uso: npx tsx tests/fixtures/make-fixtures.ts  (também chamado pelos testes e2e)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const FIXTURE_DIR = path.resolve("tests/fixtures/generated");

export const NAMES = [
  "Maria Silva",
  "João Oliveira",
  "Ana Carolina Pereira de Oliveira Machado",
  "José Antônio Conceição",
  "Zé",
  "Luíza Brandão Ávila",
  "Francisco de Assis Gonçalves Júnior",
  "Çédric Müller",
  "Beatriz Nóbrega",
  "Pedro Henrique Albuquerque Cavalcanti de Souza Figueiredo",
];

async function certificatePdf(width: number, height: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.98, 0.97, 0.94) });
  page.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, borderColor: rgb(0.12, 0.25, 0.55), borderWidth: 6 });
  page.drawRectangle({ x: 30, y: 30, width: width - 60, height: height - 60, borderColor: rgb(0.75, 0.6, 0.25), borderWidth: 1.5 });
  const title = "CERTIFICADO";
  page.drawText(title, { x: (width - bold.widthOfTextAtSize(title, 42)) / 2, y: height - 120, size: 42, font: bold, color: rgb(0.12, 0.25, 0.55) });
  const sub = "Certificamos que";
  page.drawText(sub, { x: (width - font.widthOfTextAtSize(sub, 16)) / 2, y: height - 175, size: 16, font, color: rgb(0.3, 0.3, 0.3) });
  page.drawLine({ start: { x: width * 0.2, y: height / 2 - 30 }, end: { x: width * 0.8, y: height / 2 - 30 }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
  return doc.save();
}

function col(n: number) {
  let s = "";
  n++;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** XLSX mínimo (inline strings) — suficiente para testar a importação. */
export function makeXlsx(rows: string[][]): Uint8Array {
  const sheetRows = rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join("")}</row>`)
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Participantes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  });
}

export function participantRows(n: number): string[][] {
  return [["Nome", "Empresa", "Carga horária", "Categoria"], ...Array.from({ length: n }, (_, i) => [`${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${i + 1}` : ""}`, `Empresa ${String.fromCharCode(65 + (i % 5))}`, i % 3 ? "8" : "12", i % 4 ? "Participante" : "Palestrante"])];
}

export async function makeFixtures() {
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(path.join(FIXTURE_DIR, "arte-horizontal.pdf"), await certificatePdf(841.89, 595.28));
  await writeFile(path.join(FIXTURE_DIR, "arte-vertical.pdf"), await certificatePdf(595.28, 841.89));
  for (const n of [10, 100, 1000]) {
    const rows = participantRows(n);
    await writeFile(path.join(FIXTURE_DIR, `participantes-${n}.csv`), rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n"));
  }
  await writeFile(path.join(FIXTURE_DIR, "participantes-10.xlsx"), makeXlsx(participantRows(10)));
}

if (process.argv[1]?.endsWith("make-fixtures.ts")) {
  makeFixtures().then(() => console.log("fixtures em", FIXTURE_DIR));
}

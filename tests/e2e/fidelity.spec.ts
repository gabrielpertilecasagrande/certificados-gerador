import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { addNameField, createProject, importParticipants, login } from "./helpers";

/** Caixa delimitadora dos pixels escuros (texto) numa imagem RGBA. */
function darkBox(data: Uint8ClampedArray | Uint8Array, width: number, height: number, region: { y0: number; y1: number }) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = region.y0; y < region.y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 110) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

const hasPdftoppm = (() => {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("pré-visualização e PDF exportado posicionam o nome de forma idêntica", async ({ page }) => {
  test.skip(!hasPdftoppm, "pdftoppm (poppler) não instalado");
  await login(page);
  await createProject(page, "Fidelidade", "arte-horizontal.pdf");
  await addNameField(page);
  await importParticipants(page, "participantes-10.csv", 10);

  // Renderiza o certificado 10 (nome longo, reduzido) com o mesmo código da pré-visualização, a 1 px/pt.
  await page.getByRole("tab", { name: "Pré-visualização" }).click();
  for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Próximo certificado" }).click();
  await expect(page.getByTestId("participant-position")).toHaveText("10 de 10");

  await page.getByRole("tab", { name: "Exportação" }).click();
  await page.getByLabel("Certificados a exportar").selectOption("all");
  const dl = page.waitForEvent("download");
  await page.getByTestId("start-export").click();
  const zipPath = (await (await dl).path())!;
  const dir = await mkdtemp(path.join(tmpdir(), "fid-"));
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(new Uint8Array(await readFile(zipPath)));
  const pdfName = Object.keys(entries).find((n) => n.includes("Pedro Henrique"))!;
  await writeFile(path.join(dir, "c.pdf"), entries[pdfName]);
  // 72 DPI → 1 px por pt (842 × 595).
  execFileSync("pdftoppm", ["-r", "72", "-png", "-singlefile", path.join(dir, "c.pdf"), path.join(dir, "pdf")]);
  const pdfPng = await readFile(path.join(dir, "pdf.png"));

  // Decodifica o PNG do PDF e renderiza a pré-visualização no navegador, na mesma escala.
  await page.getByRole("tab", { name: "Pré-visualização" }).click();
  const result = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c1 = document.createElement("canvas");
    c1.width = img.width;
    c1.height = img.height;
    const x1 = c1.getContext("2d")!;
    x1.drawImage(img, 0, 0);
    const pdf = x1.getImageData(0, 0, c1.width, c1.height);
    const preview = document.querySelector<HTMLCanvasElement>("main canvas, [data-testid] canvas, canvas")!;
    const c2 = document.createElement("canvas");
    c2.width = img.width;
    c2.height = img.height;
    const x2 = c2.getContext("2d")!;
    x2.drawImage(preview, 0, 0, c2.width, c2.height);
    const pv = x2.getImageData(0, 0, c2.width, c2.height);
    return { w: img.width, h: img.height, pdf: Array.from(pdf.data), pv: Array.from(pv.data) };
  }, pdfPng.toString("base64"));

  const region = { y0: Math.round(result.h * 0.35), y1: Math.round(result.h * 0.6) };
  const a = darkBox(new Uint8Array(result.pdf), result.w, result.h, region);
  const b = darkBox(new Uint8Array(result.pv), result.w, result.h, region);
  console.log("PDF", a, "pré-visualização", b);
  for (const k of ["minX", "maxX", "minY", "maxY"] as const) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(3);
});

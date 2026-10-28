import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { FIXTURE_DIR, makeFixtures } from "../fixtures/make-fixtures";

/** Gera planilhas/PDFs e, com o navegador, artes PNG e JPG. */
export default async function globalSetup() {
  await makeFixtures();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const images = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1754;
    c.height = 1240;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fdf8ec";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#7c2d12";
    ctx.lineWidth = 24;
    ctx.strokeRect(40, 40, c.width - 80, c.height - 80);
    ctx.fillStyle = "#7c2d12";
    ctx.font = "bold 110px serif";
    ctx.textAlign = "center";
    ctx.fillText("CERTIFICADO", c.width / 2, 260);
    return { png: c.toDataURL("image/png"), jpg: c.toDataURL("image/jpeg", 0.9) };
  });
  await writeFile(path.join(FIXTURE_DIR, "arte.png"), Buffer.from(images.png.split(",")[1], "base64"));
  await writeFile(path.join(FIXTURE_DIR, "arte.jpg"), Buffer.from(images.jpg.split(",")[1], "base64"));
  await browser.close();
}

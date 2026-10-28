import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { addNameField, createProject, importParticipants, login } from "./helpers";

test("1.000 participantes: importação, tabela e exportação ZIP", async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  await createProject(page, "Volume 1000", "arte-horizontal.pdf");
  await addNameField(page);
  await importParticipants(page, "participantes-1000.csv", 1000);
  // Tabela virtualizada: só uma fração das linhas existe no DOM.
  const rendered = await page.getByTestId("participants-grid").locator("[data-row]").count();
  expect(rendered).toBeLessThan(100);
  await page.getByLabel("Buscar participantes").fill("Zé 995");
  await expect(page.getByTestId("participants-grid").locator("[data-row]")).toHaveCount(1);
  await page.getByLabel("Buscar participantes").fill("");

  await page.getByRole("tab", { name: "Exportação" }).click();
  const t0 = Date.now();
  const dl = page.waitForEvent("download", { timeout: 540_000 });
  await page.getByTestId("start-export").click();
  const entries = unzipSync(new Uint8Array(await readFile((await (await dl).path())!)));
  const seconds = (Date.now() - t0) / 1000;
  expect(Object.keys(entries)).toHaveLength(1000);
  console.log(`1.000 PDFs em ${seconds.toFixed(1)} s`);
});

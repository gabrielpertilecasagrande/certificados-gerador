import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { FIXTURE_DIR } from "../fixtures/make-fixtures";

export const fixture = (name: string) => path.join(FIXTURE_DIR, name);
export const PASSWORD = "senha-e2e";

export async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === "/");
}

export async function createProject(page: Page, name: string, artwork?: string) {
  await page.getByRole("button", { name: "Novo projeto" }).click();
  await page.fill("#project-name", name);
  if (artwork) {
    await page.setInputFiles("[data-testid=artwork-input]", fixture(artwork));
    await expect(page.getByText(path.basename(artwork))).toBeVisible();
    await page.fill("#project-name", name);
  }
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await page.waitForURL(/\/projects\//);
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
}

export async function addNameField(page: Page) {
  await page.getByTestId("variable-list").getByText("Nome completo").click();
  await expect(page.getByTestId("text-content")).toHaveValue("{{nome}}");
}

export async function importParticipants(page: Page, file: string, count: number) {
  await page.getByRole("tab", { name: "Participantes" }).click();
  const importBtn = page.getByRole("button", { name: /^Importar/ }).first();
  await importBtn.click();
  await page.setInputFiles("[data-testid=spreadsheet-input]", fixture(file));
  await page.getByTestId("confirm-import").click();
  await expect(page.getByRole("radio", { name: new RegExp(`Todos ${count.toLocaleString("pt-BR")}`) })).toBeVisible();
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
}

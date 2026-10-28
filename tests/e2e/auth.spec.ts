import { expect, test } from "@playwright/test";
import { PASSWORD } from "./helpers";

test.describe("acesso", () => {
  test("redireciona para o login sem sessão", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/projects/qualquer");
    await expect(page).toHaveURL(/\/login\?next=%2Fprojects%2Fqualquer/);
  });

  test("APIs exigem autenticação", async ({ request }) => {
    const res = await request.get("/api/qualquer");
    expect(res.status()).toBe(401);
  });

  test("senha incorreta é recusada e tentativas são limitadas", async ({ request }) => {
    const headers = { "x-forwarded-for": "203.0.113.77" };
    for (let i = 0; i < 5; i++) {
      const r = await request.post("/api/auth/login", { data: { password: "errada" }, headers });
      expect(r.status()).toBe(401);
    }
    const blocked = await request.post("/api/auth/login", { data: { password: PASSWORD }, headers });
    expect(blocked.status()).toBe(429);
  });

  test("login cria cookie HttpOnly e logout encerra a sessão", async ({ page, context }) => {
    await page.goto("/login");
    await page.fill("#password", "errada");
    await page.click("button[type=submit]");
    await expect(page.getByText("Senha incorreta")).toBeVisible();
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname === "/");
    const cookie = (await context.cookies()).find((c) => c.name === "cert_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("cert_session");
    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForURL(/\/login/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("token adulterado não dá acesso", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "cert_session", value: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.assinatura-falsa", url: baseURL! }]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});

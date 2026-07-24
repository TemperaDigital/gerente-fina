/**
 * Fluxos públicos (GF-007) — não usam storageState (contexto sem sessão),
 * ver playwright.config.ts (projeto "public").
 */
import { test, expect } from "playwright/test";

test("tela de login carrega sem erros de console", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Seja bem-vindo" })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  expect(consoleErrors, `Erros de console: ${consoleErrors.join("; ")}`).toEqual([]);
});

test("rota protegida sem sessão redireciona pro login", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Seja bem-vindo" })).toBeVisible();
});

test("login com credenciais erradas mostra erro claro", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="email"]').fill("nao-existe-e2e@example.com");
  await page.locator('input[type="password"]').fill("senha-errada-de-proposito");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText(/falha no login/i)).toBeVisible({ timeout: 10_000 });
});

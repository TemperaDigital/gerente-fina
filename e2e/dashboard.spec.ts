/**
 * Fluxo crítico: dashboard autenticado (GF-007). Usa a sessão salva por
 * e2e/auth.setup.ts (storageState — ver playwright.config.ts).
 */
import { test, expect } from "playwright/test";

test("dashboard carrega com KPIs para o usuário autenticado", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
  // Cards de KPI (Receitas/Despesas/Saldo) — presença confirma que os dados
  // carregaram via server function sem erro, não só que a rota renderizou.
  await expect(page.getByText(/receitas/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/despesas/i).first()).toBeVisible();

  expect(consoleErrors, `Erros de console: ${consoleErrors.join("; ")}`).toEqual([]);
});

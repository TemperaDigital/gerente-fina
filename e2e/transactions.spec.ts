/**
 * Fluxo crítico: Livro-Caixa autenticado (GF-007).
 */
import { test, expect } from "playwright/test";

test("Livro-Caixa carrega a lista de lançamentos (com ou sem dados)", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/transactions");

  await expect(page.getByRole("heading", { name: "Livro-Caixa" })).toBeVisible();
  // O rodapé de paginação ("N lançamento(s) · página X de Y") sempre
  // renderiza, tenha a conta de teste dados ou não — sinal confiável de que
  // a lista TERMINOU de carregar (não ficou presa no skeleton por erro de
  // server function), sem depender do estado vazio/preenchido específico.
  await expect(page.getByText(/lançamentos? · página \d+ de \d+/)).toBeVisible({
    timeout: 15_000,
  });

  expect(consoleErrors, `Erros de console: ${consoleErrors.join("; ")}`).toEqual([]);
});

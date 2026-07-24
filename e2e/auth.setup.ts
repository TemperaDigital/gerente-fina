/**
 * Setup de autenticação da suíte E2E (GF-007) — loga UMA vez com a conta de
 * teste dedicada (E2E_TEST_EMAIL/E2E_TEST_PASSWORD, ver .env) e salva a
 * sessão em e2e/.auth/user.json. Os specs autenticados reaproveitam esse
 * storageState (ver playwright.config.ts) em vez de logar a cada teste.
 *
 * A conta de teste tem 1 conta bancária ("Conta E2E") e 2 categorias
 * (Despesas E2E / Receitas E2E) seedadas direto no banco — sem isso, o modal
 * de onboarding ("Bem-vindo ao Gerente FINA") aparece em toda navegação e
 * bloqueia a tela, já que a conta nova não tem nada cadastrado ainda.
 */
import { test as setup, expect } from "playwright/test";

const authFile = "e2e/.auth/user.json";

setup("autentica com a conta de teste dedicada", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL/E2E_TEST_PASSWORD ausentes — configure o .env local antes de rodar a suíte E2E.",
    );
  }

  await page.goto("/");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible({
    timeout: 15_000,
  });

  await page.context().storageState({ path: authFile });
});

/**
 * Config da suíte E2E (GF-007). Roda contra o `vite dev` local (mesmo
 * backend Supabase real de produção — a conta de teste dedicada,
 * `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` em `.env`, fica isolada dos dados
 * financeiros reais via RLS/user_id, igual a qualquer outro usuário do app).
 *
 * Autenticação: um projeto "setup" (e2e/auth.setup.ts) loga uma vez e salva
 * o storageState em e2e/.auth/user.json (gitignored); os projetos de teste
 * autenticados reaproveitam esse estado em vez de logar a cada teste.
 */
import { defineConfig, devices } from "playwright/test";

process.loadEnvFile(".env");

const PORT = 8080;
const baseURL = `http://localhost:${PORT}`;
const authFile = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "setup", testMatch: "auth.setup.ts" },
    {
      name: "public",
      testMatch: "public.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated",
      testMatch: "*.spec.ts",
      testIgnore: "public.spec.ts",
      use: { ...devices["Desktop Chrome"], storageState: authFile },
      dependencies: ["setup"],
    },
  ],
});

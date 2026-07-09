/**
 * Regressão de isolamento entre usuários (Missão 29/30 — auditoria IDOR).
 *
 * `accountBelongsToUser` é o guardião reaproveitado por praticamente todo
 * write path sensível (createTransactionEntry, convertTransactionEntry,
 * updateTransactionEntry, import.functions.ts, scheduled-items, chat) para
 * impedir que um id de conta escolhido pelo cliente aponte para o dado de
 * OUTRO usuário. Este teste simula um Supabase client mínimo que realmente
 * aplica os filtros `.eq()/.is()` contra um dataset com contas de dois
 * usuários diferentes — não apenas mocka a resposta — para provar que uma
 * futura remoção acidental do filtro `user_id` (a causa raiz de todos os
 * bugs já corrigidos nesta auditoria) quebra o teste.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountBelongsToUser } from "./active-account.server";

interface FakeAccountRow {
  id: string;
  user_id: string;
  archived_at: string | null;
}

/** Supabase client mínimo cujo `.eq()/.is()` filtram de verdade um dataset em memória. */
function makeFakeSupabase(rows: FakeAccountRow[]): SupabaseClient {
  const client = {
    from(_table: string) {
      const filters: Array<{ col: string; val: unknown }> = [];
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return builder;
        },
        is(col: string, val: unknown) {
          filters.push({ col, val });
          return builder;
        },
        async maybeSingle() {
          const match = rows.find((row) =>
            filters.every((f) => (row as unknown as Record<string, unknown>)[f.col] === f.val),
          );
          return { data: match ? { id: match.id } : null, error: null };
        },
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

describe("accountBelongsToUser", () => {
  const rows: FakeAccountRow[] = [
    { id: "acc-a", user_id: "user-a", archived_at: null },
    { id: "acc-b", user_id: "user-b", archived_at: null },
    { id: "acc-a-archived", user_id: "user-a", archived_at: "2026-01-01T00:00:00Z" },
  ];

  it("retorna true quando a conta pertence ao usuário ativo", async () => {
    const sb = makeFakeSupabase(rows);
    expect(await accountBelongsToUser(sb, "user-a", "acc-a")).toBe(true);
  });

  it("retorna false quando o id pertence a OUTRO usuário — blindagem central de IDOR", async () => {
    const sb = makeFakeSupabase(rows);
    expect(await accountBelongsToUser(sb, "user-b", "acc-a")).toBe(false);
    expect(await accountBelongsToUser(sb, "user-a", "acc-b")).toBe(false);
  });

  it("retorna false para conta inexistente", async () => {
    const sb = makeFakeSupabase(rows);
    expect(await accountBelongsToUser(sb, "user-a", "acc-inexistente")).toBe(false);
  });

  it("retorna false para conta arquivada, mesmo pertencendo ao usuário", async () => {
    const sb = makeFakeSupabase(rows);
    expect(await accountBelongsToUser(sb, "user-a", "acc-a-archived")).toBe(false);
  });
});

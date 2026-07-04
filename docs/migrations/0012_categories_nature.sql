-- =============================================================================
-- Migration 0012 — Natureza da Categoria (Fixa/Variável)
-- Projeto: Gerente Fina
-- =============================================================================
-- Constituição aplicada:
--   §3  Nova dimensão de classificação para categorias, ortogonal a `kind`
--       (income/expense): `nature` indica se o gasto/receita costuma ser
--       recorrente e previsível (FIXA) ou sujeito a variação mês a mês
--       (VARIÁVEL). Usado em buscas, relatórios e filtros de fluxo de caixa.
--   §4  Nullable — categorias já existentes (criadas manualmente antes desta
--       migration) continuam válidas sem quebrar; a UI passa a exigir a
--       escolha em categorias NOVAS, mas não força backfill retroativo.
-- =============================================================================

create type public.category_nature as enum ('FIXA', 'VARIÁVEL');

alter table public.categories
  add column nature public.category_nature;

comment on column public.categories.nature is
  'Classificação de fluxo de caixa: FIXA (recorrente/previsível) ou VARIÁVEL (sujeita a variação). Nullable por compatibilidade com categorias pré-existentes.';

-- =============================================================================
-- FIM Migration 0012
-- =============================================================================

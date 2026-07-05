-- =============================================================================
-- Migration 0016 — Ocorrência única ("uma vez só") em recorrências (Missão 7)
--
-- Adiciona 'once' ao enum recurrence_frequency existente (migration 0003).
-- ALTER TYPE ... ADD VALUE não pode ser usado na MESMA transação em que o
-- valor é referenciado — por isso este arquivo contém SÓ este comando,
-- sem mais nada, para rodar isolado no SQL editor do Supabase.
-- =============================================================================

alter type public.recurrence_frequency add value 'once';

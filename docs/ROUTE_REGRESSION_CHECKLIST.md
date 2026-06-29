# Checklist de Depuração de Rotas (TanStack Router)

Use sempre que **deletar, renomear ou mover** um arquivo em `src/routes/`.
Sintoma típico de regressão: URL nova, mas a tela renderiza o componente antigo
(routeTree.gen.ts dessincronizado).

## 1. Inventário físico
- [ ] `ls src/routes/ | grep <prefixo>` confirma que os arquivos antigos sumiram.
- [ ] Nenhum arquivo "irmão" colide (ex.: não pode coexistir `transactions.tsx`
      como layout pai **e** `transactions.index.tsx` — escolha um).
- [ ] Convenção do projeto: **flat dot-separated**. Não misturar com pastas.

## 2. Regeneração do mapa
- [ ] `rm -f src/routeTree.gen.ts` — o plugin do TanStack regera no próximo boot.
- [ ] Reiniciar dev server (`code--restart_dev_server`) — não basta HMR.
- [ ] `grep <rota> src/routeTree.gen.ts` confirma o import correto
      (ex.: `./routes/transactions.new`, **não** `./routes/transactions`).

## 3. Validação runtime
- [ ] Abrir a URL alvo e checar `<h1>` esperado.
- [ ] Garantir ausência de texto pertencente ao componente antigo.
- [ ] `pageerror` listener limpo (sem erros de import / rota duplicada).
- [ ] Typecheck (`tsgo --noEmit`) limpo.

## 4. Armadilhas conhecidas
- **`createFileRoute("/x")` vs filename**: a string deve refletir o ID gerado.
  `transactions.index.tsx` ⇒ `createFileRoute("/transactions/")`.
- **Layout sem `<Outlet />`**: parent route some os filhos silenciosamente.
- **Editar `routeTree.gen.ts` à mão**: nunca. É auto-gerado.
- **HMR enganoso**: após deletar arquivo via GitHub/externo, sempre restart.

## Comando de smoke test rápido
```bash
rm -f src/routeTree.gen.ts
# restart dev server
grep -E "<rota>" src/routeTree.gen.ts
```

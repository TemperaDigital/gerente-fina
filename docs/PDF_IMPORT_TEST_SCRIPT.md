# Roteiro de teste manual — Importação de PDF (Fase C do Importador Universal)

Este roteiro valida a extração de lançamentos via IA a partir de PDFs reais
(extratos e faturas), algo que só pode ser testado de verdade no ambiente da
Lovable (onde `LOVABLE_API_KEY` existe). Rode isto no preview antes de
considerar a Fase C definitivamente pronta.

## Preparação

1. Separe (ou gere) até 3 arquivos PDF de teste:
   - **(A) Sem proteção** — um extrato ou fatura comum, sem senha nenhuma.
   - **(B) Com owner password** — um PDF que só restringe impressão/cópia,
     mas abre sem pedir senha em qualquer leitor comum. Muitos PDFs
     exportados de internet banking já vêm assim.
   - **(C) Com user password** — um PDF que EXIGE senha para abrir (ex.:
     extratos da Caixa Econômica Federal, que pedem os dígitos do CPF).
2. Coloque os arquivos em `test-fixtures/` na raiz do projeto (a pasta já
   está no `.gitignore` — **nunca** commite esses arquivos, eles contêm
   dados financeiros reais).
3. Tenha à mão a senha correta do arquivo (C), se você mesmo criou o teste.

## Cenário A — PDF sem proteção

1. Abra `/import`.
2. Selecione a conta ou cartão de destino compatível com o arquivo.
3. Faça upload do PDF (A) pela mesma área de upload do CSV (aceita `.pdf`
   agora).
4. **Esperado:**
   - Toast "Processando lançamentos com IA..." aparece e some.
   - A tabela de pré-visualização aparece com as linhas do PDF, cada uma já
     com data, descrição, categoria sugerida e confiança — igual ao fluxo
     de CSV.
   - Se o PDF cruzar virada de ano (ex.: fatura vencendo em janeiro com
     compras em dezembro), confirme que as datas de dezembro aparecem com o
     ano ANTERIOR ao da data de janeiro.
   - Nenhum prompt de senha aparece.

## Cenário B — PDF com owner password apenas

1. Repita os passos do Cenário A trocando o arquivo por (B).
2. **Esperado:** comportamento IDÊNTICO ao Cenário A — o arquivo deve abrir
   de forma totalmente transparente, sem nenhum prompt ou aviso extra. Este
   é o caso "silencioso": se aparecer qualquer prompt de senha aqui, é bug.

## Cenário C — PDF com user password (ex.: estilo CEF)

1. Repita os passos iniciais do Cenário A trocando o arquivo por (C).
2. **Esperado (1ª tentativa, sem digitar nada ainda):**
   - Em vez da tabela de pré-visualização, aparece um card âmbar
     "PDF protegido por senha" com o nome do arquivo e um campo de senha.
   - Nenhum erro técnico genérico deve aparecer — a mensagem deve ser
     claramente "exige uma senha para ser aberto".
3. Digite uma senha ERRADA de propósito e clique em "Tentar novamente".
   **Esperado:**
   - Toast de erro "Senha incorreta. Tente novamente."
   - O card de senha continua visível, agora com a mensagem
     "Senha incorreta — tente novamente."
   - O campo de senha deve estar VAZIO novamente (a senha errada não fica
     visível/preenchida — ela nunca é reaproveitada automaticamente).
4. Digite a senha CORRETA e clique em "Tentar novamente".
   **Esperado:**
   - O card de senha desaparece.
   - A tabela de pré-visualização aparece normalmente, como no Cenário A.
5. **Verificação de segurança (importante):** abra o DevTools do navegador
   antes de repetir o passo 3-4 e confirme que a senha digitada:
   - Não aparece em nenhum `console.log`.
   - Não aparece em nenhuma requisição de rede além do POST para
     `extractPdfStatement` (aba Network) — e não deve continuar aparecendo
     em requisições SUBSEQUENTES depois que a extração termina.
   - Não fica salva em `localStorage`/`sessionStorage` (inspecione na aba
     Application).

## Cenário D — Falhas devem ser claras, nunca silenciosas ou genéricas

Teste pelo menos um destes casos e confirme que a mensagem exibida é
específica (não um genérico "Erro" ou "Something went wrong"):

1. **Arquivo corrompido:** renomeie um arquivo `.txt` qualquer para `.pdf` e
   tente importar. Esperado: mensagem indicando falha ao ler o PDF.
2. **PDF escaneado (imagem, sem texto):** se tiver um PDF que é só uma foto
   escaneada, tente importar. Esperado: mensagem específica sobre não
   conseguir extrair texto (sugestão de que é uma imagem sem camada de
   texto), não um erro genérico.
3. **Créditos/limite da IA:** se possível, force um cenário de limite
   atingido. Esperado: mensagem específica sobre limite de requisições ou
   créditos esgotados, não um erro de rede genérico.

## O que reportar de volta

Para cada cenário, informe:
- Passou ou falhou.
- Se falhou: a mensagem exata exibida na tela (toast) e, se possível, o erro
  no console do navegador.
- Para o Cenário A/B: se as categorias sugeridas pela IA fizeram sentido
  (isso mede qualidade de extração real, que não dá pra testar sem
  `LOVABLE_API_KEY`).
- Para o Cenário C, passo 5: confirmação explícita de que a senha não
  vazou em log/rede/storage.

# REDESIGN-08 — Regressão e entrega: plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** conferir, medir, documentar e preparar a entrega do redesign (PR único #65), com quatro consertos de regressão (C1–C4), dois de número (K1, K2) e os achados de acessibilidade medidos (C5).

**Architecture:** cada conserto é uma regra pura em `src/lib/**` com Vitest co-localizado e uma mudança mínima na tela. O projeto **não tem teste de componente** (invariante 25), então o contrato tela × regra é fixado por varredura do código-fonte, no molde de `limite-do-bloco.test.ts`. O resto do plano é medição e documento, sem código de produção.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, Vitest (`environment: node`), Tailwind v4, Supabase (só leitura).

**Spec:** `docs/superpowers/specs/2026-11-06-08-regressao-e-entrega-design.md` (aprovado, K1–K6 decididas).

## Global Constraints

- Trabalhar **só** em `C:/tmp/08-entrega`. Diretório principal: só ler o `.env.local`, com aval; copiado, apagado no fim.
- Sem push, sem PR, sem merge em `main`, sem deploy, sem upstream (D67). Um commit local por tarefa.
- Commits: título pt-BR **sem acento**, `git commit -F <arquivo>`, rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Normalizar CRLF com `sed -i 's/\r$//'` nos arquivos tocados antes do commit. `git checkout -- AGENTS.md` antes de commitar se o `next dev` rodou.
- Nenhum `Date.now()` / `new Date()` sem argumento em código novo. Sem prettier.
- Banco: só leitura. md5 dos saldos `md5(string_agg(id||':'||account_balance(id)) order by id)` sobre `accounts` deve dar `15d93bd1c1d3e55a40db6210dff0eb3b` no início e no fim. Migration nenhuma.
- Fixture sintética sempre: nenhum nome real de pessoa, banco, cartão ou categoria; nenhum valor dos prints. Prints 1 e 2 **nunca** entram no repositório.
- TDD: teste vermelho antes; **mutação confirmada** (o teste derrubado com a produção revertida e depois restaurada, conferido por `git diff`).
- Suíte num checkout novo: `npx vitest run --testTimeout=30000`.
- Execução de cada tarefa de código decidida por `ai-router-br:route`.
- `STATUS.md`, `CURRENT_STATUS.md`, `docs/handoff/*` e `CLAUDE.md` só na Tarefa 11, com edição pontual. Nunca `AGENTS.md`.

## Review Focus

- **Gaveta aberta por link compartilhado e fechada** (C1): o "voltar" não pode sair do app — fecha com `replace`, nunca `back`.
- **Indicador cujo `href` vai para outra página** (C2): continua rolando ao topo; só o link que abre a gaveta deixa de rolar.
- **Dashboard com período personalizado** (`?periodo=custom&de=&ate=`, C3): o "Tentar de novo" preserva `de` e `ate`, não só `periodo`.
- **Mês exatamente no limite da janela** (atual + 5, K1): ainda mostra número; só atual + 6 em diante vira "fora do período lido". Na base caixa nada muda.
- **Cartão desativado com fatura real em aberto** (K2): a fatura real continua aparecendo; só a prevista (virtual) some.

---

### Tarefa 0: Linha de base

**Files:** nenhum.

- [ ] **Passo 1:** md5 dos saldos pelo MCP do Supabase (`execute_sql`, projeto `yjvnlbjvippefvzgrxxw`, só `select`). Esperado: `15d93bd1c1d3e55a40db6210dff0eb3b`. Divergente → PARE e reporte.
- [ ] **Passo 2:** os cinco comandos na ponta antes de tocar em nada: `npx vitest run --testTimeout=30000`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`. Anotar contagem de testes e a saída do `perf:bundle` em `scratchpad/perf-integracao-antes.txt` (insumo da Tarefa 8). Sem commit.

### Tarefa 1 (C2): link do indicador que abre a gaveta não rola

**Files:**
- Modify: `src/lib/painel/detalhe-url.ts` (nova função)
- Modify: `src/components/shared/painel/indicador.tsx:206-212`
- Test: `src/lib/painel/detalhe-url.test.ts`, `src/components/shared/painel/painel.test.ts`

**Interfaces:**
- Produces: `abreAGaveta(href: string): boolean` — `true` sse o `href` traz o parâmetro `detalhe` na query (o mesmo nome que `urlComDetalhe` escreve).

- [ ] **Passo 1: testes vermelhos.** Em `detalhe-url.test.ts`: `abreAGaveta(urlComDetalhe("/dashboard/financeiro", {mes:"2026-03"}, pedido))` é `true`; `abreAGaveta("/faturas")` e `abreAGaveta("/financeiro/lancamentos?mes=2026-03")` são `false`; `abreAGaveta("/x?detalhes=1")` é `false` (nome exato, não prefixo). Em `painel.test.ts` (varredura da fonte de `indicador.tsx`): contém `scroll={!abreAGaveta(href)}`.
- [ ] **Passo 2:** `npx vitest run src/lib/painel/detalhe-url.test.ts src/components/shared/painel/painel.test.ts` → FAIL (função inexistente / string ausente).
- [ ] **Passo 3:** implementar `abreAGaveta` (parse da query sem `new URL` com base implícita — `URLSearchParams` sobre o trecho após `?`) e passar `scroll={!abreAGaveta(href)}` no `<Link>` do `Indicador`.
- [ ] **Passo 4:** rodar de novo → PASS. Mutação: trocar por `scroll={false}` fixo deve manter o teste de fonte vermelho; reverter `abreAGaveta` para `return true` derruba o teste de `/faturas`. Conferir a restauração por `git diff`.
- [ ] **Passo 5:** commit `fix(redesign): 08 C2 - link do indicador que abre a gaveta nao rola a pagina`.

### Tarefa 2 (C1): fechar a gaveta aberta por clique não duplica o histórico

**Files:**
- Modify: `src/lib/painel/gaveta.ts` (nova função)
- Modify: `src/components/shared/painel/gaveta-de-registros.tsx`
- Test: `src/lib/painel/gaveta.test.ts`, `src/components/shared/painel/gaveta.test.ts`

**Interfaces:**
- Produces: `comoFecharAGaveta(p: { abertaPorNavegacao: boolean }): "voltar" | "substituir"` — `"voltar"` quando a gaveta abriu por navegação dentro da tela (houve `push`), `"substituir"` quando já veio aberta na primeira renderização (URL compartilhada ou recarregada).

- [ ] **Passo 1: testes vermelhos.** Puro: os dois casos acima. Fonte de `gaveta-de-registros.tsx`: contém `comoFecharAGaveta(`, `router.back()` e `router.replace(urlAoFechar, { scroll: false })`; o estado `abertaPorNavegacao` nasce `false` (`useState(false)`) e vira `true` só no ramo do estado derivado em que a vista passa de `null`/fechada para uma vista nova.
- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** implementar. Ao fechar pelo X/Esc: `"voltar"` → `router.back()`; `"substituir"` → o `replace` atual. Depois de fechar, `abertaPorNavegacao` volta a `false`. Fechar pelo "voltar" do navegador continua sem chamar `aoFechar` (a vista vira `null` pela URL).
- [ ] **Passo 4:** PASS + mutação (`comoFecharAGaveta` sempre `"substituir"` derruba o caso puro; remover o `router.back()` derruba o de fonte). `git diff` limpo após restaurar.
- [ ] **Passo 5:** commit `fix(redesign): 08 C1 - fechar a gaveta aberta por clique volta no historico em vez de duplicar`.

### Tarefa 3 (C3): "Tentar de novo" dos cards do Dashboard preserva o período

**Files:**
- Modify: `src/lib/dashboard/period.ts` (nova função)
- Modify: `src/app/(app)/dashboard/page.tsx`; `src/components/dashboard/general/{finance-card,invoices-card,notifications-card,resumo-financeiro}.tsx`
- Test: `src/lib/dashboard/period.test.ts`, `src/components/dashboard/general/cards-sem-leitura.test.ts`

**Interfaces:**
- Produces: `urlDoDashboard(p: { periodo?: string; visao?: string; de?: string; ate?: string }): string` — `/dashboard` mais só os parâmetros presentes, nesta ordem (`periodo`, `visao`, `de`, `ate`), com `encodeURIComponent`.
- Os quatro cards ganham a prop `hrefDeNovo: string` e a usam no `CardSemLeitura` de falha da leitura principal. O `href="/notificacoes"` da segunda leitura do `NotificationsCard` (linha 48) **não muda**.

- [ ] **Passo 1: testes vermelhos.** Puro: `urlDoDashboard({})` = `"/dashboard"`; `{periodo:"mes"}` = `"/dashboard?periodo=mes"`; `{periodo:"custom", de:"2026-01-01", ate:"2026-01-31"}` = `"/dashboard?periodo=custom&de=2026-01-01&ate=2026-01-31"`. Fonte: nenhum dos quatro arquivos contém `href="/dashboard"`; `page.tsx` contém `urlDoDashboard(` e passa `hrefDeNovo=` aos quatro.
- [ ] **Passo 2:** FAIL.
- [ ] **Passo 3:** implementar; a página monta a URL com `str(sp.periodo)`, `str(sp.visao)`, `str(sp.de)`, `str(sp.ate)` (o que veio na URL, não o padrão do layout).
- [ ] **Passo 4:** PASS + mutação (voltar um card a `href="/dashboard"` derruba a varredura). `git diff`.
- [ ] **Passo 5:** commit `fix(redesign): 08 C3 - tentar de novo dos cards do dashboard preserva o periodo`.

### Tarefa 4 (C4): contagem no indicador não vira "R$ ••••"

**Files:**
- Modify: `src/components/shared/painel/indicador.tsx` (tipo de `valor` e o ramo de desenho)
- Modify: `src/app/(app)/parcelamentos/installments-client.tsx:340`
- Test: `src/components/shared/painel/painel.test.ts`

**Interfaces:**
- Produces: `valor` do `Indicador` aceita um quinto membro `{ contagem: string }`: desenhado como o número grande, **sem** as três spans do olho (nem "R$ ••••" nem "valor oculto").

- [ ] **Passo 1: teste vermelho (fonte).** `indicador.tsx` declara `{ contagem: string }` na união e tem um ramo `"contagem" in valor`; `installments-client.tsx` passa `valor={{ contagem: String(totais.ativos) }}`; nenhum `valor={String(` resta em consumidores de `<Indicador` (varrer os 6 arquivos que o usam).
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS + mutação (voltar `installments-client` a `String(...)`). `git diff`.
- [ ] **Passo 5:** commit `fix(redesign): 08 C4 - contagem de parcelamentos ativos nao some com o olho`.

### Tarefa 5 (K1): indicador de mês além da janela diz "fora do período lido"

**Files:**
- Modify: `src/lib/finance/pipeline.ts` (nova função ao lado de `janelaDoRelatorio`)
- Modify: `src/lib/finance/detalhe.ts:1250-1265` (`alemDaJanela` passa a usar a função nova; `MESES_LIDOS_ADIANTE` sai daqui)
- Modify: `src/lib/finance/painel.ts:253` (`indicadoresDoResumo` e o tipo `IndicadorPronto`)
- Modify: `src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx:292`, `src/app/(app)/relatorios/relatorios-client.tsx` (chamada de `indicadoresDoResumo`)
- Test: `src/lib/finance/pipeline.test.ts`, `src/lib/finance/painel.test.ts`, `src/lib/finance/detalhe.test.ts`

**Interfaces:**
- Produces: `ultimoMesLido(mesAtual: string): string` = último mês de `janelaDoRelatorio({ mesSel: mesAtual, mesAtual }).projMeses` (mês atual + 5) — derivado da janela, nunca uma segunda constante.
- `indicadoresDoResumo` ganha `foraDaJanela: string | null` (o último mês lido, `"AAAA-MM"`, quando `mes > ultimoMesLido(mesAtual)`; senão `null`). Com `base === "competencia"` e `foraDaJanela !== null`, os **três** indicadores devolvem `valor: { ausente: "fora do período lido (até MM/AAAA)" }`, `detalheComValor: null` e `comparacao: null`. `IndicadorPronto.valor` passa a admitir `{ ausente: string }`. Na base caixa nada muda.
- O `REGEX_MES` de `detalhe-url.ts` já recusa `2026-13` (`/^\d{4}-(0[1-9]|1[0-2])$/`): só um teste fixa isso, sem mudar código.

- [ ] **Passo 1: testes vermelhos.** `ultimoMesLido("2026-11")` = `"2027-04"`; `ultimoMesLido("2026-08")` = `"2027-01"`. `indicadoresDoResumo` com `foraDaJanela: "2027-04"`, base competência, resp `meu` e `terceiros`: os três `valor` iguais a `{ ausente: "fora do período lido (até 04/2027)" }`; o mesmo com base caixa: valores inalterados; com `foraDaJanela: null`: igual ao resultado atual (comparar com a chamada sem o campo, via fixture existente). `detalhe.test.ts`: a frase de `alemDaJanela` continua idêntica para um mês além da janela. `mesDaUrl("2026-13", "2026-11")` = `"2026-11"`.
- [ ] **Passo 2:** FAIL.
- [ ] **Passo 3:** implementar; as duas telas calculam `foraDaJanela` com `mesSel > ultimoMesLido(mesAtual) ? ultimoMesLido(mesAtual) : null` e o passam. As conciliações da 04-A/04-A2/04-B continuam verdes sem mudar número.
- [ ] **Passo 4:** PASS + mutação (`ultimoMesLido` somando 6; o ramo `foraDaJanela` ignorado). `git diff`.
- [ ] **Passo 5:** commit `fix(redesign): 08 K1 - indicador alem da janela lida diz fora do periodo em vez de zero`.

### Tarefa 6 (K2): cartão desativado não ganha fatura prevista nas próximas faturas

**Files:**
- Modify: `src/lib/finance/dashboard.ts:105` (`DashCard`) e `:752` (`proximas6Faturas`)
- Modify: `src/lib/finance/pipeline.ts:380` (mapear `ativo: c.ativo`)
- Test: `src/lib/finance/dashboard.test.ts`, `src/lib/finance/pipeline.test.ts`

**Interfaces:**
- `DashCard.ativo?: boolean` — ausente = `true` (a mesma convenção de `faturas-do-cartao.ts:96`; fixtures existentes não mudam).
- `proximas6Faturas`: cartão com `ativo === false` entra **só com faturas reais** (`stmtByKey`); a linha virtual (prevista) não nasce para ele.

- [ ] **Passo 1: testes vermelhos.** Fixture sintética com dois cartões ("Cartão A" ativo, "Cartão B" `ativo: false`), B com uma fatura real aberta numa das 6 competências: o resultado tem as 6 de A, a real de B e **nenhuma** virtual de B. Pipeline: `credit_cards` com `ativo: false` chega ao `DashCard` com `ativo: false`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. Conferir que `InvoicesCardData` (que já filtra `!f.virtual`) não muda de número e que a caracterização da 03-A (`dashboard-caracterizacao.test.ts`) continua verde sem edição.
- [ ] **Passo 4:** PASS + mutação (remover a condição `ativo`). `git diff`.
- [ ] **Passo 5:** commit `fix(redesign): 08 K2 - cartao desativado nao projeta fatura prevista`.

### Tarefa 7: conferência por leitura dos itens "não conferidos"

**Files:** nenhum de produção; anotações em `scratchpad/conferencia-leitura.md`.

- [ ] **Passo 1:** RR-D-20 — `/faturas` e `/parcelamentos` mostram aviso quando `listaComTeto` satura? Ler `faturas/page.tsx`, `parcelamentos/page.tsx` e a leitura de recebimentos.
- [ ] **Passo 2:** RR4 — `usadoPorCartao` na tela (centavos) × no sino (float): mesma soma para uma fixture com 0,1 + 0,2? Se divergir, é número errado → **PARE e leve ao dono** antes de consertar.
- [ ] **Passo 3:** matriz ○ da 03-G2 §12: marcar cada item como entregue (commit/fase) ou aberto. Itens abertos que forem número errado sobem ao dono; o resto vai ao §13.
- Sem commit (o resultado entra no §13 na Tarefa 12).

### Tarefa 8: performance antes/depois

**Files:** nenhum versionado além do §13 do desenho (Tarefa 12).

- [ ] **Passo 1:** `git worktree add C:/tmp/08-main origin/main` (`4261e03`), `npm ci`, `npm run build`, `npm run perf:bundle` → `scratchpad/perf-main.txt`.
- [ ] **Passo 2:** na integração (depois das Tarefas 1–6): `npm run build && npm run perf:bundle` → `scratchpad/perf-08.txt`.
- [ ] **Passo 3:** tabela por rota (todas as que o script lista): antes, depois, delta; mediana dos dois; as 10 que mais cresceram e as 10 que mais caíram; para cada rota do inventário (§3) com delta ≥ **+5 KB gz**, a explicação pelo import (chunk novo, peça comum, `next/dynamic` faltando).
- [ ] **Passo 4:** `git worktree remove C:/tmp/08-main` (e `git branch` nenhuma criada). Conferir com `git worktree list`.

### Tarefa 9: testes operacionais (com a sessão do dono)

**Files:** anotações em `scratchpad/operacionais.md`.

- [ ] **Passo 1:** pedir o aval para ler o `.env.local` do diretório principal; copiar para `C:/tmp/08-entrega/.env.local`; `npm run dev`.
- [ ] **Passo 2:** fluxos **só de leitura**, eu, no Chrome da sessão do dono (se pedir login: PARE e peça): abrir os registros de cada indicador do Painel, do Relatório e do Dashboard e conferir soma × total; trocar base e responsabilidade; cada recorte do Relatório ("não segue" onde não alcança); os 11 cards do Dashboard, ↑/↓ e ocultar **sem salvar** o layout.
- [ ] **Passo 3:** fluxos que **gravam** — um aval por fluxo, pedido em mensagem própria: lançar/editar/excluir; pagar/desfazer fatura; parcelar e dividir; receber reembolso (04-C). Fixture marcada `[08-SINT]`, nomes sintéticos; o dono clica. Eu leio antes e depois. Sem aval: "conferido por leitura e pela suíte".
- [ ] **Passo 4:** md5 depois que o dono remover a `[08-SINT]` = linha de base.

### Tarefa 10: visual e acessibilidade (C5)

**Files:** consertos que surgirem, cada um com teste; harness de iframes no scratchpad, fora do git.

- [ ] **Passo 1:** cada rota do §3 do desenho em claro e escuro × 390/768/1280/1440 px (Chrome; se a janela não redimensionar, harness de iframes e declarar o que foi medido só pelo DOM). Zoom 200%: viewport de 640 px e, onde o harness permitir, `document.documentElement.style.zoom = "2"` em 1280. Critério: `document.documentElement.scrollWidth <= innerWidth`, nada cortado nem sobreposto.
- [ ] **Passo 2:** teclado: Tab do topo ao fim em cada rota, foco visível em todo alvo, Esc fecha gaveta e diálogo, foco volta ao gatilho, ↑/↓ dos cards do Dashboard alcançáveis e operáveis.
- [ ] **Passo 3:** contraste medido: script no `javascript_tool` que percorre os nós de texto visíveis, lê `getComputedStyle` (cor e fundo efetivo subindo a árvore) e calcula a razão WCAG; reprovar < 4,5:1 (texto normal) e < 3:1 (≥ 24 px ou ≥ 18,66 px negrito). Nos dois temas.
- [ ] **Passo 4:** varredura de botão só de ícone sem nome acessível nas rotas do inventário (DOM: `button, a[href]` sem texto visível nem `aria-label`/`aria-labelledby`) e gráfico sem leitura textual.
- [ ] **Passo 5:** cada defeito vira uma subtarefa C5.n: teste vermelho (varredura de fonte no molde do projeto), conserto mínimo, mutação, commit `fix(redesign): 08 C5.n - <o que>`. Defeito que exija mudar comportamento além de a11y → dono decide.
- [ ] **Passo 6:** apagar `C:/tmp/08-entrega/.env.local` e parar o `next dev`; `git checkout -- AGENTS.md`.

### Tarefa 11: documentação

**Files:**
- Modify: `docs/redesign/STATUS.md` (cabeçalho "redesign fechado", seção da 08, próximo passo = merge do #65 pelo dono)
- Modify: `docs/project/CURRENT_STATUS.md`, `docs/handoff/LAST_PHASE_SUMMARY.md`, `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
- Modify: `CLAUDE.md` — copiar a invariante do §13.6 do desenho da 04-C (texto literal dela); corrigir a invariante 91 (o teto de 285 KB de `/configuracoes` não existe mais — trocar pela medição atual da Tarefa 8)

- [ ] **Passo 1:** ler cada arquivo inteiro antes; editar com `Edit` pontual.
- [ ] **Passo 2:** `git diff --stat` mostra só estes arquivos; nenhuma linha removida fora das trocadas. Commit `docs(redesign): 08 documentacao - redesign fechado`.

### Tarefa 12: reversão, texto do PR e §13

**Files:**
- Create: `docs/redesign/REVERSAO.md`, `docs/redesign/PR-65.md`
- Modify: `docs/superpowers/specs/2026-11-06-08-regressao-e-entrega-design.md` (§13)

- [ ] **Passo 1:** `REVERSAO.md`: (a) `git revert -m 1 <merge do #65>` numa branch, por PR; (b) o que **não** reverte, pelo nome do arquivo: as quatro migrations do §2.1 do desenho e as anteriores já em `main` (M1, M2, M2b, M3, M-F); (c) a conferência depois do revert: `select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'salvar_lancamento'` comparada com a chamada do código revertido (`grep -rn "salvar_lancamento" src`) — se o código antigo não a chama, nada a fazer; (d) Vercel: Instant Rollback ao deploy de produção anterior ao merge; depois `curl -sD - -o /dev/null https://app.yurimoraes.com.br/login | grep x-vercel-id` → `gru1::gru1`; md5 dos saldos.
- [ ] **Passo 2:** `PR-65.md`: o que entra (03-G2 a 08, por fase, com o merge local de cada uma), as quatro migrations aplicadas e por quem, o que conferir depois do deploy (rotas do §3, `gru1::gru1`, md5), a mudança de forma do JSON exportado (K3), o backlog declarado (§4.3, K3/K4/K5/K6), a reversão (link ao `REVERSAO.md`), rodapé `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Não tocar o GitHub.
- [ ] **Passo 3:** §13 do desenho: consertos com commit; achados não consertados com destino; resultado das Tarefas 7–10; decisões com o custo se estiverem erradas; números da Tarefa 13.
- [ ] **Passo 4:** commit `docs(redesign): 08 reversao, texto do PR 65 e secao 13`.

### Tarefa 13: verificação final, revisão e parada

- [ ] **Passo 1:** `npx vitest run --testTimeout=30000`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`, `TZ=UTC npx vitest run --testTimeout=30000`. Todos verdes; anotar números.
- [ ] **Passo 2:** md5 dos saldos = `15d93bd1c1d3e55a40db6210dff0eb3b`.
- [ ] **Passo 3:** revisão final da branch inteira (`origin/main...feat/redesign-08-entrega`) por um revisor novo no modelo mais capaz; achado crítico/alto → corrigir com TDD e re-revisar só a correção; o resto vai ao §13.
- [ ] **Passo 4:** varredura do diff por segredo (`.env`, chave, token, `service_role`) e pelos prints; `git status` limpo; commit final do §13 se mudou. **PARE** e reporte ao dono.

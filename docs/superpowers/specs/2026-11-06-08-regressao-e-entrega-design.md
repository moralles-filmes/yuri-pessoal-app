# REDESIGN-08 — Regressão e entrega (desenho)

**Data:** 2026-11-06 · **Branch:** `feat/redesign-08-entrega` (worktree `C:/tmp/08-entrega`), nascida de
`feat/redesign-00-auditoria` em `42af6c3` · **Situação:** **aprovado pelo dono em 2026-11-06**, com K1–K6 decididas uma a uma (§4.2).

## 1. Intenção

A 08 fecha o redesign. Ela **não entrega funcionalidade nova**: confere o todo, mede, documenta e deixa
pronta a entrega do PR único #65 (D67). Só entra conserto que seja **regressão do redesign**, **defeito de
acessibilidade** ou **número errado**. Tudo que mudar comportamento além disso volta ao dono como decisão,
uma por vez (§10).

**Anti-objetivos:** publicar qualquer coisa (push, PR, merge em `main`, deploy); escrever no banco real sem
aval por fluxo; consertar dado retroativamente; "zerar bugs".

## 2. Portão e linha de base (conferidos em 2026-11-06)

- 04-B e 04-C são ancestrais de `feat/redesign-00-auditoria` (`git merge-base --is-ancestor` = 0 nas duas);
  o "Próximo passo" do STATUS é a 08.
- **Base de comparação = `origin/main` (`4261e03`, PR #64)**, não o `main` local, que está parado em
  `0654b83` (PR #62). `origin/main...HEAD`: **157 commits, 284 arquivos**.
- **md5 dos saldos:** a linha de base continua `15d93bd1c1d3e55a40db6210dff0eb3b` — a 04-C registrou o mesmo
  md5 antes e depois de cada migration (STATUS §04-C). Conferido no início e no fim da 08.

### 2.1 Achado do portão que muda a reversão

O prompt cita "M1, M2, M2b, M3, M-F e `salvar_lancamento_atomico`" como as migrations já aplicadas. Pelo
diff, **M1, M2, M2b, M3 (03-C2) e M-F já estão em `origin/main`** (PRs #56–#64) e **não entram no #65**. O que
o #65 leva de schema são **quatro** arquivos:

| Arquivo | Fase | Aplicada por |
| --- | --- | --- |
| `20261025120000_salvar_lancamento_atomico.sql` | 03-G2 | dono, SQL Editor |
| `20261102120000_reembolso_vinculo.sql` (M1 da 04-C) | 04-C | MCP |
| `20261102120100_reembolso_realocacao.sql` (M2 da 04-C) | 04-C | dono, SQL Editor |
| `20261102120200_reembolso_salvar_lancamento.sql` (M3 da 04-C) | 04-C | dono, SQL Editor |

⚠️ **A 04-C reusou os nomes M1/M2/M3**, e o "M3" dela substitui `salvar_lancamento` (pausa por GUC). O
`REVERSAO.md` vai nomear as migrations **pelo arquivo**, nunca por "M1/M2/M3", e vai deixar explícito que
reverter o código do #65 com o banco já no `salvar_lancamento` da 04-C é o caso que precisa de conferência
(§9).

## 3. Inventário da regressão (§1 do pedido)

Fonte: `git diff --name-only origin/main...HEAD`. Doze `page.tsx` tocados diretamente e as peças comuns
(`src/components/shared/painel/`, `src/components/dashboard/general/`, `src/lib/finance`, `src/lib/painel`,
`src/lib/dashboard`) que alcançam outras rotas.

| Rota | Fases | O que conferir |
| --- | --- | --- |
| `/dashboard` | 06, 04-B | barra → banner → Resumo financeiro (4 indicadores) → 11 cards; reordenar por ↑/↓ e por teclado; ocultar/mostrar; card sem leitura e o "Tentar de novo"; período na URL |
| `/dashboard/financeiro` | 04-A, 04-B, 04-C | indicadores, olho, base e responsabilidade, gaveta de registros (abrir, Esc, voltar, histórico), conciliação total × registros, mês fora da janela |
| `/relatorios` (aba Financeiro) | 04-A2, 04-B | barra de filtros (período, base, responsabilidade, conta, cartão, pessoa, categoria), "não segue", gaveta, exportação JSON |
| `/financeiro/lancamentos` | 03-G2, 04-C | lançar, editar, excluir (previsão), estorno, reembolso vinculado a pessoa |
| `/faturas` | 05-B, 03-F | ordem vencidas → atual → a vencer, pagar e desfazer, total zero/crédito, olho |
| `/cartoes`, `/cartoes/meus`, `/cartoes/proximos-meses`, `/cartoes/relatorios` | 05-A, 05-C | grade transposta, cartão desativado, olho |
| `/parcelamentos` | 05-C, 03-D | parcelar, cancelar futuro, olho ("Parcelamentos ativos") |
| `/terceiros` | 04-C | ficha por pessoa, total = Painel, saldo a favor, Pagamentos, Não será cobrado |
| `/importar` | 04-C, 03-E | revisão com reembolso por linha, prévia por pessoa |
| `/configuracoes` | 07, 03-C2 | categorias (classificação padrão), sem regressão de bundle |
| `/financeiro` | 02 | redireciona/navega como em `NAVEGACAO.md` |
| Casca (Sidebar, Header, nav) | 01/02, 05-C | ordem do `NAVEGACAO.md` §4, foco, menu no celular |

Cada linha é conferida em **claro e escuro**, **390/768/1280/1440 px** e **zoom 200%** (§6).

## 4. Pendências herdadas — decisão proposta

Levantadas nos §13 (e §11/§12 onde não há §13) dos 21 desenhos do redesign e no STATUS. Gravidade: **A** =
número errado ou acessibilidade; **M** = regressão de UX do redesign; **B** = limpeza/doc/menor.

### 4.1 Consertar aqui (regressão, acessibilidade ou número errado, sem decisão de comportamento)

| # | Item | Origem | Grav. |
| --- | --- | --- | --- |
| C1 | Fechar a gaveta de registros deixa entrada duplicada no histórico (push ao abrir, `replace` ao fechar → "voltar" reabre a mesma tela) | 04-B §13.6 #5 | M |
| C2 | Link do `Indicador` sem `scroll={false}`: abrir a gaveta rola a página ao topo | 04-B §13.6 #3 | M |
| C3 | "Tentar de novo" do `CardSemLeitura` no Dashboard aponta para `/dashboard` sem `?periodo` (perde o período) — 4 cards | 06 | M |
| C4 | Com o olho fechado, a **contagem** "Parcelamentos ativos" vira "R$ ••••" (é número de compras, não dinheiro) | 05-C | A |
| C5 | Achados de acessibilidade que a própria 08 medir (contraste < AA, foco invisível, botão só de ícone sem nome, Esc/retorno de foco, gráfico sem leitura textual) | 08 §6 | A |

### 4.2 Decisão do dono (§10) — número errado ou mudança de comportamento

| # | Item | Origem | Proposta |
| --- | --- | --- | --- |
| K1 | Mês além da janela lida (atual + 5) mostra **R$ 0,00** no indicador; a gaveta já declara a falha. `?mes=2026-13` passa na regex | 04-B §13.5 D6, 04-A2 §13.5 | ✅ **Decidido pelo dono (2026-11-06): (a)** — o indicador escreve "fora do período lido" em vez de zero e a regex recusa mês 13; ausência nunca é zero, sem ampliar a leitura |
| K2 | `proximas6Faturas` projeta fatura de **cartão desativado** no Painel e na aba de `/relatorios` | 05-A §12, 05-C §13 | ✅ **Decidido pelo dono (2026-11-06): consertar aqui** (número errado; a 05-C já tirou o desativado de `/faturas`) |
| K3 | A subfase **04-D** (exportação com período/base/filtros/XLSX) nunca rodou; o JSON exportado mudou de forma na 04-A2 (`finance` → `financeiro`, números como texto) | PLANO §04, 04-A2 §13.5 | ✅ **Decidido pelo dono (2026-11-06): adiar** para o backlog pós-redesign; a mudança de forma do JSON é descrita no PR |
| K4 | "Faturas dos próximos meses" do Relatório não abre registros (o modelo agrega por mês, sem id de fatura) | 04-B §13.3/§13.5 D2 | ✅ **Decidido pelo dono (2026-11-06): adiar** (exige dar id ao modelo = funcionalidade) |
| K5 | Rótulo "Faturas" ainda não é "Faturas e pagamentos" na IA e na busca | 05-B §12, 05-C §13 | ✅ **Decidido pelo dono (2026-11-06): não trocar.** Na busca, "Faturas" nomeia o grupo de resultados (cada um é uma fatura) e está certo; na IA é o nome da tela no contexto do prompt — trocar mexe no prompt (invariantes 21 e 100), vai ao backlog pós-redesign e é registrado no PR |
| K6 | RR-D-15 / RR-D-6: a IA ainda diz "A receber de terceiros" em `finance.get_invoice` e no insight | 03-D, 07-D | ✅ **Decidido pelo dono (2026-11-06): adiar**, junto com o rótulo da K5 |

### 4.3 Declarar e adiar (backlog pós-redesign, com destino)

- **Limpeza (code-health pós-merge):** `registrarRecebimento`, `receberSaldo`, `registrarRecebimentoSchema` e
  as frases "clique em Receber" sem consumidor (04-C §13.5); `apresentarEntradas` sem consumidor de produção;
  `resumoAtual` sem uso em `gerarAlertas`; `truncate` sem efeito em `<td>` (04-A).
- **Olho:** não esconde gráficos, legenda da rosca nem tooltips (04-A2); não existe na Visão geral nem em Meus
  cartões (05-C). É escopo de privacidade, não regressão.
- **Degradação:** falha em `getCategories`/`getPeopleForSelect` derruba `/relatorios` (04-A2); falhas de
  "últimas transações"/saldo não vão ao log (04-A); RR-G-3 (~500 leituras não financeiras), RR-G-11 (Cron).
- **Concorrência / atomicidade:** deadlock plausível em `salvar_lancamento` com a mesma pessoa (04-C, exige
  migration); RR-G2-2, A5 (`cancelInstallmentFuture`), RR-G2-4 (estorno editado não muda de fatura).
- **Funcionalidade:** Lançamentos sem filtro/soma por responsabilidade (03-G2 A1); "em N×" das parceladas
  (D-A-12); pessoa inativa como filtro e em "De quem?"; sino por pessoa; RR1–RR3 (receita `terceiro`).
- **Anterior ao redesign:** RR-C2-7 (editar categoria zera `sort_order`) — candidato a tarefa avulsa, fora
  da 08 por não ser regressão do redesign.
- **Não conferidos item a item, conferidos aqui por leitura:** RR-D-20 (aviso de teto em `/faturas` e
  `/parcelamentos`), RR4 (`usadoPorCartao` centavos × float no sino), a matriz ○ da 03-G2 §12. Se a leitura
  achar número errado, sobe para §4.2.

### 4.4 Do dono, fora do código

Conferências com dado real (D39, D44, D48, D52, D60), visuais herdadas (03-E 390 px, 03-F desfazer, 03-G,
03-G2, 07-A–D, diálogo de reembolso da importação), remover a fatura sintética `[03F-SINT]`, as decisões
abertas R6 (04-A2), K7 (04-A), alocação parcial perdoada (04-C), selo "Atrasada" de total zero (05-B), e o
histórico de migrations (D59). A 08 cobre **as visuais** dentro do §6 com a sessão do dono; o resto fica
listado no PR.

## 5. Testes operacionais

Roteiro por fluxo, **lendo primeiro** (tela + `execute_sql` só `select`) e pedindo ao dono o clique que grava.
Cada fluxo de escrita tem aval **por fluxo**; sem aval, ele é conferido só por leitura e declarado assim.

| Fluxo | Escreve? | Como |
| --- | --- | --- |
| Lançar, editar, excluir (previsão de exclusão) | sim | dono clica; leio antes/depois |
| Pagar e desfazer fatura | sim | dono clica; confiro `pago_em`, md5 volta ao inicial depois do desfazer |
| Parcelar e dividir com terceiros | sim | dono clica numa fixture sintética marcada `[08-SINT]`; remoção pelo dono |
| Receber reembolso (04-C) | sim | idem, com prévia "deve X → passa a dever Y" |
| Abrir os registros de cada número (04-B) | não | eu: cada indicador do Painel, Relatório e Dashboard, soma × total |
| Trocar base e responsabilidade | não | eu: URL e números coerentes |
| Recortes do Relatório | não | eu: cada filtro, "não segue" onde não alcança |
| Dashboard geral (06) | não | eu: 11 cards, reordenar ↑/↓, ocultar, card sem leitura |

⚠️ Escrever deixa o md5 diferente do inicial **de propósito**; o md5 final é conferido depois de o dono
remover a fixture `[08-SINT]`. Se ele preferir não gravar nada, os fluxos de escrita ficam "conferidos por
leitura e pelos testes da suíte" e o §13 diz isso.

## 6. Visual e acessibilidade

- **Larguras:** 390/768/1280/1440 px em claro e escuro, pelo Chrome com a sessão do dono; se a janela não
  redimensionar, harness de iframes, declarando o que foi medido só pelo DOM. **Zoom 200%**: 1280 px a 200% ≈
  640 CSS px — conferido como viewport de 640 px **e** por `document.body.style.zoom` onde o harness permitir,
  com o critério "sem rolagem horizontal, nada cortado, nada sobreposto".
- **Teclado:** ordem de tabulação, foco visível, Esc fecha gaveta e diálogo, foco volta ao gatilho, nenhuma
  armadilha; reordenar cards do Dashboard por teclado (os botões ↑/↓ com `aria-label` já existem em
  `card-shell.tsx` — conferir que são alcançáveis e anunciam o resultado).
- **Contraste:** WCAG AA **medido** — cores computadas lidas do DOM (`getComputedStyle`) e razão calculada
  por script, nos dois temas; tokens de `TOKENS.md` conferidos uma vez em pares texto/fundo.
- **Leitor de tela:** varredura por botão só de ícone sem nome acessível (teste de código-fonte, no molde do
  projeto, que não tem teste de componente) e gráfico sem leitura textual (molde `MeasurementTable`).
- Cada defeito medido vira item C5 com teste vermelho antes do conserto.

## 7. Performance antes/depois

- `main` medida numa worktree temporária própria (`C:/tmp/08-main`, de `origin/main`), `npm ci` + `build` +
  `perf:bundle`, **removida no fim**. Integração medida em `C:/tmp/08-entrega`.
- Tabela das 71 rotas (ou quantas o script listar): mediana antes/depois, as 10 que mais cresceram e as 10
  que mais caíram. Para cada rota do redesign com **+5 KB gz** ou mais, a explicação (qual import, qual peça).

## 8. Documentação (passo próprio, edição pontual)

- `docs/redesign/STATUS.md`: seção da 08 e cabeçalho "redesign fechado".
- `docs/project/CURRENT_STATUS.md` e `docs/handoff/*`: o que o redesign mudou para quem chega depois.
- `CLAUDE.md`: **copiar a invariante do §13.6 da 04-C** (pedido do STATUS antes do merge final) e corrigir a
  invariante 91 (cita o teto de 285 KB de `/configuracoes`, que não existe mais). Nada além disso.

## 9. Reversão e entrega

- `docs/redesign/REVERSAO.md`: `git revert -m 1 <merge do #65>` em `main` (por PR, nunca push direto);
  **o que não reverte**: as quatro migrations do §2.1 e as anteriores já em `main`. Ponto crítico: depois de
  reverter o código, `salvar_lancamento` no banco continua a versão da 04-C — o documento diz como conferir que
  o código revertido ainda a chama com assinatura compatível (ou que não a chama), com a consulta a `pg_proc`.
  Vercel: Instant Rollback para o deploy de produção anterior ao merge, e conferir
  `x-vercel-id: gru1::gru1`.
- `docs/redesign/PR-65.md`: o texto do PR para o dono revisar — o que entra (fases 03-G2 a 08), as quatro
  migrations aplicadas, o que conferir depois do deploy, a reversão, as pendências declaradas (§4.3/§4.4). O PR
  no GitHub **não é editado**.

## 10. Decisões que voltam ao dono, uma por vez

K1 (mês fora da janela) → K2 (cartão desativado na projeção) → K5 (rótulo na IA/busca) → K3/K4/K6 (adiar).
Mais o aval por fluxo de escrita do §5 e o aval para ler o `.env.local` do diretório principal (necessário
para a conferência visual; copiado para a worktree e apagado no fim).

## 11. O que fica para o construtor

Ordem das tarefas no plano; a forma exata dos testes de C1–C4; o script de contraste; a tabela de
performance. Execução via `ai-router-br:route`, TDD com teste vermelho antes, mutação confirmada por
`git diff`, um commit local por passo, CRLF normalizado.

## 12. Riscos

- A conferência visual depende da sessão do dono no Chrome; sem ela, o §6 fica só pelo DOM e é declarado.
- Consertos em peças comuns (`shared/painel/`) alcançam várias rotas: a conferência das conciliações da 04-A,
  04-A2 e 04-B tem de continuar verde sem mudar número.

## 13. Resultado da execução

_(preenchido no fim: achados não consertados com destino, decisões com o custo se estiverem erradas.)_

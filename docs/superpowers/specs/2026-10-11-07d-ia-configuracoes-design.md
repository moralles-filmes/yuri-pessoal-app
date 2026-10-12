# Design — REDESIGN-07-D: IA, Configurações, Notificações e Busca

> Desenhado com o dono em **2026-10-11**, antes de qualquer linha de código de produção. D1–D3
> respondidas uma a uma; D4–D9 **delegadas pelo dono** ("pode fazer como recomendar") e
> registradas aqui como recomendação aceita (§3). Branch `feat/redesign-07d-ia-configuracoes`,
> worktree `yuri.app.pessoal-07d`, criada de `b993513` (ponta da 07-C, que nasceu da 07-B, que
> nasceu da 07-A; nenhuma integrada). Quarto e último lote da fase 07
> (`docs/redesign/PLANO.md`, "REDESIGN-07 — Demais módulos").

---

## 1. O que a 07-D muda de natureza

**Nenhum dado muda, nenhuma permissão cresce e nenhum gasto nasce.** Nenhuma migration, nenhuma
Server Action nova ou alterada, nenhuma Route Handler nova, nenhum caminho novo de escrita.
Nenhuma ferramenta, command, agente ou chave `allow_*` nova; `guard.ts`, a allowlist e o registry
intocados; toda chave continua nascendo `false`.

A 07-D muda a **aparência, o anúncio de estado e o carregamento** das 12 telas do lote —
`/ia/**` (9 rotas), `/configuracoes`, `/notificacoes` e `/busca` — mais o painel do assistente, o
sino e a paleta. E fecha cinco caminhos em que **a tela diz uma coisa e o sistema faz outra**:

1. o cartão de proposta mostra "feita" em verde quando a execução **falhou**, perde o desfecho ao
   fechar o painel e gira para sempre quando a resposta não volta (D1);
2. `/ia/acoes` conta como "Aguardando você" uma confirmação que **nunca mais vai executar** (D1);
3. `/ia/configuracoes` mostra a escrita **marcada** depois que o servidor a gravou desligada, e
   religar a leitura **religa a escrita sozinha** — contra a regra do lote (D2);
4. "1,5" é recusado em inglês, o teto do job em branco vira **zero**, e o comprovante lê "12.50"
   como **R$ 1.250,00** (D2);
5. os gatilhos que **gastam** não dizem que gastam antes do clique (D2).

Cada correção que alguém pudesse desfazer sem perceber sai com um teste que a impede, confirmado
por mutação (§7).

### 1.1 Decisão herdada da 07-C (bundle) — aceita e registrada aqui

A 07-C fechou com 12 rotas acima do teto por rota, de +0,1 a +1,0 KB gz, nenhuma acima de 250.
A decomposição contra o build da base mostrou que o código novo real era pequeno (o helper de
mensagens da D5 — `mensagemDaAction` + `server-errors`, 830 B crus em 9 rotas —, o `EmptyState`
da V, dois ícones, `ariaDeProgresso`) e que o resto era reempacotamento do Turbopack com o mesmo
código cru.

**Decisão: aceitar e registrar.** O teto por rota destas **13 rotas** passa a ser o **valor final
da 07-C**: `treinos/exercicios/[id]` 218,1 · `treinos/metas` 218,4 · `treinos/relatorios` 224,5 ·
`treinos/exercicios` 211,4 · `treinos/treinos/[id]` 226,1 · `treinos/recordes` 214,9 ·
`nutricao/configuracoes` 211,5 · `treinos/configuracoes` 211,0 · `treinos/historico/[id]` 217,0 ·
`treinos/historico` 220,0 · `treinos/sessao/preparar` 222,3 · `treinos/sessao` 223,1 ·
`treinos/sessao/revisar` 215,2.

⚠️ **Medido nesta máquina, no mesmo commit (`b993513`), três delas dão +0,1:**
`treinos/relatorios` 224,6, `treinos/sessao/preparar` 222,4 e `nutricao/configuracoes` 211,6.
É a mesma árvore e o mesmo build — a diferença é de arredondamento entre medidores. **Vale o
medido**, como na 07-C: a comparação de cada passo é contra a linha de base desta máquina
(`C:\tmp\base-07d\rotas.txt`), e o número acima fica como o histórico do lote anterior. Este
registro não edita `docs/redesign/STATUS.md`; ele mora aqui e no corpo do primeiro commit que
mede bundle.

---

## 2. Linha de base medida (2026-10-11, antes de tocar em qualquer coisa)

`npm ci` + `.env.local` copiado da pasta principal (ignorado pelo git, `.gitignore:34`).

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **219 arquivos / 5.264 testes — 5.263 ✅, 1 ❌** (ambiente) |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run perf:bundle` | exit 0 · mediana **213,2 KB** · **68** rotas · `/(app)/configuracoes` **282,1/285** |

A ❌ é a de ambiente herdada, e tem de ser a única no fim, com o mesmo nome:
`src/lib/ai/approval/schema.test.ts › as travas que o código não pode contornar › a FK da
aprovação carrega o hash, amarrando-o ao effect_hash da proposta` (CRLF do worktree).

As 12 rotas do lote (KB gz, primeiro carregamento; medidor rota a rota com a conta do script do
projeto — `page_client-reference-manifest.js`, gzip por chunk):

| Rota | KB | Rota | KB |
| --- | --- | --- | --- |
| `/configuracoes` | **282,1** (teto próprio 285) | `/ia/acoes` | 205,7 |
| `/ia/configuracoes` | 218,6 | `/ia/memoria` | 203,8 |
| `/ia` | 210,3 | `/ia/conversas` | 202,3 |
| `/ia/conversas/[id]` | 209,7 | `/ia/consumo` | 200,0 |
| `/ia/comprovantes` | 209,4 | `/notificacoes` | 199,9 |
| `/ia/insights` | 206,5 | `/busca` | 197,3 |

`/ia/comprovantes` mede 209,4 (o briefing dizia 209,3). **Vale o medido.** As 68 rotas estão em
`C:\tmp\base-07d\rotas.txt`, com os 206 chunks da base copiados em `C:\tmp\base-07d\chunks\` para
a prova de reempacotamento.

---

## 3. Decisões do dono (2026-10-11)

| # | Decisão | Resposta |
| --- | --- | --- |
| **D1** | Estados do cartão e contagem de `/ia/acoes` | **A recomendação + A, B, C.** `estadoDoCartao(desfecho, expiraEm, agora)` puro com o vocabulário de `state.ts` e os rótulos de `ROTULO_DO_ESTADO_DA_ACAO`; vencido diz "Prazo encerrado — nada foi aplicado", sem Recusar; parcial com tom, ícone e link (`actionsLink`); spinner no botão clicado; "sem desfecho registrado" quando a promise rejeita; "Aguardando você" = só `pendente`, `confirmada` vai para "Precisam de atenção" explicada; insights com rótulos e `aria-pressed`. **(A)** `falhou` em vermelho, "algo pode ter sido gravado"; **(B)** recusa do servidor vira estado final local do cartão, "Não aplicada" com a frase do servidor, sem botões; **(C)** o desfecho sobe para `useConversaDaIa` (acima do `<Sheet>`), por id da proposta |
| **D2** | Gasto e permissão | **A recomendação + A, B, C.** Uma frase de gasto em `@/lib/ai/constants`, ao lado de cada gatilho, por `aria-describedby`; descrição do panorama visível; "Gerar análise" com transição própria; escrita `checked = leitura && escrita`, desligar a leitura desliga a escrita no estado do formulário, ligar a leitura nunca liga a escrita; `aria-describedby` no aviso; "Remover chave" confirma; vírgula convertida no cliente; varredura contra gatilho de gasto em efeito. **(A)** o mesmo para `allowVision`, em cascata; **(B)** Enviar também diz, e o comprovante usa a mesma constante; **(C)** um conversor só (`src/lib/ai/numero.ts`), branco obrigatório é erro de campo, nunca zero |
| **D3** | Painel e streaming | **A recomendação + A, B.** `role="status"` sr-only com as fases (nunca deltas); `role="log"` com autor sr-only; rótulo no campo, atalho por `aria-describedby`, foco de volta ao campo; ids por `useId`; nome do botão com a frase do selo; `onDecidiu` no cartão e `decidiu` despachado; "Abrir esta conversa em tela cheia" → `conversationLink(id)`; no principal, sem roteador. **(A)** cada passo de runtime mede `/ia` e `/ia/conversas/[id]` e compensa com o `ProposalCard` sob demanda, ou para e reporta; **(B)** `Retry-After` registrado |
| **D4** | Configurações | **Delegada — recomendação aceita** (§6.4): Segurança recolhida (resumo + "Alterar e-mail"/"Alterar senha", formulários por `next/dynamic` + `useLazyDialog`); erros do Supabase em pt-BR por classe, e falha que não é de senha deixa de dizer "Senha atual incorreta"; `loading.tsx` onde falta; `/configuracoes` perto da mediana e, se cair abaixo de 250, sai o teto próprio no mesmo commit |
| **D5** | Notificações | **Delegada — recomendação aceita** (§6.5): grupo "Inteligência Artificial" só com `ai_insight_available` + a frase das outras três; `NOTIFICATION_TYPE_HINTS` exibidos; teste derivado de `NOTIFICATION_OPT_IN_TYPES`; `/notificacoes` com não lida em texto, filtros com nome, vazio que sabe do filtro com "Limpar filtros", "Marcar todas" que diz o alcance, erros por `mensagemDaAction` (o teto de 300 fica no R, como o mapa manda) |
| **D6** | Busca e casca | **Delegada — recomendação aceita** (§6.6): `/busca` com `useUrlText` (commit por `window.history.replaceState`), erro ≠ "Nada encontrado"; na casca, só sino e paleta, atributos e texto: "Ver todos os resultados" → `/busca?q=`, combobox/listbox com o ativo rolado para a vista, `DialogDescription`, contagem do sino no nome do botão; custo de casca D3+D6 ≤ +0,3 KB gz por rota, ou para e reporta |
| **D7** | Links | **Delegada — recomendação aceita** (§6.7): toda rota que a IA monta para um módulo **que tem construtor** passa por ele (Dieta, Treinos, medidas, memória, `/ia`); o que falta entra no `*-links.ts` certo, com teste; `?date=` → `diaryLink`, `nutrition.test.ts:235` corrigido e `/nutricao/diario` aceita `date` como apelido legado (`data` vence); `/tarefas?task=` → `/tarefas` (a página não lê `task`); as telas usam `ai-links`, e um teste amarra `AI_SECTIONS` a ele; o contrato da query string cobre `/ia/acoes` (`filtro`), `/ia/comprovantes` (`doc`), `/notificacoes` (`status`/`tipo`/`prioridade`) e `/busca` (`q`); o extrator aprende `rota:`/`targetRoute:` com piso por arquivo, sem segundo extrator; links de finanças da IA ficam registrados (03-D) |
| **D8** | Diálogos, formulários, alternâncias | **Delegada — recomendação aceita** (§6.8): as varreduras das 07-B/07-C estendidas às pastas do lote, com exceções declaradas; `mapServerFieldErrors`/`errosDaAction`/`mensagemDaAction` em todo formulário do lote que recebe `fieldErrors`; o erro de `modulo` da memória aparece; rótulos associados; exclusão de conversa com estado de envio e trava; a exclusão de memória fecha antes de a lista mudar; a retenção trava `onOpenChange`; `aria-pressed` no favorito, no Útil/Não útil e no "Mostrar as N"; filtros de `/ia/acoes` com `aria-current="page"`, fora de `EXCECOES_MUDAS` |
| **D9** | Gavetas | **Delegada — recomendação aceita** (§6.9): `module-shell` → `data-[side=left]:w-[17rem]` + `aria-expanded` no gatilho; o painel perde o `w-full` (morto); as duas exceções saem de `sheet-largura.test.ts` no mesmo commit; a 390 a gaveta vai de 292 para 272 px |

**Pontos que este spec acrescenta e que o "aprovado" do dono cobre** (mesmo defeito de um item
do mapa, achado em outro lugar do lote, ou consequência direta de uma decisão):

1. **E2 inteiro entra na D1:** o selo "sem trilha" (hoje só parágrafo), `ROTULO_DO_CAMPO` com
   `modulo` e `expires_at`, os valores formatados (instante em Brasília, data pura como texto,
   uuid como "registro interno", booleano como Sim/Não) e sem o "· N ms".
2. **E3 e E4 entram na D1:** `promptVersion` sai da tela (continua no banco), o `desfecho` do
   rodapé da varredura ganha rótulo, "Mostrar as N…" ganha `aria-pressed`, e a legenda
   "Inferência e sugestão" ganha uma linha visível sem precisar expandir "Ver dados usados".
3. **G3 inteiro entra na D2:** o seletor de canto, desabilitado com o botão oculto, passa a dizer
   por quê (`aria-describedby`); os limites diário/mensal do `provider-card` passam pelo mesmo
   conversor.
4. **P1 na D3:** `switch.motivo` (já em pt-BR, vindo do `chat-runner`) é a frase anunciada na
   troca de tentativa; `done.finishReason` fica registrado.
5. **C1 na D4:** `getProviderCards` deixa de esperar o `Promise.all` (`configuracoes/page.tsx:51`)
   — o `user.id` vem do mesmo `getCurrentUser()`, encadeado dentro do `Promise.all`.
6. **Z na T:** `/ia/consumo` escreve "não medido" na linha cujas execuções vieram todas sem custo
   (hoje "US$ 0,000000") e marca "parcial" quando só algumas vieram; a coluna "sem custo" mostra
   `0` em vez de "—" (zero aqui é fato medido).
7. **A exclusão de memória sai de dentro da linha** (D8): o `DeleteConfirmDialog` recebe o próprio
   gatilho e vive dentro da linha que some quando a lista atualiza — e o `revalidatePath` da
   action atualiza a lista **antes** do `setOpen(false)` dele. Passa a um diálogo único da tela,
   controlado (`paraApagar`), no molde da exclusão de conversa. O componente da 03-D não é editado.
8. **Sino (N3), só atributos e texto:** "não lida" em `sr-only` por item e "Marcar todas"
   desabilitado com zero não lidas. O vazio em `<p>` fica (um `EmptyState` na casca custaria nas
   68 rotas).
9. **Na paleta, o que é comportamento fica registrado** (a D6 limita a casca a atributos e texto):
   fechar limpa a consulta no meio da animação (B4), uma busca pendente repovoa a lista depois de
   fechar e o Enter da reabertura navega para um item invisível (o `timer` e o `reqId` não são
   zerados em `handleOpenChange(false)`), e o erro vira "Nada encontrado" (B2). Cada um com o
   conserto proposto no §4 R.
10. **`/busca` grava com `window.history.replaceState`** e a página remonta o cliente por
    `key={q}`: o Next 16 integra o `replaceState` ao roteador (`useSearchParams` acompanha) sem
    buscar o RSC, então a busca deixa de rodar duas vezes (B1). Um link externo (o "Ver todos" da
    paleta, o voltar) é navegação de verdade e remonta com os resultados do servidor.

---

## 4. O mapa, reconfirmado sobre `b993513`

Cada linha do briefing foi reconferida no código. As linhas batem, salvo onde indicado; o que o
mapa não dizia está nos **G**.

### E — Estados

- **E1** confere (`proposal-card.tsx:61-66,76-81,112-113,192,198,255`). **G-a:** além do parcial,
  o status `falhou` (o command quebrou depois do claim — `execute.ts:308`: "daqui em diante, algo
  pode ter sido escrito") também vira o verde da aplicada, porque `parcial: r.data.status !==
  "sucesso"` (`:132`). **G-b:** o desfecho mora no `useState` do cartão, dentro do `SheetContent`
  do painel — fechar desmonta (invariante 95) e reabrir mostra "Aguardando você"; confirmar de novo
  dá "já foi decidida". **G-c:** `confirmar()` não tem try/catch (`:115`); se a promise da Server
  Action rejeita, o cartão gira para sempre com os dois botões travados. **G-d:** uma recusa do
  servidor (`ok:false`) mostra a frase e deixa Confirmar clicável (`bloqueado` só olha
  `confirmando || expirada`); nenhum `ok:false` dá certo numa segunda tentativa com o mesmo hash.
- **E2** confere (`history.ts:495`; `acoes/page.tsx:67`; `action-history-client.tsx:75-84,99-100,
  105-134,136-140,276-282,302,311,313,429-442`; exceção em `seletor-de-visao.test.ts:186`). O
  `confirmada` que ele conta é o do §5 (a).
- **E3** confere (`insights-client.tsx:89,179-188,266,321,323-324,368-370,380-382`;
  `insights/page.tsx:94-98`). **E4** confere (`source-chips.tsx:170-182,280-284`).

### G — Gasto e permissão

- **G1** confere. O molde do comprovante (`receipt-extract-button.tsx:61-65`) já diz o custo com a
  mesma frase que a D2 centraliza.
- **G2** confere: o único `fetch` a `/api/ia/chat` está em `disparar`; os 7 `useEffect` de
  `components/ai` não chamam modelo; "Testar conexão" usa `listModels` e não gasta.
- **G3** confere (`ai-preferences-form.tsx:218-223,490,623-625,640-644,649-651`;
  `actions/ai-preferences.ts:83-120`; `provider-card.tsx:119-129,143-144,236-245`). **G-e:** o
  formulário é `useState` sem `key` e o `router.refresh()` não o reinicia — depois de salvar, a
  tela **continua mostrando a escrita marcada** que o servidor gravou desligada, e **religar a
  leitura religa a escrita** (o interruptor volta habilitado e marcado, e salvar grava `true`),
  contra a regra do lote. `allowVision` (`:270-278`) tem o mesmo defeito. **G-f:** `Number("")`
  é `0`: o teto do job em branco vira zero e passa, enquanto a tela diz que ele "não pode ficar em
  branco" (`:311-315`); o mesmo vale para a margem e os dois limites de taxa. **G-g:**
  `textoParaCentavos("12.50")` = 125000 (`receipt-review.tsx:120-126`).

### P — Painel e streaming

- **P1–P4** conferem (`chat-client.tsx:184-198,360-393,436-439,583-690,749,773,796-804`;
  `floating-assistant.tsx:94,120`; `painel.ts:105`; `floating-assistant-panel.tsx:194`).
  **Correção ao L2:** o painel já importa `ai-links` (`AI_LINK_BASE`, `:30`) — é o único `.tsx`.
  **G-h:** a consequência do P2 — pela regra do DOM, o `<label for="caixa-de-entrada">` do painel
  ativa o **primeiro** elemento com o id, que é o interruptor da página por baixo da gaveta. A
  caracterização confirma no passo 2.
- **P5** confere; registrado (§4 R).

### C — Configurações

- **C1** confere (`configuracoes/page.tsx:7,46-54`). Só o `SecurityCard` importa
  `react-hook-form`, `@hookform/resolvers/zod` e `@/lib/validators/auth` (→ `zod`); os outros 6
  cards não. Sem `loading.tsx`: `/configuracoes`, `/busca`, e dentro de `/ia` as rotas `consumo`,
  `configuracoes`, `conversas` e `conversas/[id]` herdam o esqueleto de bolhas de `ia/loading.tsx`.
- **C2** confere (`ai-card.tsx:99-100`; `ai-preferences-form.tsx:462-465` — `confirmationMode` só
  é lido em `queries.ts`; `receipt-review.tsx:362`).
- **C3** confere (`security-card.tsx:68-70,103-107,115-117`). O `@supabase/auth-js` instalado
  (2.108.2) declara `invalid_credentials`, `over_request_rate_limit`, `weak_password`,
  `same_password`, `email_exists`, `email_address_invalid`, `over_email_send_rate_limit` e
  `AuthRetryableFetchError`.
- **C4** confere (`regional-card.tsx:42-44`, `notifications-card.tsx:44-46`,
  `profile-card.tsx:45-48`). O inventário achou mais: `retention-card.tsx:92,100-102` e
  `receipt-upload.tsx:63-64`.

### N — Notificações

- **N1** confere (`settings/constants.ts:87-175`; `notifications/constants.ts:78-81,93-101`).
- **N2** confere (`notifications-client.tsx:64,66-78,91,110,121,134,148,162-167,177,190`). O
  `unread` que desabilita "Marcar todas" é contado sobre a lista **filtrada**; a action
  (`markAllNotificationsRead`) não recebe parâmetro e marca todas.
- **N3** confere (`notification-bell.tsx:73,78,88-95,104-106,118,128,142-144`).

### B — Busca

- **B1** confere, com uma precisão: o `globalSearch` do cliente tem debounce de 220 ms
  (`busca-client.tsx:60`); o custo por tecla é o `searchAll` do RSC disparado pelo
  `router.replace`. **B2–B4** conferem (`busca-client.tsx:40-42,89-91`;
  `search-command.tsx:60-62,83-88,96-109,140-144,195`).

### L — Links

- **L1** confere, item a item (inventário em `src/lib/ai/**`): `nutrition-preview.ts:307-308` e
  `adapters/nutrition.ts:63-67` com `?date=` (a página lê `data` e `visao` — `diario/page.tsx:47,
  54-55`); `nutrition.test.ts:233-236` trava o formato errado; `adapters/training.ts:94` repete
  `sessionLink`; `insights/collectors/training.ts:47` (`/treinos/historico`, sem construtor) e
  `insights/collectors/nutrition.ts:46` (`/nutricao/diario` sem data); `adapters/body.ts:63`
  repete `measurementsLink`; `memory.ts:24` e `memory-preview.ts:21` repetem `memoryLink`;
  `adapters/tasks.ts:58` com `/tarefas?task=` (`tarefas/page.tsx` lê só `view` e `date`, e o V4
  já afirma isso em `deep-links-query-string.test.ts:110`). **Em `src/lib/search/` só existem três
  construtores** — `ai-links`, `nutrition-links`, `training-links`: TO-DO, agenda, hábitos e
  estudos **não têm** `*-links.ts` (ver R).
- **L2** confere (os 13 pontos), salvo a correção do painel acima. `AI_SECTIONS` (`constants.ts:29-
  100`) não é amarrado a `ai-links` por teste nenhum.
- **L3** confere: `ROTAS` do V4 (`:36`) não tem `/ia`, `/notificacoes` nem `/busca`; o extrator
  (`links-inline.ts:135-151`) só casa `link:`/`link =`; `notifications/ai.ts` usa os construtores
  certos e não está em lista nenhuma. `parametros-lidos.ts:21-29` já detecta as leituras das
  quatro páginas (`const { filtro: bruto }`, `const { doc }`, `sp.status`, `sp.q`).

### D — Diálogos, formulários e alternâncias

- **D-a** confere, com uma precisão: a exclusão de conversa tem um `ocupado` (`conversation-
  list.tsx:48,52-54`), mas ele só trava a lixeira da linha — o "Excluir" e o "Cancelar" do diálogo
  não ficam desabilitados, o `onOpenChange` não trava e o X continua ativo (`:157-191`).
  `retention-card.tsx:198` confere. A memória: ver o ponto 7 do §3.
- **D-b** confere. **Correção:** `mapServerFieldErrors` já é usado em `memory-form-dialog.tsx:116-
  120` — o defeito ali é o erro de `modulo` ir para `setError` e não ser renderizado (`:178-207`,
  sem `aria-invalid` no `SelectTrigger` `:185`), e o `onOpenChange` não travar durante `salvando`
  (`:130`). `mensagemDaAction`/`errosDaAction` existem em `src/lib/forms/mensagem-da-action.ts`
  (07-C) e não são usados no lote. Nenhuma varredura das 07-B/07-C cobre as pastas do lote; e
  **nenhum teste do projeto** exige `DialogDescription` nem trava de `onOpenChange` durante o envio.
- **D-c** confere (`conversation-list.tsx:95-115`; `insights-client.tsx:179-188,360-383`;
  `action-history-client.tsx:429-443`). Já corretos: `memory-client.tsx:126`,
  `appearance-card.tsx:52`.

### Z, W, V

- **Z** confere (`receipt-review.tsx:166,309`; `receipt-items.ts:88-157` — com o total nulo,
  `explicar` escreve "o lançamento usa o total de R$ 0,00" ou "MAIS que o total impresso de
  R$ 0,00"; `consumo/page.tsx:176,179`). **G-i:** `getUsageByModel` (`queries.ts:612-646`) começa
  `custoUsd: 0` e só soma custo presente; uma linha com todas as execuções sem custo aparece como
  "US$ 0,000000" — ausência virando zero (invariante 11).
- **W** confere (`module-shell.tsx:157,191-199`; `floating-assistant-panel.tsx:175,182`;
  `sheet-largura.test.ts:20,25`). A primitiva tem `data-[side=left]:w-3/4` e
  `data-[side=left]:sm:max-w-sm`: a 390, a gaveta mede 292 px (¾) e passa a 272 (17 rem).
- **V** confere.

### R — Registrados (não consertados aqui)

Os do briefing (casca, lotes fechados, 03-D, texto do modelo, 300 notificações, os da 07-C), mais:

| Achado | Onde | Por que fica |
| --- | --- | --- |
| Paleta: fechar limpa a consulta no meio da animação; busca pendente repovoa a lista depois de fechar e o Enter da reabertura navega para item invisível; erro vira "Nada encontrado" | `search-command.tsx:60-62,83-88` | A D6 limita a casca a atributos e texto. Conserto proposto: zerar `timer` e incrementar `reqId` em `handleOpenChange(false)`, limpar o estado no fim da animação, e um estado `erro` |
| `ai_action_stuck` não avisa a `confirmada` sem execução | `notifications/ai-cron.ts:78-91` | Fora do lote; `/ia/acoes` passa a mostrá-la em "Precisam de atenção" |
| TO-DO, agenda, hábitos e estudos sem `*-links.ts`; o formato `/todo?v=…&task=` repetido em 7 lugares | `todo-preview.ts:108,234`, `adapters/{todo,calendar,habits,studies}.ts`, `calendar-preview.ts:25,316`, `habits*.ts`, e fora do lote `todo-card.tsx:63-64`, `quick-add.tsx:1425`, `generate.ts:485-486,543-544`, `search/queries.ts:155-156` | Criar os construtores cruza os módulos das 07-A/07-B e os 15 links à mão da 03-D em `search/queries.ts`. Os da IA ficam **presos pelo contrato** (o extrator passa a vê-los, e o V4 confere que a página lê cada parâmetro) |
| Rotas guardadas em constante (`ROTA_DO_PAINEL`, `rotaDaTarefa`, `ROTA_DA_AGENDA`) | `habits*.ts`, `todo-preview.ts`, `calendar-preview.ts` | O extrator casa `rota:`/`targetRoute:` com literal; a constante só é vista onde é usada como literal. O piso por arquivo mostra quantos pontos cada um tem |
| Links de finanças da IA e `href="/financeiro/lancamentos"` | `src/lib/ai/**/finance*`, `receipt-review.tsx:275` | 03-D |
| `Retry-After` / `done.finishReason` descartados | `chat-client.tsx:436-439` | Ninguém viu dar problema; o cabeçalho é sempre 5 s e a frase já diz "em instantes" |
| P5: `router.refresh()` recarrega a página por baixo do painel; Ctrl+I não olha o foco; intervalo de 30 s em toda página | `chat-client.tsx:455`, `floating-assistant.tsx:67-84` | Do briefing |
| Salvar notificações substitui o jsonb inteiro | `notifications-card.tsx` → `saveNotificationPrefs` | A action não muda; os tipos sem interruptor ficam ausentes = ligados (opt-out) |
| `getUsageByModel` corta em 5000 sem dizer | `queries.ts:621` | Teto invisível; mudar a consulta é outro passo |
| `/ia/acoes?filtro=` inválido vira "todas"; `/ia/comprovantes?doc=` inexistente some calado | `acoes/page.tsx:46`, `comprovantes/page.tsx:78` | Do briefing (registrar, não mudar) |
| `DeleteConfirmDialog` não trava `onOpenChange` durante o envio | `components/financeiro/delete-confirm-dialog.tsx:56` | Componente da 03-D (usar, não editar) |
| Vazio do sino em `<p>` | `notification-bell.tsx:104-106` | Um `EmptyState` na casca custaria nas 68 rotas |

---

## 5. O que foi reconfirmado antes de propor conserto (Passo 0, sem commit)

### (a) O ciclo de vida de `confirmada` sem execução

`confirmarAcaoDaIa` (`src/lib/actions/ai-actions.ts:70-115`) grava a decisão
(`registrarDecisao("confirmada")`) e **só depois** chama `executarAcaoAprovada`. Se a execução é
recusada — `EFEITO_MUDOU` (o hash recalculado diverge), `PROPOSTA_EXPIRADA` pelo relógio do
servidor (o banco **não** confere prazo na aprovação: a migration diz que o prazo mora em
`proposals.expires_at`), outro erro no claim — ou se o transporte cai entre as duas chamadas, a
proposta fica **`confirmada` para sempre, sem linha em `ai_action_executions`**:

- pelo claim-first (invariante 37), **nada foi aplicado** — a vaga nunca foi reservada;
- ela **nunca mais executa**: reconfirmar dá `PROPOSTA_JA_DECIDIDA` (`unique (proposal_id)`);
- `filtrarHistorico(…, "aguardando")` a conta (`history.ts:495`: `pendente || confirmada`);
- `ai_action_stuck` **não** a conta (`notifications/ai-cron.ts:78-91` só olha
  `ai_action_executions.status = 'executando'`);
- a action **nunca** devolve `executando`: o único "desfecho desconhecido" que o cartão consegue
  ver é a promise da Server Action **rejeitar** (transporte) — e hoje, sem try/catch
  (`proposal-card.tsx:115`), o cartão gira para sempre;
- `getAiActionHistory` (`approval/queries.ts:85-153`) lê propostas e execuções em **duas janelas
  independentes de 100 linhas**: uma execução fora da janela faria uma proposta executada parecer
  `confirmada`. Por isso a frase é "**não há execução registrada**", não "não foi executada".

### (b) `rotaDoDiario` não entra no hash

`rotaDoDiario` só é usada em `executar` → `targetRoute`; `prever` usa `ROTA_DO_DIARIO` sem query;
`serializarEfeito`/`hashDe` mapeiam `entidades` para `{tipo, id}`. **Nenhuma rota entra em hash
nenhum** — trocar `?date=` por `diaryLink()` não invalida proposta pendente. Mas
`ai_tool_calls.refs` e `ai_action_executions.target_route` já gravados com `?date=` são
**imutáveis**: por isso `/nutricao/diario` passa a aceitar `date` como apelido legado (`data`
vence).

### (c) "1,5" é recusado nos campos de orçamento

Demonstrado com um arquivo vitest temporário contra o schema real (apagado em seguida):

- `dailyBudget: Number("1,5")` → recusado,
  `{"dailyBudget":["Invalid input: expected number, received NaN"]}` — em inglês, num toast;
- `"1.5"` passa;
- `jobMonthlyBudget: Number("")` → `0`, e passa — enquanto a tela diz que o campo "não pode ficar
  em branco".

E, por cópia literal da função: `textoParaCentavos("12.50")` (`receipt-review.tsx:120-126`) =
**125000** centavos (R$ 1.250,00) — ela apaga todos os pontos.

---

## 6. A forma de cada item

### 6.1 D1 — estados do cartão e `/ia/acoes` (no principal, sem roteador)

**O desfecho é um dado do hook, não do cartão.** `useConversaDaIa` (acima do `<Sheet>`, como as
bolhas) guarda `desfechos: Record<proposalId, DesfechoDoCartao>`:

```ts
type DesfechoDoCartao =
  | { tipo: "pendente" }
  | { tipo: "enviando"; acao: "confirmar" | "recusar" }
  | { tipo: "executada" | "parcial" | "falhou"; rota: string | null }
  | { tipo: "recusada" }
  | { tipo: "nao_aplicada"; mensagem: string }   // ok:false do servidor (B)
  | { tipo: "sem_desfecho" };                    // a promise rejeitou
```

e expõe `decidir(id, desfecho)`. O `ProposalCard` vira controlado (`desfecho`, `onDesfecho`) e
ganha `onDecidiu`; todo desfecho **final** faz o hook despachar `{ tipo: "decidiu", id }` por
`onAtividade` (D3). Reabrir o painel mostra o mesmo cartão.

**`estadoDoCartao(desfecho, expiraEm, agora)`** — puro, em `src/lib/ai/cartao.ts` (só `import
type` de `approval/state`), com `cartao.test.ts`. Devolve o estado no vocabulário de `state.ts`
(`pendente | expirada | recusada | executando | executada | falhou | parcial`) ou o local
`nao_aplicada`, o rótulo (de `ROTULO_DO_ESTADO_DA_ACAO`; `nao_aplicada` → "Não aplicada"), se é
final, e o que pode ser clicado:

| Desfecho | Estado | Botões | Texto |
| --- | --- | --- | --- |
| pendente, dentro do prazo | pendente | Confirmar, Recusar | "O assistente preparou… não aplicou nada" |
| pendente, prazo vencido | expirada | **nenhum** | "Prazo encerrado — **nada foi aplicado**. Peça de novo ao assistente." |
| enviando (confirmar) | pendente | os dois travados, spinner **no Confirmar** | — |
| enviando (recusar) | pendente | os dois travados, spinner **no Recusar** ("Recusando…") | — |
| executada | executada | — | "A alteração já está no módulo." + "Ver o registro" (`rota`) |
| parcial | parcial (tom próprio, `TriangleAlert`) | — | "Parte dos itens falhou…" + `actionsLink()` |
| falhou | falhou (destrutivo, `CircleX`) **(A)** | — | "Começou e não terminou. Algo pode ter sido gravado — confira em Ações" + `actionsLink()` |
| recusada | recusada | — | "Nada foi alterado, e a recusa ficou registrada." |
| nao_aplicada | local **(B)** | **nenhum** | a frase do servidor (ela já diz "Nada foi alterado…") |
| sem_desfecho | executando ("sem desfecho registrado") | — | "A confirmação foi enviada e a resposta não voltou… confira em Ações" + `actionsLink()` |

`confirmar()` e `recusar()` ganham `try/catch`: rejeição → `sem_desfecho` (confirmar) ou volta a
`pendente` com toast (recusar — nada é aplicado em nenhum dos dois casos, e repetir é seguro: no
pior caso o servidor responde "já foi decidida"). `ok:false` → `nao_aplicada`. `status` →
`executada | parcial | falhou`, um a um (nunca mais `!== "sucesso"`). O prazo continua no relógio
do navegador (registrado: quem decide é o servidor).

**Um tom e um ícone por estado, de uma fonte só** — `src/components/ai/estado-da-acao.tsx`
(`CLASSE_DO_ESTADO`, `IconeDoEstado`), lida pelo cartão e por `/ia/acoes`: pendente `Clock`,
expirada `Hourglass`, recusada `Ban`, confirmada `CircleAlert`, executando `CircleHelp`,
executada `CircleCheck`, parcial `TriangleAlert`, falhou `CircleX`; cores pelos tokens
`--success/-ink`, `--warning/-ink` e `destructive` (nunca `text-success` em rótulo).

**`/ia/acoes`.** `filtrarHistorico`: `aguardando` = só `pendente`; `problemas` = `falhou |
parcial | executando | confirmada`. A linha `confirmada` ganha a explicação "Você confirmou e
**não há execução registrada** — pelo registro, nada foi aplicado. Isso acontece quando os dados
mudaram ou o prazo terminou entre a previsão e a confirmação. Peça de novo na conversa." O cartão
de contagem "Precisam de atenção" diz a composição ("1 confirmada sem execução · 1 sem desfecho
registrado"). `?filtro=aguardando` continua aceito (só conta menos). Filtros com
`aria-current="page"` (sai de `EXCECOES_MUDAS`); selo "sem trilha"; `ROTULO_DO_CAMPO` com `modulo`
e `expires_at`; `textoDoCampo(chave, valor)` puro (instante → `dd/MM/yyyy às HH:mm` em Brasília,
data pura como texto, uuid → "registro interno", booleano → Sim/Não); sem "· N ms".
`ROTULO_DO_ESTADO_DA_ACAO` **não muda**.

**Insights.** Confiança pelo rótulo (`ROTULO_DA_CONFIANCA`, não a chave), provedor por
`AI_PROVIDER_LABEL`, `promptVersion` fora da tela, `desfecho` do rodapé com rótulo; `aria-pressed`
no Útil/Não útil e no "Mostrar as N…"; a legenda "Inferência e sugestão" ganha uma linha curta
visível junto de "Ver dados usados".

### 6.2 D2 — gasto e permissão

**A frase de gasto é uma constante** em `@/lib/ai/constants` (puro, zero imports):
`CUSTO_DA_IA = "o custo estimado entra no seu orçamento e aparece em Consumo"` e
`AVISO_DE_GASTO = "Usa o provedor de IA que você configurou: " + CUSTO_DA_IA + "."`. Ela fica
**ao lado** de cada gatilho e é ligada a ele por `aria-describedby`:

- panoramas: a grade de 3 botões com a descrição **visível** (sai do `title`);
- compositor: uma linha sob o campo, ligada ao Enviar e ao interruptor da Caixa de entrada **(B)**;
- "Gerar análise": sob o seletor de módulo; o botão ganha **`useTransition` próprio** (o feedback
  dos cartões fica com o seu);
- comprovante: mantém o "Isso não tem como ser desfeito — " e passa a usar `CUSTO_DA_IA` **(B)**.

**Permissões: o que se vê é o que se salva.** `src/components/ai/preferencias-cascata.ts` (puro,
testado): `alternarLeitura(form, chave, valor)` — desligar a leitura desliga a escrita que
depende dela (`permissaoDeLeituraDaEscrita`, derivada do registry) e, se for o Financeiro,
`allowVision`; ligar **não liga nada além dela**. `alternarEscrita` — desligar a escrita do
Financeiro desliga `allowVision` **(A)**. O interruptor de escrita mostra `checked = leitura &&
escrita` e o de visão `checked = visao && allow_finance && allow_write_finance` (defesa contra
estado vindo do servidor). O aviso "Ligue antes a leitura de X" ganha id e `aria-describedby`, com
o token `--warning-ink`; o seletor de canto, desabilitado com o botão oculto, ganha a frase "Com o
botão oculto, o canto não se aplica — o atalho Ctrl+I continua abrindo o painel." A action e o
schema **não mudam** (o servidor continua ANDando, `ai-preferences.ts:90-120`).

**"Remover chave" confirma** num diálogo próprio (`remover-chave-dialog.tsx`, `next/dynamic` +
`useLazyDialog`, `DialogDescription`, trava de `onOpenChange` durante o envio): "A chave de
{Provedor} é apagada e o provedor é desativado. Para voltar, cole a chave de novo."

**Números: um conversor só** **(C)** — `src/lib/ai/numero.ts`, puro, zero imports, com teste:

- `lerDecimal(texto)` → `{ ok: true, valor: number | null } | { ok: false, motivo }`. Vírgula é
  sempre decimal (e os pontos, milhar); sem vírgula, um ponto seguido de 1 ou 2 dígitos é decimal
  e seguido de 3 é milhar ("1.250" → 1250, "12.50" → 12,5, "1,5" → 1,5). Vazio → `null`.
- `lerCentavos(texto)` — o mesmo, em centavos inteiros, para o comprovante (substitui
  `textoParaCentavos`).
- Quem chama decide se `null` é aceito: orçamento diário/mensal e limites do provedor aceitam
  ("sem limite"); teto do job, margem e limites de taxa **recusam no próprio campo** ("Informe um
  valor. Para a análise automática não gastar nada, use 0."), com `aria-invalid` +
  `aria-describedby`. Nada vira `0` por omissão.

**Varredura** (`ia-sistema-contratos.test.ts`): nenhum corpo de `useEffect`/`useLayoutEffect`
(extraído por casamento de chaves, sobre `semComentarios`) em `components/{ai,settings,
notifications,search}` e nas 4 pastas de rota do lote contém `fetch(`, `disparar(`, `enviar(`,
`iniciarExperiencia(`, `gerarInsight(` ou `extrairComprovante(`; e o único `fetch("/api/ia/chat"`
continua dentro de `disparar`.

### 6.3 D3 — painel e streaming (no principal, sem roteador)

- **Fase anunciada, nunca o texto.** O hook expõe `fase` (derivada dos eventos): `start` →
  "Respondendo…"; `tool` → "Consultando {módulo}…"; `switch` → `switch.motivo` (já em pt-BR);
  `proposta` → "Uma alteração aguardando você"; `done` → "Resposta concluída"; `error` → a
  mensagem; cancelar → "Resposta cancelada". A `ChatView` a escreve num `<p role="status"
  className="sr-only">`, que só muda quando a fase muda. Nenhum delta passa por ali.
- **`role="log"` com `aria-live="off"` explícito.** O papel `log` traz `aria-live="polite"`
  implícito, e com streaming ele leria cada pedaço — quem anuncia é só a região de status. Cada
  bolha ganha o autor em `sr-only` ("Você disse:" / "O assistente respondeu:").
- **O campo.** `<label className="sr-only">Mensagem para o assistente</label>`; o placeholder
  perde o "(Ctrl+Enter envia)", que vai para um `<span id>` ligado por `aria-describedby` junto da
  frase de gasto. Quando `enviando` volta a `false`, a `ChatView` devolve o foco ao campo **só se**
  ele estiver no `body` (não rouba foco de quem já foi para outro lugar).
- **Ids por `useId`** (`contexto-da-pagina`, `caixa-de-entrada` e os novos), o que fecha o G-h.
- **O botão flutuante** passa a `aria-label={aviso ? \`Abrir o assistente — ${aviso.texto}\` :
  "Abrir o assistente"}`, e o `<span className="sr-only">` sai — troca neutra na casca.
- **`decidiu`** — despachado pelo hook a cada desfecho final (§6.1). `EventoDoPainel` continua com
  6 membros; `painel.ts` continua sem import.
- **"Abrir esta conversa em tela cheia"** → `conversationLink(conversaId)` quando a conversa
  existe; `AI_LINK_BASE` quando ainda não. O hook passa a expor `conversaId`.
- **Intocados:** os 7 eventos SSE, `route.ts`, `chat-runner.ts`, o `AbortController`, o
  zeramento de texto **e** propostas no `switch` (invariantes 23 e 46 — as propostas zeradas levam
  junto as entradas delas em `desfechos`), o hook acima do `<Sheet>`, o `next/dynamic` com objeto
  literal, a lista de imports proibidos de `floating-assistant.tsx`, e os 6 testes de
  `painel-persistencia.test.ts` com a mesma contagem.
- **Bundle (A).** Cada passo de runtime mede `/ia` e `/ia/conversas/[id]` contra 210,3 e 209,7.
  Passou: o `ProposalCard` entra por `next/dynamic` (objeto literal), com esqueleto da altura do
  cartão — o estado já mora no hook. Ainda passou: o passo para e reporta.

### 6.4 D4 — Configurações

- **Segurança recolhida.** O `SecurityCard` mostra o e-mail de acesso e dois botões, "Alterar
  e-mail" e "Alterar senha". Cada um abre o seu formulário num diálogo próprio
  (`security-email-dialog.tsx`, `security-password-dialog.tsx`), carregado por `next/dynamic`
  (objeto literal) + `useLazyDialog`, com `DialogDescription` e trava de `onOpenChange` durante o
  envio. `react-hook-form`, `@hookform/resolvers` e `zod` saem do primeiro carregamento — o
  `SecurityCard` é o único card da rota que os importa. O resumo não afirma nada sobre a senha.
- **Erros em pt-BR por classe** — `src/components/settings/erros-de-auth.ts` (puro, testado):
  `invalid_credentials` (só na reautenticação) → "Senha atual incorreta." no campo;
  `over_request_rate_limit`/`over_email_send_rate_limit`/429 → "Muitas tentativas seguidas. Espere
  alguns minutos e tente de novo."; `weak_password` → "A nova senha não foi aceita: use uma senha
  mais forte."; `same_password` → "A nova senha é igual à atual."; `email_exists`/
  `email_address_invalid` → "Este e-mail não pode ser usado."; `AuthRetryableFetchError`/rede →
  "Não foi possível falar com o servidor de login. Nada foi alterado; tente de novo."; o resto →
  "Não foi possível concluir. Nada foi alterado." O texto do Supabase nunca chega cru à tela.
- **`loading.tsx`** em `/configuracoes`, `/busca`, `/ia/consumo`, `/ia/configuracoes` e
  `/ia/conversas` (que cobre `[id]`), com o `Skeleton` da primitiva no desenho de cada tela —
  deixam de herdar o esqueleto de bolhas.
- **Cascata (C1):** `getProviderCards` entra no `Promise.all`, encadeado ao `getCurrentUser()`.
- **`ai-card`:** `settingsLink()` no lugar de `"/ia/configuracoes"`; o texto falso vai para a T.
- **Teto:** `/configuracoes` tem de cair perto da mediana. Abaixo de 250, o teto próprio sai de
  `scripts/perf/bundle-budget.mjs` **no mesmo commit**. Em nenhum caso o teto sobe.

### 6.5 D5 — Notificações

- **Preferências.** `NOTIFICATION_PREF_GROUPS` ganha o grupo "Inteligência Artificial" só com
  `ai_insight_available`, e o card escreve sob ele: "Orçamento, provedor e ação sem desfecho não
  têm interruptor: avisam que algo está errado ou custando dinheiro." Os três ficam declarados numa
  constante `NOTIFICATION_TYPES_SEM_INTERRUPTOR` (com o motivo), em `settings/constants.ts`.
  `NOTIFICATION_TYPE_HINTS` ganha `ai_insight_available` ("Desligado por padrão. Quando ligado,
  avisa que uma análise nova ficou pronta em Análises.") e passa a ser exibido sob o rótulo de
  cada interruptor, por `aria-describedby`.
- **Teste derivado** (em `settings/constants.test.ts`): todo tipo de `NOTIFICATION_OPT_IN_TYPES`
  tem interruptor; todo tipo de `NOTIFICATION_TYPES` está num grupo **ou** em
  `NOTIFICATION_TYPES_SEM_INTERRUPTOR`, nunca nos dois.
- **`/notificacoes`.** Selo de texto "Não lida" na linha não lida; `aria-label` nos três filtros
  ("Situação", "Tipo", "Prioridade"); a URL sai de um construtor
  (`src/components/notifications/notificacoes-links.ts`, com teste que confere a leitura de cada
  chave pela página); com filtro ativo, o vazio diz "Nada com estes filtros" e oferece "Limpar
  filtros" (o construtor sem argumento); "Marcar todas como lidas" ganha, com filtro ativo, a
  frase "Inclui as não lidas que o filtro atual esconde." por `aria-describedby` (a action não
  muda); erros por `mensagemDaAction`.

### 6.6 D6 — Busca e casca

- **`/busca`.** O campo passa a `useUrlText(initialQuery, commit)`, com `commit` =
  `window.history.replaceState(null, "", buscaLink(v))` (construtor em
  `src/components/search/busca-links.ts`, com teste). A página monta `<BuscaClient key={q}>`:
  digitar não busca o RSC (o `replaceState` é integrado ao roteador do Next 16 —
  `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`, "Native
  History API"), e uma navegação externa remonta com os resultados do servidor. A busca do
  cliente (debounce de 220 ms) continua. Erro ≠ vazio: `catch` → estado `erro` → bloco
  `role="alert"` "Não foi possível buscar agora. Isso não quer dizer que não haja resultado." com
  "Tentar de novo". Menos de 2 caracteres → `EmptyState` de dica.
- **Paleta (casca, só atributos e texto).** O input ganha `role="combobox"`, `aria-expanded`,
  `aria-controls`, `aria-autocomplete="list"` e `aria-activedescendant`; os resultados, um
  `role="listbox"` com `role="group"` + rótulo por tipo e cada item `role="option"` +
  `aria-selected` + id; o item ativo rola para a vista (`scrollIntoView({ block: "nearest" })`) no
  próprio manipulador de tecla; `DialogDescription` em `sr-only` ("Setas escolhem, Enter abre, Esc
  fecha."); com 2+ caracteres, um rodapé "Ver todos os resultados para “q”" → `buscaLink(q)`, que
  também tira a `/busca` da orfandade (B3).
- **Sino (casca).** `aria-label={unreadCount > 0 ? \`Notificações — ${n} não lidas\` :
  "Notificações"}` com o selo `aria-hidden`; "não lida" em `sr-only` por item; "Marcar todas"
  desabilitado com zero não lidas.
- **Custo de casca: D3 + D6 ≤ +0,3 KB gz por rota.** Acima disso, o passo para e reporta.

### 6.7 D7 — Links e query string

- **Construtores — só onde o módulo tem `*-links.ts`:**
  - Dieta: `rotaDoDiario` e `REF_DIARIO` → `diaryLink(data)`; `diaryLink` ganha a data opcional
    (sem ela, `/nutricao/diario`) para `insights/collectors/nutrition.ts:46`; entra `goalsLink()`
    para `adapters/nutrition.ts:69`. `nutrition.test.ts:233-236` passa a afirmar `?data=`.
  - Treinos: `adapters/training.ts:94` → `sessionLink(id)`; entra `historyLink()` para
    `insights/collectors/training.ts:47`.
  - Medidas: `adapters/body.ts:63` → `measurementsLink()`.
  - Memória: `memory.ts:24` e `memory-preview.ts:21` → `memoryLink()`.
  - `/ia`: `actionsLink(filtro?)` aceita um valor de `FILTROS_DO_HISTORICO` (`stuckActionsLink`
    continua, e passa a chamá-lo); entra `receiptLink(docId)` (`?doc=`). As 13 telas do L2 passam
    a importar de `ai-links`. `AI_SECTIONS` continua sem import (o módulo de constantes é puro), e
    um teste afirma que os 8 hrefs dele são exatamente os dos construtores de base de `ai-links`.
  - Cada construtor novo ou alterado tem teste que confere, por `parametros-lidos.ts`, que a
    página lê cada chave.
- **Apelido legado:** `/nutricao/diario` lê `date` quando `data` falta (`data` vence). É a única
  edição em `nutricao/diario/page.tsx`, e cobre `ai_tool_calls.refs` e
  `ai_action_executions.target_route` já gravados (imutáveis).
- **`/tarefas?task=`** → `/tarefas` (`adapters/tasks.ts:58`, `tasks.test.ts:186`): a página não lê
  `task` e o V4 já trava isso.
- **O contrato da query string cobre o lote.** `deep-links-query-string.test.ts` ganha
  `/ia/acoes`, `/ia/comprovantes`, `/notificacoes` e `/busca` em `ROTAS`, com piso, e confere que
  cada parâmetro dos links é lido pela página e que `filtro` ∈ `FILTROS_DO_HISTORICO`.
  `notifications/ai.ts` entra em `SO_CONSTRUTOR` (zero rotas inline). Os arquivos de `src/lib/ai/**`
  que ainda montam rota à mão (TO-DO, agenda, hábitos, estudos, tarefas) entram em `ARQUIVOS`: o
  V4 passa a conferir que `/agenda`, `/todo`, `/habitos`, `/estudos/[id]` e `/tarefas` leem cada
  parâmetro que a IA manda.
- **O extrator aprende `rota:` e `targetRoute:`** — a mesma `pontosDeLink` (`links-inline.ts`),
  com a regex estendida para `\b(?:link|rota|targetRoute)\s*(?::|=(?![=>]))`. Nenhum segundo
  extrator. Cada arquivo da IA entra em `VARRIDOS` de `deep-links-inline.test.ts` com o seu piso
  (contado na caracterização) — um piso que cai denuncia ponto que sumiu da varredura.
- **Finanças da IA**: registrado (03-D).

### 6.8 D8 — Diálogos, formulários e alternâncias

- **`src/test/ia-sistema-dialogos.test.ts`** (pastas: `components/{ai,settings,notifications,
  search}` e as 4 de rota do lote):
  - todo diálogo de formulário que arrasta `zod`/`react-hook-form` entra por `next/dynamic` +
    `useLazyDialog` (os da Segurança, o de memória — que já entra —, e o de remover chave);
  - todo `DialogContent` do lote tem `DialogDescription` (ou `aria-describedby={undefined}`
    declarado com motivo);
  - todo diálogo que dispara action assíncrona trava `onOpenChange` enquanto ela roda;
  - exceções declaradas num `Map<arquivo, motivo>` que tem de continuar violando: os
    `DeleteConfirmDialog` com `trigger` (componente da 03-D, que recebe o próprio botão e por isso
    não pode ser lazy nem ter a trava acrescentada aqui).
- **Conversa:** "Excluir" e "Cancelar" desabilitados durante o envio, "Excluindo…", sem X durante o
  envio, `onOpenChange` travado; fecha (`setParaExcluir(null)`) e só então `router.refresh()`.
- **Memória:** a exclusão vira diálogo único da tela, controlado (§3, ponto 7); o formulário
  renderiza o erro de `modulo` (`ErroDoCampo` + `aria-invalid` no `SelectTrigger`) e trava
  `onOpenChange` durante `salvando`.
- **Retenção:** `onOpenChange` travado durante `enviando`.
- **`src/test/ia-sistema-formularios.test.ts`** — no molde da 07-C: o conjunto de actions é
  **derivado** (as exportadas de `src/lib/actions/{ai-*,settings,notifications}.ts` cujo corpo
  chama `invalid(`); toda tela do lote que importa uma delas tem de casar `PASSA_PELO_MAPA`
  (`mapServerFieldErrors(` | `mensagemDaAction(` | `errosDaAction(`) e não pode casar
  `REPASSE_CRU`; exceções num `Map` que tem de continuar existindo. Em `useState`, `errosDaAction`
  põe o erro sob o campo que existe e sobe o resto para o toast com o nome do campo
  (`ai-preferences-form`, `provider-card`, `regional-card`, `notifications-card`, `profile-card`,
  `retention-card`, `receipt-upload`, o `preparar` de `receipt-review`).
- **Rótulos:** comprovantes (`Label htmlFor` + ids nos `SelectTrigger`/`Input`, rótulo no
  `input type=file`) e insights (`Select`/`Input` com rótulo `sr-only`).
- **Alternâncias:** `aria-pressed` no favorito da conversa, no Útil/Não útil e no "Mostrar as N…";
  filtros de `/ia/acoes` com `aria-current="page"`, e a entrada de
  `seletor-de-visao.test.ts:186` sai no mesmo commit.

### 6.9 D9 — Gavetas

- `module-shell.tsx:157`: `className="data-[side=left]:w-[17rem] overflow-y-auto"`; o gatilho
  "Seções" ganha `aria-expanded={gavetaAberta}` + `aria-controls`.
- `floating-assistant-panel.tsx`: sai o `w-full` (morto: o `twMerge` já o perdia para
  `data-[side=right]:w-3/4`; a prévia mede a mesma largura antes e depois).
- `sheet-largura.test.ts`: as duas exceções (`:20`, `:25`) saem **no mesmo commit**.
- A 390, a gaveta de módulo vai de **292 px** (¾ da tela) para **272 px** (17 rem); no tablet
  (de `sm` até `lg`, onde ela some), de **384 px** (¾ da tela, limitado por
  `data-[side=left]:sm:max-w-sm`) para 272.

### 6.10 T e Z — textos e ausência

- **Contrato de verdade derivado do registry** (`ia-sistema-contratos.test.ts`): enquanto o
  registry tiver ferramenta de leitura, nenhum texto do lote afirma "não consulta seus registros";
  enquanto tiver de escrita (`toolsForWritePermission` não vazio), nenhum afirma "não cria nem
  altera nada". Os textos novos: `ai-card` — "O assistente lê só os módulos que você liberou, e
  nenhuma alteração acontece sem você confirmar na tela."; `confirmationMode` — "Guardado, mas
  ainda sem efeito: toda alteração da IA pede a sua confirmação, uma de cada vez, qualquer que seja
  o modo."; comprovante — "O lançamento é um só, com o valor total e como despesa pessoal…", sem
  "nesta versão" e sem o emoji.
- **Ausência:** `resumirNota(total: number | null, …)` e `explicar` aceitam o total nulo e
  escrevem "o total impresso não foi identificado"; a tela passa `efetiva.totalCentavos.valor`
  sem `?? 0`; o campo do total perde o `placeholder="0,00"` ("não identificado" quando vazio).
  `/ia/consumo`: célula de custo por função pura (`textoDoCusto(linha)`: todas sem custo → "não
  medido"; algumas → valor + "parcial"; nenhuma → valor), "sem custo" escreve `0`.

### 6.11 V — alinhamento visual (um commit por grupo)

Vazios pelo `EmptyState` (chat, consumo, insights sem módulo, busca com menos de 2 caracteres);
selos longos com `min-w-0 truncate` (`chat-client.tsx:640-655`, `proposal-card.tsx:199-201`);
nome do arquivo do comprovante com `truncate`/quebra; PDF × imagem com texto, não só ícone;
`opacity-70` do insight não vigente trocado por selo de texto. Grupos: chat e painel · ações e
insights · comprovantes, consumo e memória · configurações, notificações e busca.

---

## 7. Mutações — o critério de aceite

Aplicadas **uma a uma**, cada uma **compilando** (`npx tsc --noEmit` antes do vitest; em
`.filter`, `(v): boolean =>` por causa do TS 5.5). Registra-se o **nome** de cada teste que cai.
Restauração com `git restore`, conferida por `git diff --quiet`, **nunca** pelo verde. Mutação
verde é **medida** antes de ser chamada de fraqueza, e não é aceita: o teste é reforçado. A árvore
fica limpa antes (os testes já commitados).

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| M1 | o vencido volta a permitir Recusar | `cartao.test.ts` |
| M2 | `falhou` volta a virar parcial (`status !== "sucesso"`) | `cartao.test.ts` |
| M3 | a rejeição da promise volta a deixar o cartão em `enviando` | `cartao.test.ts` (+ contrato do `catch`) |
| M4 | `nao_aplicada` volta a ser não final (Confirmar clicável) | `cartao.test.ts` |
| M5 | o desfecho volta para um `useState` dentro do `ProposalCard` | `ia-sistema-contratos.test.ts` |
| M6 | o hook deixa de despachar `decidiu` | `ia-sistema-contratos.test.ts` |
| M7 | `aguardando` volta a incluir `confirmada` | `history.test.ts` |
| M8 | os filtros de `/ia/acoes` perdem `aria-current` | `seletor-de-visao.test.ts` (V1 estendida, sem a exceção) |
| M9 | o Útil perde `aria-pressed` | `seletor-de-visao.test.ts` / `ia-sistema-contratos.test.ts` |
| M10 | o interruptor de escrita volta a `checked={ligada}` | `ia-sistema-contratos.test.ts` |
| M11 | desligar a leitura deixa de desligar a escrita | `preferencias-cascata.test.ts` |
| M12 | ligar a leitura religa a escrita | `preferencias-cascata.test.ts` |
| M13 | `allowVision` sai da cascata | `preferencias-cascata.test.ts` |
| M14 | um gatilho perde o `aria-describedby` da frase de gasto | `ia-sistema-contratos.test.ts` |
| M15 | um `gerarInsight(` entra num `useEffect` | `ia-sistema-contratos.test.ts` (varredura) |
| M16 | "Gerar análise" volta a dividir a transição do feedback | `ia-sistema-contratos.test.ts` |
| M17 | o conversor volta a apagar todos os pontos | `numero.test.ts` |
| M18 | branco em campo obrigatório volta a virar 0 | `numero.test.ts` + contrato do formulário |
| M19 | a região de status passa a receber o texto da resposta | `ia-sistema-contratos.test.ts` |
| M20 | o `role="log"` perde o `aria-live="off"` | `ia-sistema-contratos.test.ts` |
| M21 | volta um `id="caixa-de-entrada"` fixo | `ia-sistema-contratos.test.ts` |
| M22 | o botão flutuante volta ao `aria-label` fixo | `ia-sistema-contratos.test.ts` |
| M23 | "Abrir em tela cheia" volta a `AI_LINK_BASE` fixo | `ia-sistema-contratos.test.ts` |
| M24 | um formulário da Segurança volta a import estático | `ia-sistema-dialogos.test.ts` |
| M25 | falha de rede volta a "Senha atual incorreta" | `erros-de-auth.test.ts` |
| M26 | `ai_insight_available` perde o interruptor | `settings/constants.test.ts` |
| M27 | o vazio com filtro perde "Limpar filtros" | `ia-sistema-contratos.test.ts` |
| M28 | `/busca` volta a `router.replace` por tecla | `ia-sistema-contratos.test.ts` |
| M29 | o erro da busca volta a "Nada encontrado" | `ia-sistema-contratos.test.ts` |
| M30 | a paleta perde `role="combobox"` ou o "Ver todos" | `ia-sistema-contratos.test.ts` |
| M31 | o sino volta ao `aria-label` fixo | `ia-sistema-contratos.test.ts` |
| M32 | `rotaDoDiario` volta a `?date=` | `nutrition.test.ts` + `deep-links-query-string.test.ts` |
| M33 | o diário deixa de aceitar `date` | `nutrition-links.test.ts` (leitura do apelido) |
| M34 | `/tarefas?task=` volta | `deep-links-query-string.test.ts` |
| M35 | uma tela volta a montar `/ia/…` à mão | `ia-sistema-contratos.test.ts` |
| M36 | um href de `AI_SECTIONS` diverge de `ai-links` | `ai-links.test.ts` |
| M37 | o extrator perde `rota:` | `deep-links-inline.test.ts` (piso por arquivo) |
| M38 | um formulário do lote volta a `toast.error(res.error)` | `ia-sistema-formularios.test.ts` |
| M39 | o formulário de memória para de mostrar o erro de `modulo` | `ia-sistema-contratos.test.ts` |
| M40 | a exclusão de conversa perde a trava de `onOpenChange` | `ia-sistema-dialogos.test.ts` |
| M41 | a retenção perde a trava de `onOpenChange` | `ia-sistema-dialogos.test.ts` |
| M42 | a gaveta de módulo volta a `w-[17rem]` sem prefixo | `sheet-largura.test.ts` |
| M43 | o painel volta a ter `w-full` | `sheet-largura.test.ts` |
| M44 | volta "não consulta seus registros" | `ia-sistema-contratos.test.ts` (contrato de verdade) |
| M45 | `resumirNota` volta a receber `?? 0` | `receipt-items.test.ts` + contrato |
| M46 | o consumo volta a escrever "US$ 0,000000" para linha sem custo | teste de `textoDoCusto` |

---

## 8. Orçamento de bundle

| Rota | Antes | Regra | Expectativa |
| --- | --- | --- | --- |
| `/(app)/configuracoes` | 282,1 | **tem de cair**; ≤ 285 sem subir o teto; < 250 → o teto próprio sai no mesmo commit | RHF + resolver + zod saem com os formulários da Segurança |
| `/(app)/ia` · `/ia/conversas/[id]` | 210,3 · 209,7 | ≤ antes | **o ponto mais apertado**: D1 + D2 + D3 acrescentam texto e lógica ao `chat-client` e ao `ProposalCard`; compensação pelo `ProposalCard` sob demanda (§6.3); se não couber, para e reporta |
| `/(app)/ia/configuracoes` | 218,6 | ≤ antes | entram a cascata e o conversor; sai o diálogo de remover chave do 1º carregamento |
| `/(app)/ia/comprovantes` | 209,4 | ≤ antes | entra o conversor (pequeno), troca o `textoParaCentavos` |
| demais 7 do lote | ver §2 | ≤ antes | texto e atributos; `/busca` ganha `useUrlText` (pequeno) e perde o `router.replace` |
| as 13 da §1.1 | valor final da 07-C (o medido aqui) | ≤ esse + custo declarado de casca + D9 | nenhum arquivo delas é tocado, salvo `module-shell` (D9) e o apelido do diário (`nutricao/diario`, que não está entre as 13) |
| demais 43 rotas | ver `rotas.txt` | ≤ antes + custo declarado de casca (D3 + D6 ≤ +0,3) + D9 | — |
| todas | — | nenhuma acima de 250, salvo `/configuracoes` enquanto tiver teto próprio | — |

Medido **depois de cada passo que toca runtime**, com os números no corpo do commit. Variação em
rota não tocada só vale como ruído **se provada**: build da base e do depois no mesmo ambiente,
chunks com o mesmo tamanho cru (os 206 da base estão em `C:\tmp\base-07d\chunks\`). A casca mede
D3 + D6 juntos; acima de +0,3 KB gz por rota, o passo para e reporta.

---

## 9. O que NÃO muda

- ⛔ **Nenhuma migration.** Nenhuma Server Action nova ou alterada (`src/lib/actions/**` só lido);
  nenhuma Route Handler nova; nenhum caminho novo de escrita.
- ⛔ **Nenhuma permissão cresce:** nenhuma ferramenta, command, agente ou chave `allow_*` nova;
  allowlist, `guard.ts` e registry intocados; toda chave continua nascendo `false`; religar a
  leitura **nunca** religa a escrita (agora também na tela).
- ⛔ **Nenhum gasto nasce:** nenhuma chamada a modelo no carregamento, na abertura do painel, na
  troca de rota ou em prefetch — e agora com varredura.
- ⛔ **Streaming:** os 7 eventos SSE, `route.ts`, `chat-runner.ts`, o `AbortController` e o
  zeramento no `switch` (invariantes 23 e 46).
- ⛔ **Painel:** `useConversaDaIa` acima do `<Sheet>`; `painel.ts` sem import e `EventoDoPainel`
  com 6 membros; a lista de imports de `floating-assistant.tsx`; `next/dynamic` com objeto literal.
- ⛔ **Dados sensíveis:** credenciais nunca em claro (invariante 7); o arquivo do comprovante
  continua com URL assinada a cada leitura e `storage_path` fora do client; nenhuma tela passa a
  mostrar conteúdo que a auditoria não guarda (invariante 20) — a formatação de `changed_fields` é
  só apresentação do que já está lá.
- ⛔ **Nenhuma rota morre e nenhum parâmetro deixa de ser aceito:** `/ia/acoes?filtro=` (inválido
  continua caindo em "todas"), `/ia/comprovantes?doc=`, `/notificacoes?status=&tipo=&prioridade=`,
  `/busca?q=`, `/ia/conversas/[id]`, os deep-links de `ai-links` e de `notifications/ai.ts`; e
  `/nutricao/diario` passa a aceitar **mais** (`date`).
- ⛔ **Arquivos que não são editados** — 03-D: `src/lib/finance/**`, `src/lib/dashboard/**`,
  `src/lib/reports/**`, `src/lib/actions/{transactions,receivables,installments,imports}*.ts`,
  `src/lib/validators/{split,receivable}*.ts`, `src/lib/validators/round-trip.test.ts`,
  `src/test/supabase-em-memoria*.ts`, `src/lib/settings/export-tables*.ts`,
  `src/lib/notifications/{generate,cron}*.ts`, `src/lib/search/queries.ts`,
  `src/lib/ai/tools/registry*.ts`, `src/lib/ai/**/finance*`, `src/types/{database,supabase}.ts`,
  `supabase/migrations/**`, `src/app/(app)/{dashboard,financeiro,relatorios,terceiros,faturas,
  parcelamentos}/**`, `src/components/{financeiro,dashboard}/**`; 07-A/B/C:
  `src/app/(app)/{todo,agenda,tarefas,rotinas,habitos,estudos,nutricao,treinos}/**` e
  `src/components/{todo,calendar,tasks,habits,studies,nutrition,training,body}/**` — **exceções
  da D7:** acréscimos em `src/lib/search/{nutrition,training}-links.ts` e o apelido `date` em
  `src/app/(app)/nutricao/diario/page.tsx`; casca: `src/components/layout/**`,
  `src/app/(app)/layout.tsx`, `src/config/nav.ts`, `src/lib/nav/**`, `src/components/quick-add/**`,
  os 11 `DASH_CARD_IDS` — **exceções da D6:** `notification-bell.tsx` e `search-command.tsx`;
  compartilhados (usar, não editar): `src/components/shared/{seletor-de-visao,abas-de-rota,
  sortable-list,empty-state,chart-skeleton,erro-do-campo}.tsx`, `{use-lazy-dialog,
  aria-de-progresso}.ts`, `src/components/reports/**`, `src/components/ui/**` — **exceção da D9:**
  só a classe da gaveta e o `aria-expanded` em `module-shell.tsx`. `seletor-de-visao.test.ts` e
  `sheet-largura.test.ts` só perdem exceções.
- ⛔ `src/lib/ai/**` (fora da 03-D) **não muda de comportamento**: as edições ali são construtores
  de link, o filtro de apresentação do histórico (D1, decisão do dono), `estadoDoCartao`,
  `numero.ts`, `resumirNota`/`explicar` aceitando nulo e constantes de texto.
- ⛔ `docs/redesign/STATUS.md` e os arquivos do §0 do briefing não são editados. Commits das 07-A,
  07-B e 07-C não são reescritos. Os worktrees `-07a`, `-07b`, `-07c` e os do roteador em `%TEMP%`
  não são tocados.
- Sem push, sem merge, sem deploy, sem upstream.

---

## 10. A prévia

Dados **sintéticos**, marcados na imagem ("PRÉVIA REDESIGN-07-D · DADOS SINTÉTICOS — nada aqui é
registro real"). Gerada **fora do repositório**, em `C:\tmp\previa-07d\` (`gerar.mjs`, `fotos.mjs`
e um módulo por página):

- HTML estático cujo **"antes" é lido do código do worktree**: as classes de `Button`/`Badge` (o
  `cva(` real), de `Card`/`Dialog`/`Sheet`/`Input`/`Textarea`/`Label`/`Select`/`Switch` (o primeiro
  literal do `cn(` de cada primitiva) e das telas (cada literal é **exigido** no arquivo — o
  gerador falha se ele sumir), combinadas pelo `twMerge(clsx())` real; os rótulos de
  `ROTULO_DO_ESTADO_DA_ACAO` lidos de `constants.ts`; ícones pelo `__iconNode` do `lucide-react`
  do worktree (os nomes antigos seguem o reexport).
- O `src/app/globals.css` real compilado com `postcss` + `@tailwindcss/postcss` do `node_modules`.
- Chrome headless, claro/escuro × 1280/390 (a 390 num `iframe`); foco por `el.focus()` no load;
  larguras medidas por `getBoundingClientRect()`.

Quatro páginas, 16 fotos:

- **estados** — o cartão em todos os estados que o código alcança (aguardando, prazo encerrado,
  recusando, aplicada, aplicada em parte, **falhou**, **não aplicada**, recusada, sem desfecho),
  antes × depois, e a sugestão em texto (igual nos dois);
- **chat** — panoramas com a descrição visível e a frase de gasto, o compositor com rótulo e a
  frase junto do Enviar, o botão flutuante com selo (o que o leitor ouve antes × depois), o painel
  aberto à direita a 1280 e embaixo a 390, com a região de status anotada e a largura medida;
- **ia** — `/ia/acoes` com os filtros anunciados e a contagem honesta, insights com a frase de
  gasto e os rótulos, `/ia/configuracoes` com a escrita dependendo da leitura, e os campos com
  vírgula e o teto em branco;
- **sistema** — `/configuracoes` com a Segurança recolhida e os erros por classe, as preferências
  com o grupo da IA, `/notificacoes` lida × não lida, vazio com filtro e "Marcar todas" com
  alcance, `/busca` com erro ≠ vazio, a paleta com combobox e "Ver todos", e o sino com a contagem
  no nome.

Conferido nas fotos: o anel de foco aparece nos dois temas; a 390 nada empurra a página; o painel
mede a mesma largura antes e depois (o `w-full` é morto); o resumo da Segurança não afirma nada
sobre a senha. As fotos **não** são commitadas (repositório público).

Duas correções que a prévia ensinou e que o desenho já incorpora: com dois `SheetOverlay` no mesmo
quadro, o segundo borrava o primeiro painel (a prévia usa um só, como o app); e o `85svh` mede a
janela inteira, então no quadro da prévia ele vira 85% (no app continua `85svh`).

⚠️ Antes de fechar o último passo, o gerador é **reapontado para o código final** e a prévia é
refotografada a partir dele.

---

## 11. Risco residual

| Risco | Por que fica |
| --- | --- |
| `/ia` e `/ia/conversas/[id]` não comportarem D1 + D2 + D3 | A regra é ≤ linha de base; a compensação prevista é o `ProposalCard` sob demanda. Se não bastar, o passo para e reporta (§6.3) |
| O desfecho do cartão vive na memória da aba | Recarregar perde o desfecho visto; a verdade continua em `/ia/acoes`, para onde os estados incertos apontam |
| "Sem desfecho registrado" não sabe se a decisão foi gravada | A promise rejeitou; o cartão erra para "pode não ter acontecido" e manda conferir em Ações (invariante 37 na tela) |
| A `confirmada` sem execução continua sem aviso no sino | `ai-cron.ts` está fora do lote; `/ia/acoes` passa a mostrá-la em "Precisam de atenção" |
| O G-h (label sequestrando o interruptor da página) e o anúncio das fases dependem do navegador e do leitor de tela | Sem teste de componente (invariante 25): a caracterização prova pela fonte, e a conferência fica no §13 |
| A paleta mantém os três defeitos de comportamento do R | A D6 limita a casca a atributos e texto |
| Rotas da IA em constante (`ROTA_*`, `rotaDaTarefa`) | O extrator vê o literal onde ele aparece com `rota:`/`targetRoute:`; o piso por arquivo denuncia o que sumir |
| TO-DO, agenda, hábitos e estudos sem construtor | Presos pelo contrato (V4 confere a leitura de cada parâmetro), não por construtor |
| Códigos de erro do Supabase mudam entre versões | Conferidos no `@supabase/auth-js` 2.108.2 instalado; o resto cai na frase genérica, que não culpa a senha |
| "1.25" lido como 1,25 e "1.250" como 1250 | É a regra declarada (ponto + 3 dígitos = milhar); a previsão mostra o valor antes de confirmar |
| Falha de ambiente CRLF | Não é código; confere-se que é a única e a mesma |

---

## 12. Ordem (um commit por passo)

Cada passo fecha com `npx vitest run` verde nos diretórios tocados (salvo a falha de ambiente),
`tsc`, `eslint` nos arquivos tocados e `git diff` revisado — nada de `.env`, chave, token,
`service_role`, `AI_MASTER_KEYS` ou chave de provedor, nem em fixture. Passo que toca runtime
mede build + bundle e escreve os números no corpo do commit. Cada defeito demonstrado sai em par:
caracterização `(1/2)` vermelha pelo motivo certo, conserto `(2/2)`. ⛔ Nenhum arquivo é editado
durante build ou dispatch do roteador.

0. Este desenho (só docs).
1. **D1, no principal** — cartão (G-a…G-d) e `/ia/acoes` (E2): `(1/2)` + `(2/2)`. Bundle `/ia`.
2. **D3, no principal** — painel e streaming (P1–P4, G-h): `(1/2)` + `(2/2)`. Bundle `/ia` e casca.
3. **D2** — gasto, permissões (G-e) e números (G-f, G-g): `(1/2)` + `(2/2)`.
4. **D4** — Configurações: Segurança sob demanda, erros, `loading.tsx`, cascata. Bundle
   `/configuracoes` (e o teto, se cair abaixo de 250).
5. **D5** — notificações.
6. **D6** — `/busca`, paleta e sino. Custo de casca D3 + D6 medido.
7. **D7** — links e contratos (extrator, V4, `ai-links`, apelido do diário).
8. **D8** — diálogos, formulários e alternâncias + `ia-sistema-dialogos.test.ts` e
   `ia-sistema-formularios.test.ts`.
9. **D9** — gavetas (+ `sheet-largura.test.ts` sem as 2 exceções, no mesmo commit).
10. **T e Z** — textos e ausência (contrato de verdade derivado do registry).
11. **V** — chat e painel · ações e insights · comprovantes, consumo e memória · configurações,
    notificações e busca (um commit cada).
12. Mutações M1–M46, uma a uma; os cinco comandos; `TZ=UTC npx vitest run` nos testes tocados;
    prévia refotografada do código final.

**Roteador:** cada passo substancial passa pelo `ai-router-br:route`, com o pacote fatiado por
passo. Desenho, decisões, acessibilidade, **os passos 1 e 2 inteiros** (D1 e D3 — Approval Engine
na tela e streaming) e o que tocar `src/lib/ai/**` ficam no principal. Lições já pagas: o
auto-init do roteador pode apagar o bloco "AI Router BR" do `CLAUDE.md` (`git restore CLAUDE.md`);
nenhum arquivo é editado durante um dispatch.

---

## 13. O que o dono confere à mão (logado no `npm run dev` do worktree)

Entregue como lista; **não** declarado feito.

- **Cartão:** confirmar uma proposta, fechar o painel e reabrir — o cartão continua "Aplicada" e o
  selo do botão baixou; deixar uma vencer — "Prazo encerrado", sem Recusar; com a rede desligada
  (DevTools "Offline") no clique — "Sem desfecho registrado", com o link para Ações.
- **`/ia/acoes`:** uma confirmada sem execução aparece em "Precisam de atenção", explicada, e não
  em "Aguardando você".
- **Leitor de tela (NVDA ou VoiceOver):** mandar uma pergunta — ouve-se "Respondendo…",
  "Consultando …", "Resposta concluída", **não** o texto pedaço a pedaço; o botão flutuante diz a
  frase do selo; o sino diz quantas não lidas; na paleta, as setas anunciam o item.
- **Painel sobre `/ia`:** clicar em "Caixa de entrada" no painel liga a do painel, não a da página.
- **Configurações da IA:** desligar a leitura de TO-DO desliga a escrita na hora; salvar; religar a
  leitura — a escrita **continua desligada**; "1,5" no orçamento diário salva; teto do job em
  branco recusa no campo; "Remover chave" pergunta antes.
- **Comprovante:** "12.50" e "12,50" viram R$ 12,50.
- **Segurança:** trocar a senha com a rede desligada — a mensagem fala de conexão, não de senha
  incorreta; os diálogos abrem e fecham com animação na 1ª e na 2ª vez.
- **Notificações:** ligar "IA · Análise disponível" e salvar; com um filtro ativo sem resultado,
  "Limpar filtros" volta à lista inteira.
- **Busca:** digitar rápido em `/busca` não perde caractere e não dispara uma busca no servidor por
  tecla (aba Rede); "Ver todos os resultados" da paleta leva à `/busca` com o termo.
- **Gavetas:** a de módulo abre a 272 px a 390, e o "Seções" diz se está aberto.
- **Celular:** a 390, nenhuma linha empurrando a página na horizontal (selos longos do chat e da
  proposta, nome do arquivo do comprovante).

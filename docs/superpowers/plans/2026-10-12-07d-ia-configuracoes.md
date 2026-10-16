# REDESIGN-07-D — IA, Configurações, Notificações e Busca · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mudar a aparência, o anúncio de estado e o carregamento das 12 telas do lote (`/ia/**`, `/configuracoes`, `/notificacoes`, `/busca`), do painel do assistente, do sino e da paleta — sem mudar nenhum dado, nenhuma permissão e sem fazer nascer nenhum gasto — e fechar os cinco caminhos em que a tela diz uma coisa e o sistema faz outra (spec §1). Cada correção presa por um teste confirmado por mutação.

**Architecture:** Server Component lê → `*-client.tsx` renderiza. As regras que a tela consome viram funções puras testadas em node (`estadoDoCartao`, a cascata de permissões, o conversor de números, os erros de auth, o texto do custo); o contrato com a tela é provado por **varredura do código-fonte sem comentários** (invariante 25 — o projeto não tem teste de componente), com `semComentarios` de `@/test/links-inline`. Estado que precisa sobreviver ao fechar da gaveta sobe para `useConversaDaIa` (invariante 95).

**Tech Stack:** Next.js 16 (Turbopack), React 19, Tailwind v4 CSS-first, shadcn/Radix, react-hook-form, Supabase auth-js 2.108.2, Vitest (ambiente `node`).

**Spec:** `docs/superpowers/specs/2026-10-11-07d-ia-configuracoes-design.md` (aprovado pelo dono em 2026-10-12). Em caso de conflito, o spec vence.

## Global Constraints

- Worktree `C:\Users\Yuri\Documents\Desenvolvedor\yuri.app.pessoal-07d`, branch `feat/redesign-07d-ia-configuracoes`, sempre por caminho absoluto. ⛔ Nada de `git checkout`/`switch`/`stash`/`reset` nem edição na pasta principal; nada nos worktrees `-07a`/`-07b`/`-07c` nem nos do roteador em `%TEMP%`; nenhum commit da 07-A/07-B/07-C reescrito.
- ⛔ Nenhuma migration; nenhuma Server Action nova ou alterada (`src/lib/actions/**` só leitura); nenhuma Route Handler nova; nenhum caminho novo de escrita.
- ⛔ Nenhuma permissão cresce: nenhuma ferramenta, command, agente ou chave `allow_*` nova; `guard.ts`, allowlist e registry intocados; toda chave nasce `false`; religar a leitura **nunca** religa a escrita.
- ⛔ Nenhum gasto nasce: nada chama modelo no carregamento, na abertura do painel, na troca de rota ou em prefetch.
- ⛔ Streaming intocado: os 7 eventos SSE, `route.ts`, `chat-runner.ts`, o `AbortController`, o zeramento de texto e propostas no `switch` (invariantes 23 e 46). `useConversaDaIa` acima do `<Sheet>`; `painel.ts` sem import, `EventoDoPainel` com 6 membros; a lista de imports proibidos de `floating-assistant.tsx`; `next/dynamic` com **objeto literal escrito ali mesmo**; os 6 testes de `painel-persistencia.test.ts` com a mesma contagem.
- ⛔ Arquivos de outros lotes (spec §9) não são editados. Exceções declaradas: D7 → acréscimos em `src/lib/search/{nutrition,training}-links.ts` e o apelido `date` em `src/app/(app)/nutricao/diario/page.tsx`; D6 → `notification-bell.tsx` e `search-command.tsx` (só atributos e texto); D9 → só a classe da gaveta e o `aria-expanded` em `module-shell.tsx`. `seletor-de-visao.test.ts` e `sheet-largura.test.ts` só perdem exceções. `docs/redesign/STATUS.md` não é editado.
- ⛔ Dados sensíveis: credenciais nunca em claro; URL assinada do comprovante a cada leitura; `storage_path` fora do client; nenhuma tela mostra o que a auditoria não guarda.
- ⛔ Nenhuma rota morre; nenhum parâmetro deixa de ser aceito (spec §9).
- Bundle: `/(app)/configuracoes` **cai**, ≤ 285 sem subir o teto (< 250 → o teto próprio sai de `scripts/perf/bundle-budget.mjs` no mesmo commit); as outras 11 do lote ≤ a linha de base (`C:\tmp\base-07d\rotas.txt`); as 13 da §1.1 ≤ o medido + custo declarado de casca + D9; as demais 43 ≤ a base + casca (D3 + D6 ≤ **+0,3 KB gz**) + D9; nenhuma acima de 250 salvo `/configuracoes` com teto próprio. Medidor: `node C:\tmp\base-07d\medir-rotas.mjs <worktree> <saida.json>` (imprime as 68 rotas e grava `rota → { kb, gz, chunks }`), depois de `npm run build`. Variação em rota não tocada só é ruído **se provada** (mesmo ambiente, chunks com o mesmo tamanho cru; base em `C:\tmp\base-07d\chunks\`).
- Varreduras usam `semComentarios` de `@/test/links-inline`. Nenhum segundo extrator de links.
- Dados sintéticos em fixture e prévia (repositório público). `.env.local` nunca commitado.
- Commits: título pt-BR sem acentos `feat(redesign): 07-D …` / `test(redesign): 07-D …`; corpo com o que mudou/não mudou, testes, bundle (quando runtime, com o custo de casca quando houver), a `summary_line` do roteador **copiada literalmente**, o que ficou de fora; termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Cada passo: `npx vitest run <dirs tocados>`, `npx tsc --noEmit`, `npx eslint <arquivos tocados>`, `git diff` revisado. ⛔ Não editar arquivo durante build nem durante dispatch do roteador. Depois do primeiro dry-run, `git status` (auto-init pode apagar o bloco do `CLAUDE.md` → `git restore CLAUDE.md`).
- Única falha aceita na suíte: `src/lib/ai/approval/schema.test.ts › as travas que o código não pode contornar › a FK da aprovação carrega o hash, amarrando-o ao effect_hash da proposta` (CRLF).
- Sem push, sem merge, sem deploy, sem upstream.

## Review Focus

1. **Proposta vencida enquanto o clique está no ar** — o dono clica Confirmar aos 9:59 e o servidor responde `PROPOSTA_EXPIRADA`: o cartão vira "Não aplicada" com a frase do servidor (não "Prazo encerrado" local, e nunca volta a oferecer Confirmar). Teste em `cartao.test.ts` (Task 1): `desfechoDaConfirmacao({ ok: false, mensagem })` é final mesmo com `expiraEm` no futuro.
2. **Valor com milhar e decimal juntos** — "1.234,56", "1.234", "0,5", ",5", "12.", "1.2.3", "-1", " 7 ": o conversor nunca devolve `NaN`, nunca inventa zero e recusa com motivo o que não é número. Testes em `numero.test.ts` (Task 2).
3. **Cascata com a escrita já desligada e com chave sem escrita** — desligar a leitura de Treinos (que não tem chave de escrita) não mexe em nada além dela; desligar a escrita do Financeiro com `allowVision` já falso não altera o resto. Testes em `preferencias-cascata.test.ts` (Task 2).
4. **`switch` com cartão já decidido** — uma troca de tentativa zera as propostas da última bolha; um desfecho guardado de proposta que sumiu não pode contaminar a próxima (ids novos) nem gerar `decidiu` fantasma. Teste de contrato em `ia-sistema-contratos.test.ts` (Task 3): o `onSwitch` limpa as entradas das propostas zeradas.
5. **Erro do Supabase sem `code`** (versão antiga, proxy, `TypeError: Failed to fetch`) — cai na frase genérica, que não culpa a senha. Teste em `erros-de-auth.test.ts` (Task 4).

---

### Task 1: D1 — estados do cartão e `/ia/acoes` (no principal, sem roteador)

**Roteador:** dry-run só para registrar a `summary_line` (spec §12: o passo 1 inteiro fica no principal).

**Files:**
- Create: `src/lib/ai/cartao.ts`, `src/lib/ai/cartao.test.ts`
- Create: `src/components/ai/estado-da-acao.tsx` (tom + ícone por estado, fonte única)
- Create: `src/test/ia-sistema-contratos.test.ts` (o molde `CONTRATOS`/`PROIBIDOS` da 07-C; cresce nas Tasks seguintes)
- Modify: `src/components/ai/proposal-card.tsx` (controlado opcional, `estadoDoCartao`, `try/catch`, `onDecidiu`)
- Modify: `src/components/ai/chat-client.tsx` (o hook guarda `desfechos`; `ChatView` passa ao cartão)
- Modify: `src/lib/ai/approval/history.ts:495-499` + `history.test.ts` (fixture com `confirmada`)
- Modify: `src/components/ai/action-history-client.tsx` (tom/ícone da fonte única; `confirmada` explicada; `aria-current`; selo "sem trilha"; `ROTULO_DO_CAMPO`; `textoDoCampo`; sem "· N ms")
- Modify: `src/app/(app)/ia/acoes/page.tsx` (a dica do cartão "Precisam de atenção")
- Modify: `src/components/ai/insights-client.tsx`, `src/app/(app)/ia/insights/page.tsx`, `src/components/ai/source-chips.tsx` (E3/E4)
- Modify: `src/components/shared/seletor-de-visao.test.ts:186` (a exceção sai)

**Interfaces (o que os testes exigem):**
- `src/lib/ai/cartao.ts` (importa só `import type { EstadoDaProposta } from "./approval/state"` e `ROTULO_DO_ESTADO_DA_ACAO` de `./constants`):
  - `type DesfechoDoCartao = { tipo: "pendente" } | { tipo: "enviando"; acao: "confirmar" | "recusar" } | { tipo: "executada" | "parcial" | "falhou"; rota: string | null } | { tipo: "recusada" } | { tipo: "nao_aplicada"; mensagem: string } | { tipo: "sem_desfecho" }`
  - `type EstadoDoCartao = Exclude<EstadoDaProposta, "confirmada"> | "nao_aplicada"`
  - `type VistaDoCartao = { estado: EstadoDoCartao; rotulo: string; final: boolean; podeConfirmar: boolean; podeRecusar: boolean; girando: "confirmar" | "recusar" | null }`
  - `estadoDoCartao(desfecho: DesfechoDoCartao, expiraEm: string, agora: number): VistaDoCartao`
  - `desfechoDaConfirmacao(r: { ok: true; status: "sucesso" | "parcial" | "falhou"; rota: string | null } | { ok: false; mensagem: string }): DesfechoDoCartao`
  - `DESFECHO_INICIAL: DesfechoDoCartao` (`{ tipo: "pendente" }`)
- `estado-da-acao.tsx`: `CLASSE_DO_ESTADO: Record<EstadoDaProposta | "nao_aplicada", string>`, `IconeDoEstado({ estado, className? })`.
- `ProposalCard` props: `proposta`, `aoAplicar?`, `desfecho?: DesfechoDoCartao`, `onDesfecho?: (d: DesfechoDoCartao) => void`, `onDecidiu?: (id: string) => void`. Sem `desfecho`/`onDesfecho`, guarda estado próprio (comprovantes, insights e desfazer continuam iguais).
- `ConversaDaIa` ganha `desfechos: Readonly<Record<string, DesfechoDoCartao>>`, `registrarDesfecho(id: string, d: DesfechoDoCartao): void`.

- [ ] **Step 1: dry-run do roteador** — `ai-router-br:route` com o pacote da Task 1; registrar a `summary_line`; `git status` (restaurar `CLAUDE.md` se o auto-init o tocou).

- [ ] **Step 2: caracterização (1/2), vermelha pelo motivo certo.** `cartao.test.ts` com a tabela do spec §6.1, um caso por linha, `agora` injetado:

```ts
import { describe, expect, it } from "vitest";
import { DESFECHO_INICIAL, desfechoDaConfirmacao, estadoDoCartao } from "./cartao";

const AGORA = Date.parse("2026-10-12T12:00:00.000Z");
const DEPOIS = "2026-10-12T12:07:00.000Z";
const ANTES = "2026-10-12T11:59:00.000Z";

describe("estadoDoCartao", () => {
  it("pendente no prazo: os dois botões", () => {
    expect(estadoDoCartao(DESFECHO_INICIAL, DEPOIS, AGORA)).toEqual({
      estado: "pendente", rotulo: "aguardando você", final: false,
      podeConfirmar: true, podeRecusar: true, girando: null,
    });
  });
  it("vencido: prazo encerrado, nenhum botão (M1)", () => {
    const v = estadoDoCartao(DESFECHO_INICIAL, ANTES, AGORA);
    expect(v).toMatchObject({ estado: "expirada", final: true, podeConfirmar: false, podeRecusar: false });
  });
  it("recusando: o spinner fica no Recusar", () => {
    expect(estadoDoCartao({ tipo: "enviando", acao: "recusar" }, DEPOIS, AGORA))
      .toMatchObject({ girando: "recusar", podeConfirmar: false, podeRecusar: false });
  });
  it("enviando não vence no meio do envio", () => {
    expect(estadoDoCartao({ tipo: "enviando", acao: "confirmar" }, ANTES, AGORA).estado).toBe("pendente");
  });
  it("cada desfecho final tem o seu estado (M2, M25, M27)", () => {
    const final = (d: Parameters<typeof estadoDoCartao>[0]) => estadoDoCartao(d, DEPOIS, AGORA);
    expect(final({ tipo: "executada", rota: "/x" }).estado).toBe("executada");
    expect(final({ tipo: "parcial", rota: null }).estado).toBe("parcial");
    expect(final({ tipo: "falhou", rota: null }).estado).toBe("falhou");
    expect(final({ tipo: "recusada" }).estado).toBe("recusada");
    expect(final({ tipo: "sem_desfecho" })).toMatchObject({ estado: "executando", rotulo: "sem desfecho registrado" });
    expect(final({ tipo: "nao_aplicada", mensagem: "m" })).toMatchObject({ estado: "nao_aplicada", rotulo: "não aplicada", final: true, podeConfirmar: false, podeRecusar: false });
  });
});

describe("desfechoDaConfirmacao", () => {
  it("status vira desfecho um a um, nunca `!== sucesso` (M25)", () => {
    expect(desfechoDaConfirmacao({ ok: true, status: "falhou", rota: null })).toEqual({ tipo: "falhou", rota: null });
    expect(desfechoDaConfirmacao({ ok: true, status: "parcial", rota: "/r" })).toEqual({ tipo: "parcial", rota: "/r" });
    expect(desfechoDaConfirmacao({ ok: true, status: "sucesso", rota: "/r" })).toEqual({ tipo: "executada", rota: "/r" });
  });
  it("recusa do servidor é final mesmo dentro do prazo (Review Focus 1)", () => {
    const d = desfechoDaConfirmacao({ ok: false, mensagem: "A proposta expirou." });
    expect(estadoDoCartao(d, DEPOIS, AGORA)).toMatchObject({ estado: "nao_aplicada", final: true, podeConfirmar: false });
  });
});
```

  E em `history.test.ts`, um caso novo (o fixture existente segue igual): uma proposta com aprovação `confirmada` e **sem** execução cai em `"problemas"` e não em `"aguardando"` (M3). Em `ia-sistema-contratos.test.ts`: `proposal-card.tsx` não contém `"Confirmar antes de aplicar"` e chama `estadoDoCartao(`; `confirmar` tem `catch`; `IconeDoEstado` vem de `estado-da-acao`; `action-history-client.tsx` importa de `estado-da-acao` e os filtros têm `aria-current`; `chat-client.tsx` passa `desfecho=` e `onDecidiu=` ao `ProposalCard`. Rodar: `npx vitest run src/lib/ai/cartao.test.ts src/lib/ai/approval/history.test.ts src/test/ia-sistema-contratos.test.ts` → FALHA (módulo ausente / `aguardando` conta a confirmada / contratos). Commit `test(redesign): 07-D D1 (1/2) — caracterizacao dos estados do cartao e da contagem de /ia/acoes`.

- [ ] **Step 3: conserto (2/2).**
  - `cartao.ts` conforme a interface; `rotulo` de `ROTULO_DO_ESTADO_DA_ACAO[estado]`, `"não aplicada"` para o local.
  - `estado-da-acao.tsx`: pendente `Clock` primário; expirada `Hourglass` e recusada `Ban` (muted); confirmada `CircleAlert` e executando `CircleHelp` e parcial `TriangleAlert` (`border-warning/50 bg-warning/5 text-warning-ink`); executada `CircleCheck` (`border-success/40 bg-success/5 text-success-ink`); falhou `CircleX` (destructive); `nao_aplicada` como confirmada.
  - `proposal-card.tsx`: cabeçalho = ícone + rótulo com inicial maiúscula + selo da ferramenta (`max-w-full min-w-0 truncate`); corpo por estado (spec §6.1, tabela); `confirmar`/`recusar` com `try/catch`; `onDecidiu?.(proposta.id)` quando a vista vira `final`; o intervalo de 30 s só enquanto `pendente`.
  - `chat-client.tsx`: `const [desfechos, setDesfechos] = React.useState<Record<string, DesfechoDoCartao>>({})`; `registrarDesfecho`; no `onSwitch`, apagar de `desfechos` as propostas da última bolha; `ChatView` → `<ProposalCard proposta={p} desfecho={desfechos[p.id] ?? DESFECHO_INICIAL} onDesfecho={(d) => registrarDesfecho(p.id, d)} onDecidiu={avisarDecisao} />` (`avisarDecisao` chega na Task 3; aqui um no-op exportado pelo hook).
  - `history.ts`: `aguardando` → `l.estado === "pendente"`; `problemas` acrescenta `confirmada`; o comentário do `:480` explica.
  - `action-history-client.tsx` + `acoes/page.tsx` + insights/source-chips conforme spec §6.1 e §3 pontos 1–2.
  - `seletor-de-visao.test.ts`: tirar a linha 186.
- [ ] **Step 4:** `npx vitest run src/lib/ai src/components src/test` verde (salvo CRLF); `npx tsc --noEmit`; `npx eslint` nos tocados.
- [ ] **Step 5: bundle** — `npm run build` + medidor: `/ia`, `/ia/conversas/[id]`, `/ia/acoes`, `/ia/insights`, `/ia/comprovantes` ≤ base. Passou em `/ia`/`/ia/conversas/[id]`: `ProposalCard` por `next/dynamic` (objeto literal) no `chat-client` com esqueleto da altura do cartão; ainda passou → parar e reportar.
- [ ] **Step 6: commit** `feat(redesign): 07-D D1 (2/2) — o cartao fala o vocabulario do Approval Engine e /ia/acoes conta o que espera voce` com os números.

### Task 2: D2 — gasto, permissões e números (no principal)

**Files:**
- Create: `src/lib/ai/numero.ts`, `src/lib/ai/numero.test.ts`
- Create: `src/components/ai/preferencias-cascata.ts`, `src/components/ai/preferencias-cascata.test.ts`
- Create: `src/components/ai/remover-chave-dialog.tsx`
- Modify: `src/lib/ai/constants.ts` (`CUSTO_DA_IA`, `AVISO_DE_GASTO`)
- Modify: `src/components/ai/chat-client.tsx` (panoramas em grade com descrição visível; frase sob o compositor; `aria-describedby`)
- Modify: `src/components/ai/insights-client.tsx` (frase + `useTransition` próprio do Gerar)
- Modify: `src/components/ai/receipt-extract-button.tsx` (`CUSTO_DA_IA`)
- Modify: `src/components/ai/ai-preferences-form.tsx` (cascata, `checked` derivado, `aria-describedby`, canto explicado, conversor, erro no campo)
- Modify: `src/components/ai/provider-card.tsx` (conversor nos limites; "Remover chave" abre o diálogo)
- Modify: `src/components/ai/receipt-review.tsx` (`lerCentavos` no lugar de `textoParaCentavos`)
- Modify: `src/test/ia-sistema-contratos.test.ts`

**Interfaces:**
- `numero.ts` (zero imports): `type Leitura = { ok: true; valor: number | null } | { ok: false; motivo: string }`; `lerDecimal(texto: string): Leitura`; `lerCentavos(texto: string): { ok: true; valor: number | null } | { ok: false; motivo: string }` (inteiro); `lerInteiro(texto: string): Leitura`; `exigirValor(l: Leitura, motivoSeVazio: string): Leitura` (vazio → `{ ok: false, motivo }`).
- `preferencias-cascata.ts`: `type PermissoesDoForm = { permissions: Record<ToolPermission, boolean>; writePermissions: Record<ToolWritePermission, boolean>; allowVision: boolean }`; `alternarLeitura<T extends PermissoesDoForm>(f: T, chave: ToolPermission, valor: boolean): T`; `alternarEscrita<T extends PermissoesDoForm>(f: T, chave: ToolWritePermission, valor: boolean): T`; `escritaVisivel(f, chave): boolean`; `visaoVisivel(f): boolean`. A dependência sai de `permissaoDeLeituraDaEscrita` (registry), nunca de lista à mão.

- [ ] **Step 1: caracterização (1/2).** `numero.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exigirValor, lerCentavos, lerDecimal, lerInteiro } from "./numero";

describe("lerDecimal", () => {
  it.each([
    ["1,5", 1.5], ["1.5", 1.5], ["12.50", 12.5], ["1.250", 1250], ["1.234,56", 1234.56],
    ["0,5", 0.5], [" 7 ", 7], ["0", 0],
  ])("%s → %s", (t, v) => expect(lerDecimal(t)).toEqual({ ok: true, valor: v }));
  it("vazio é ausência, nunca zero (M35)", () => expect(lerDecimal("  ")).toEqual({ ok: true, valor: null }));
  it.each(["abc", "1.2.3", "1,2,3", "-1", "1e3"])("%s é recusado com motivo", (t) => {
    const r = lerDecimal(t);
    expect(r.ok).toBe(false);
  });
});
describe("lerCentavos", () => {
  it("o ponto decimal não multiplica por 100 (M34)", () => {
    expect(lerCentavos("12.50")).toEqual({ ok: true, valor: 1250 });
    expect(lerCentavos("12,50")).toEqual({ ok: true, valor: 1250 });
    expect(lerCentavos("1.250,00")).toEqual({ ok: true, valor: 125000 });
  });
});
describe("exigirValor", () => {
  it("campo obrigatório em branco recusa no campo", () => {
    expect(exigirValor(lerDecimal(""), "Informe um valor.")).toEqual({ ok: false, motivo: "Informe um valor." });
  });
});
describe("lerInteiro", () => {
  it("recusa fração", () => expect(lerInteiro("1,5").ok).toBe(false));
});
```

  `preferencias-cascata.test.ts`: desligar `allow_todo` desliga `allow_write_todo` (M6); ligar `allow_todo` com a escrita desligada **não** a liga (M31); desligar `allow_finance` desliga `allow_write_finance` **e** `allowVision`, e desligar `allow_write_finance` desliga `allowVision` (M32); desligar `allow_training` (sem chave de escrita) só muda ela; `escritaVisivel` = leitura && escrita. Contratos: o switch de escrita não usa `checked={ligada}` (M30); panoramas, compositor e Gerar ligam `AVISO_DE_GASTO` por `aria-describedby` (M4); `gerar` tem `useTransition` próprio (M33); a varredura de `useEffect` (spec §6.2, M5); `ai-preferences-form.tsx` não contém `Number(form.` (M7). Commit `test(redesign): 07-D D2 (1/2) — …`.

- [ ] **Step 2: conserto (2/2)** conforme spec §6.2 (o servidor continua ANDando; schema e action intactos). `remover-chave-dialog.tsx` por `next/dynamic` + `useLazyDialog`, `DialogDescription`, `onOpenChange` travado durante o envio.
- [ ] **Step 3:** testes + tsc + eslint; bundle de `/ia`, `/ia/configuracoes`, `/ia/insights`, `/ia/comprovantes` ≤ base.
- [ ] **Step 4: commit** `feat(redesign): 07-D D2 (2/2) — gasto dito antes do clique, o que se ve e o que se salva, e numeros sem zero inventado`.

### Task 3: D3 — painel e streaming (no principal)

**Files:**
- Modify: `src/components/ai/chat-client.tsx` (`fase` no hook; `role="status"` sr-only; `role="log"` + `aria-live="off"`; autor sr-only; rótulo do campo; foco de volta; `useId`; `conversaId` e `avisarDecisao` expostos)
- Modify: `src/components/ai/floating-assistant.tsx` (nome com a frase do selo; sai o `<span sr-only>`)
- Modify: `src/components/ai/floating-assistant-panel.tsx` (passa `onAtividade` ao hook já passado; link para `conversationLink(conversaId)`)
- Modify: `src/test/ia-sistema-contratos.test.ts`

**Interfaces:** `ConversaDaIa` ganha `fase: string | null`, `conversaId: string | null`, `avisarDecisao(id: string): void` (despacha `{ tipo: "decidiu", id }` por `onAtividade`).

- [ ] **Step 1: caracterização (1/2)** em `ia-sistema-contratos.test.ts`: a `ChatView` tem `role="status"` cujo conteúdo é `{fase}` e nunca `texto`/`b.content` (M8, M36); `role="log"` com `aria-live="off"` (M37); nenhum `id="contexto-da-pagina"`/`id="caixa-de-entrada"` literal, `useId(` presente (M9, G-h); `floating-assistant.tsx` sem `aria-label="Abrir o assistente"` literal e com `aviso.texto` no `aria-label` (M10); o hook chama `onAtividade?.({ tipo: "decidiu"` (M11); o painel usa `conversationLink(` (M12); o `onSwitch` limpa `desfechos` (Review Focus 4); `painel-persistencia.test.ts` continua com 6 testes. Commit `test(redesign): 07-D D3 (1/2) — …`.
- [ ] **Step 2: conserto (2/2)** conforme spec §6.3.
- [ ] **Step 3:** testes + tsc + eslint; build + medidor: `/ia`, `/ia/conversas/[id]` ≤ base (compensação da §6.3) e o custo de casca de `floating-assistant.tsx` (a soma D3 + D6 fecha na Task 6).
- [ ] **Step 4: commit** `feat(redesign): 07-D D3 (2/2) — o chat anuncia as fases, o selo tem nome e o painel abre a mesma conversa`.

### Task 4: D4 — Configurações

**Files:** Create `src/components/settings/security-email-dialog.tsx`, `security-password-dialog.tsx`, `erros-de-auth.ts`, `erros-de-auth.test.ts`; `src/app/(app)/{configuracoes,busca}/loading.tsx`, `src/app/(app)/ia/{consumo,configuracoes,conversas}/loading.tsx`. Modify `security-card.tsx`, `configuracoes/page.tsx` (cascata), `ai-card.tsx` (`settingsLink()`), `scripts/perf/bundle-budget.mjs` (só se < 250).

**Interfaces:** `mensagemDeErroDeAuth(erro: unknown, etapa: "reautenticar" | "trocar-senha" | "trocar-email"): { campo: "current_password" | null; mensagem: string }`.

- [ ] Teste puro primeiro (`invalid_credentials` na reautenticação → campo + "Senha atual incorreta."; rede/`AuthRetryableFetchError`/`TypeError` sem `code` → "Não foi possível falar com o servidor de login. Nada foi alterado; tente de novo." e **sem** campo (M38, Review Focus 5); 429/`over_*_rate_limit`; `weak_password`; `same_password`; `email_exists`/`email_address_invalid`; desconhecido → genérica). Contrato em `ia-sistema-dialogos.test.ts` nasce aqui com a regra dos formulários da Segurança por `next/dynamic` (M13).
- [ ] Conserto conforme spec §6.4; bundle de `/configuracoes` antes × depois.
- [ ] Roteador: dry-run; fatia elegível (loading.tsx, cascata) pode ir a worker; a Segurança fica no principal (acessibilidade). Commit `feat(redesign): 07-D D4 — …`.

### Task 5: D5 — Notificações

**Files:** Modify `src/lib/settings/constants.ts` (+ `constants.test.ts`), `src/components/settings/notifications-card.tsx`, `src/app/(app)/notificacoes/notifications-client.tsx`; Create `src/components/notifications/notificacoes-links.ts` + teste.

- [ ] Teste derivado primeiro (M16): todo `NOTIFICATION_OPT_IN_TYPES` tem interruptor; todo `NOTIFICATION_TYPES` está num grupo ou em `NOTIFICATION_TYPES_SEM_INTERRUPTOR`, nunca nos dois. Contratos: selo "Não lida", `aria-label` nos três filtros, vazio com filtro + "Limpar filtros" (M39), frase do alcance do "Marcar todas", `mensagemDaAction(`.
- [ ] Conserto conforme spec §6.5. Commit `feat(redesign): 07-D D5 — …`.

### Task 6: D6 — Busca, paleta e sino (68 rotas antes × depois)

**Files:** Create `src/components/search/busca-links.ts` + teste; Modify `src/app/(app)/busca/{page,busca-client}.tsx`, `src/components/search/search-command.tsx`, `src/components/notifications/notification-bell.tsx`.

- [ ] Contratos primeiro: `busca-client` usa `useUrlText(` e `window.history.replaceState`, sem `router.replace` (M17); `catch` leva a estado de erro com `role="alert"` e a frase do spec, nunca ao "Nada encontrado" (M18); `page.tsx` monta `key={q}`; paleta com `role="combobox"`, `aria-activedescendant`, `role="listbox"`, `role="option"`, `DialogDescription`, "Ver todos os resultados" por `buscaLink(` (M40); sino com `aria-label` que inclui a contagem (M19).
- [ ] Conserto conforme spec §6.6 (paleta e sino: só atributos e texto). Build + medidor das **68 rotas** antes × depois; custo de casca D3 + D6 ≤ +0,3 KB gz por rota, senão parar e reportar. Commit `feat(redesign): 07-D D6 — …` com a tabela das 68.

### Task 7: D7 — Links e contrato da query string (o que toca `approval/**` fica no principal)

**Files:** Modify `src/lib/search/{nutrition,training,ai}-links.ts` (+ testes), `src/lib/ai/approval/commands/{nutrition-preview,nutrition,memory-preview,memory}.ts` (+ `nutrition.test.ts`), `src/lib/ai/tools/adapters/{nutrition,training,body,tasks}.ts` (+ `tasks.test.ts`), `src/lib/ai/insights/collectors/{nutrition,training}.ts`, as 13 telas do L2, `src/app/(app)/nutricao/diario/page.tsx` (só o apelido), `src/test/links-inline.ts` (regex), `src/test/deep-links-inline.test.ts` (`VARRIDOS` + pisos), `src/test/deep-links-query-string.test.ts` (`ROTAS`, `ARQUIVOS`, `SO_CONSTRUTOR`, pisos), `src/lib/search/ai-links.test.ts` (`AI_SECTIONS` × construtores).

- [ ] Testes primeiro (M20, M21, M41–M44): `rotaDoDiario("2026-08-07")` → `"/nutricao/diario?data=2026-08-07"`; o diário lê `date` como apelido (`parametros-lidos`); `/tarefas` sem `task`; o extrator conta `rota:`/`targetRoute:` (fixture no `deep-links-inline`); cada arquivo da IA com piso; `/ia/acoes`, `/ia/comprovantes`, `/notificacoes`, `/busca` em `ROTAS`; `notifications/ai.ts` em `SO_CONSTRUTOR`; os 8 hrefs de `AI_SECTIONS` = os construtores de base de `ai-links`; nenhuma tela do lote com literal `"/ia` fora de `ai-links`.
- [ ] Conserto conforme spec §6.7. Commit `feat(redesign): 07-D D7 — …`.

### Task 8: D8 — Diálogos, formulários e alternâncias

**Files:** Create `src/test/ia-sistema-dialogos.test.ts` (estende a da Task 4), `src/test/ia-sistema-formularios.test.ts`; Modify `conversation-list.tsx`, `memory-client.tsx`, `memory-form-dialog.tsx`, `retention-card.tsx`, `ai-preferences-form.tsx`, `provider-card.tsx`, `regional-card.tsx`, `notifications-card.tsx`, `profile-card.tsx`, `receipt-review.tsx`, `receipt-upload.tsx`, `insights-client.tsx`.

- [ ] Testes primeiro (M22, M29, M45–M47): as regras do spec §6.8 — actions derivadas (`invalid(` em `src/lib/actions/{ai-*,settings,notifications}.ts`), `PASSA_PELO_MAPA`/`REPASSE_CRU`, `DialogDescription` em todo `DialogContent` do lote, trava de `onOpenChange` durante envio, exceções num `Map` que tem de continuar violando; `aria-pressed` no favorito, no Útil/Não útil e no "Mostrar as N…"; erro de `modulo` renderizado.
- [ ] Conserto conforme spec §6.8. Commit `feat(redesign): 07-D D8 — …`.

### Task 9: D9 + C2 + Z — gavetas, textos e ausência

**Files:** Modify `src/components/shared/module-shell.tsx` (classe + `aria-expanded`/`aria-controls`), `floating-assistant-panel.tsx` (sem `w-full`), `src/components/ui/sheet-largura.test.ts` (as 2 exceções saem), `ai-card.tsx`, `ai-preferences-form.tsx` (texto do `confirmationMode`), `receipt-review.tsx` (texto, sem `?? 0`, sem placeholder `0,00`), `src/lib/ai/vision/receipt-items.ts` (+ teste: total `null`), `src/app/(app)/ia/consumo/page.tsx` + função pura `textoDoCusto` (+ teste).

- [ ] Testes primeiro (M14, M15, M24, M48, M49): contrato de verdade derivado do registry (`toolsForPermission`/`toolsForWritePermission`); `resumirNota(null, …)` → explicação "o total impresso não foi identificado", nunca "R$ 0,00"; `textoDoCusto` ("não medido" / "parcial"); `sheet-largura` sem exceções.
- [ ] Conserto conforme spec §6.9–§6.10. Bundle (D9 entra em todas as rotas com `module-shell`). Commit `feat(redesign): 07-D D9 + C2 + Z — …`.

### Tasks 10–12: V — alinhamento visual (um commit por grupo)

- Task 10: chat e painel (vazio da conversa por `EmptyState`, selos longos com `min-w-0 truncate`).
- Task 11: subpáginas de `/ia` (consumo, insights sem módulo, comprovantes — nome do arquivo, PDF × imagem em texto —, insight não vigente com selo em vez de `opacity-70`).
- Task 12: Configurações, Notificações e Busca (busca com menos de 2 caracteres por `EmptyState`; o que restar do lote).

Cada uma: inspeção na prévia reapontada, testes/tsc/eslint, bundle, commit `feat(redesign): 07-D V — …`.

### Task 13: Mutações, verificação final e prévia

- [ ] M1–M49 (spec §7), uma a uma, compilando; nome de cada teste que cai; `git restore` + `git diff --quiet`; verde → reforçar e declarar.
- [ ] Os cinco comandos com os números; as 12 do lote antes × depois, as 13 da §1.1, mediana e total; `TZ=UTC npx vitest run` nos testes tocados.
- [ ] Prévia reapontada para o código final e refotografada (claro/escuro × 1280/390, foco visível).
- [ ] Entrega (briefing §12): branch e worktree, números, mutações, D1–D9, a lista de conferência manual (briefing §11), os achados registrados, limitações e risco residual (inclusive o que fica sem teste de componente; as linhas antigas com `?date=` ficam cobertas pelo apelido).

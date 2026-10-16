# REDESIGN-07-C — Dieta e Treinos · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mudar a aparência, o anúncio de estado e o carregamento das 30 telas de `/nutricao/**` e `/treinos/**` sem mudar nenhum dado nem nenhuma conta — e fechar os caminhos em que a sessão de treino ao vivo perde o que o dono registrou. Cada correção presa por um teste confirmado por mutação.

**Architecture:** Server Component lê → `*-client.tsx` renderiza. A sessão ao vivo ganha um **registro de filas por sessão na aba** (uma cópia só da fila, um laço só, posse da instância montada), consumido por `useSyncExternalStore` com instantâneo de servidor vazio; as regras que a tela consome são funções puras testadas em node. Diálogos fora da sessão passam a `next/dynamic` + `useLazyDialog`; o contrato com a tela é provado por **varredura do código-fonte sem comentários** (invariante 25 — o projeto não tem teste de componente).

**Tech Stack:** Next.js 16 (Turbopack), React 19, Tailwind v4 CSS-first, shadcn/Radix, react-hook-form, Vitest (ambiente `node`).

**Spec:** `docs/superpowers/specs/2026-10-11-07c-dieta-treinos-design.md` (aprovado pelo dono em 2026-10-11). Em caso de conflito, o spec vence.

## Global Constraints

- Worktree `C:\Users\Yuri\Documents\Desenvolvedor\yuri.app.pessoal-07c`, branch `feat/redesign-07c-dieta-treinos`. ⛔ Nada de `git checkout`/`switch`/`stash`/`reset` nem edição na pasta principal; nada nos worktrees `-07a`/`-07b`; nenhum commit da 07-A/07-B reescrito.
- ⛔ Nenhuma migration; nenhuma Server Action nova ou alterada (`src/lib/actions/{nutrition,training,body}*.ts` só leitura).
- ⛔ Intocados: `habit-sync.ts`, `timers.ts`, `session-machine.ts`, `session-flow.ts`, `calc.ts`, `snapshot.ts`, `metrics.ts`, `records.ts`, `goals.ts`, `shopping.ts`. A fila continua **uma mutação por vez, em ordem estrita**, e `persist` continua o **único escritor** da fila.
- ⛔ Fotos (invariantes 21 e 29): URL assinada a cada leitura, `storage_path` fora do client — os diálogos de foto só mudam de **quando** carregam.
- ⛔ Arquivos de outros lotes (spec §9) não são editados: 03-C, 03-B2, 07-D, 07-B e os compartilhados (`module-shell`, `seletor-de-visao`, `abas-de-rota`, `sortable-list`, `empty-state`, `chart-skeleton`, `use-lazy-dialog`, `components/reports/**`, `lib/nav/**`). `seletor-de-visao.test.ts` pode ser estendido. `round-trip.test.ts` não muda.
- ⛔ `floating-assistant*.tsx`, os 11 ids de `DASH_CARD_IDS`, a casca, `nav.ts`, `docs/redesign/STATUS.md` — não tocar.
- ⛔ Nenhuma rota morre; nenhum parâmetro deixa de ser aceito (spec §9).
- Bundle: `/(app)/nutricao/compras` **< 242,8**; `/(app)/nutricao/diario` ≤ 234,8; `/(app)/treinos/calendario` ≤ 230,9; `/(app)/treinos/sessao` ≤ 221,5; `/(app)/configuracoes` ≤ 285 **sem subir o teto**; nenhuma rota fora de 250; nenhuma das 30 sobe.
- `next/dynamic`: segundo argumento **objeto literal escrito ali mesmo**. ⛔ Nunca `{aberto && <X/>}` sozinho.
- Varreduras usam `semComentarios` de `@/test/links-inline`. Nenhum segundo extrator de links.
- Dados sintéticos em fixture e prévia (repositório público). `.env.local` copiado e **nunca** commitado.
- Commits: título pt-BR sem acentos `feat(redesign): 07-C …` / `test(redesign): 07-C …`; corpo com o que mudou/não mudou, testes, bundle (quando runtime), `summary_line` do roteador **copiada literalmente**, o que ficou de fora; termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Cada passo: `npx vitest run <dirs tocados>`, `npx tsc --noEmit`, `npx eslint <arquivos tocados>`, `git diff` revisado (nada de `.env`, chave, token, `service_role`). ⛔ Não editar arquivo durante build nem durante dispatch do roteador. Depois do primeiro dry-run, conferir `git status` (o auto-init pode apagar o bloco do `CLAUDE.md` → `git restore CLAUDE.md`).
- Única falha aceita na suíte: `src/lib/ai/approval/schema.test.ts › as travas que o código não pode contornar › a FK da aprovação carrega o hash, amarrando-o ao effect_hash da proposta` (CRLF do worktree).
- Sem push, sem merge, sem deploy, sem upstream.

## Review Focus

1. **Registro feito enquanto outro envio está no ar** — confirmar a série 4 enquanto a série 3 ainda está sendo enviada: a 4 não pode sumir da fila. (Achado na leitura do laço: ele regrava a cópia da fila tirada **antes** do `await`; vale com uma instância só e é o mecanismo da sobrescrita do S2.) Teste em `session-queue-drain.test.ts` (Task 1).
2. **Armazenamento indisponível** (modo privado, cota): `writeQueue` falha em silêncio e `readQueue` devolve `[]` — a fila em memória continua sendo enviada e não é apagada por uma releitura vazia. Teste em `session-queue-drain.test.ts` (Task 2).
3. **Duas sessões na mesma aba** (encerrou uma, começou outra sem recarregar): a fila e o estado de uma não aparecem na outra. Teste em `session-queue-drain.test.ts` (Task 2).
4. **Descartar com envio no ar**: limpar a fila enquanto um envio está em andamento não a faz ressuscitar quando ele volta. Teste em `session-queue-drain.test.ts` (Task 2).
5. **Plural e zero nos textos novos** — "1 registro ainda está só neste aparelho" × "3 registros ainda estão…"; "1 a enviar"; aderência de 0%; meta 0 sem "0% da meta"; hoje fora da grade (nenhuma célula com `aria-current`). Testes em `session-queue-view.test.ts` (Task 2), `rotulos-do-mes.test.ts` / `rotulos-do-calendario.test.ts` (Task 6) e no contrato das barras (Task 13).

---

### Task 1: D1 (1/2) — caracterização vermelha da sessão ao vivo

**No principal, sem roteador** (spec §12: o passo 1 inteiro fica no principal). Dry-run do roteador só para registrar a `summary_line`.

**Files:**
- Create: `src/components/training/session/session-queue-drain.ts` (o laço extraído no Passo 0, movimento puro)
- Modify: `src/components/training/session/use-session-queue.ts` (`readQueue`/`writeQueue` exportados; `drain` delega a `drainQueue`)
- Delete: `src/components/training/session/session-queue-drain.demo.test.ts`
- Create: `src/components/training/session/session-queue-drain.test.ts`
- Create: `src/components/training/session/session-queue-view.test.ts`
- Create: `src/test/sessao-ao-vivo-contratos.test.ts`

**Interfaces (o que os testes já exigem e a Task 2 entrega):**
- `session-queue-drain.ts`: `drainQueue(ports: DrainPorts)`, `DrainPorts` ganha `possui: () => boolean`; `criarRegistroDeFilas(aparelho: Aparelho): RegistroDeFilas` com `Aparelho = { ler(sessionId: string): QueuedMutation[]; gravar(sessionId: string, fila: QueuedMutation[]): void }` e `RegistroDeFilas = { instantaneo(id): InstantaneoDaFila; assinar(id, ouvinte: () => void): () => void; assumir(id, portas: PortasDaDona): symbol; soltar(id, posse: symbol): void; enfileirar(id, m: QueuedMutation): void; drenar(id): Promise<void>; limpar(id): void }`, `InstantaneoDaFila = { fila: QueuedMutation[]; estado: SyncState; ultimoErro: string | null }`, `PortasDaDona = { send: (m: QueuedMutation) => Promise<ActionResult<unknown>>; onSettled?: () => void }`, `INSTANTANEO_DO_SERVIDOR: InstantaneoDaFila`.
- `session-queue-view.ts`: `estadoExibido(state: SyncState, pending: number): SyncState`; `pendentesTexto(n: number): string`; `registrosNoAparelhoTexto(n: number): string`; `podeEncerrar(q: { pending: number }): { ok: true } | { ok: false; motivo: string }`; `optimisticPatch(status, payload): OptimisticSet`; `optimisticFromQueue(fila: QueuedMutation[]): Record<string, OptimisticSet>`; `avisosDoFimDoDescanso(e: { isOver: boolean; isRunning: boolean; jaAvisou: boolean; jaAvancou: boolean; vencidoNaMontagem: boolean; deveAvancar: boolean }): { tocar: boolean; avancar: boolean }`; tipo `OptimisticSet = { status: SessionSet["status"]; values: Partial<SessionSet> }`.

- [ ] **Step 1: `session-queue-drain.test.ts`** — os quatro testes do Passo 0 **virados** para o comportamento desejado, mais o achado do Review Focus 1. Montagem: `vi.stubGlobal("window", { localStorage: new MemoryStorage() })`, `navigator.onLine = true`, `const filas = criarRegistroDeFilas({ ler: readQueue, gravar: writeQueue })`, `redeControlada()` igual à do Passo 0. Uma "instância" = `filas.assumir(SID, { send, onSettled })` + `filas.drenar(SID)`; desmontar = `filas.soltar(SID, posse)`.

```ts
describe("S2 — remontar no meio de um envio", () => {
  it("a nova instância NÃO reenvia o que estava no ar e o registro feito por ela não some", async () => {
    writeQueue(SID, [mut("descanso-1", "iniciar_descanso"), mut("serie-2")]);
    const rede = redeControlada();
    const a = filas.assumir(SID, { send: rede.send });
    void filas.drenar(SID);
    await tique();
    expect(rede.chamadas).toEqual(["descanso-1"]);

    filas.soltar(SID, a);                       // A desmonta
    filas.assumir(SID, { send: rede.send });    // B monta
    void filas.drenar(SID);
    await tique();
    expect(rede.chamadas).toEqual(["descanso-1"]); // ← nada de envio duplo

    filas.enfileirar(SID, mut("serie-3"));
    rede.responder(0);                          // o descanso volta; o laço segue com a posse de B
    await tique();
    expect(ids(readQueue(SID))).toEqual(["serie-2", "serie-3"]); // serie-2 está no ar; serie-3 ficou
    expect(rede.chamadas).toEqual(["descanso-1", "serie-2"]);
  });

  it("um registro feito enquanto outro está no ar não some (uma instância só)", async () => {
    const rede = redeControlada();
    filas.assumir(SID, { send: rede.send });
    filas.enfileirar(SID, mut("serie-3"));
    void filas.drenar(SID);
    await tique();
    filas.enfileirar(SID, mut("serie-4"));   // enquanto a 3 está no ar
    rede.responder(0);
    await tique();
    expect(ids(readQueue(SID))).toContain("serie-4");
    expect(rede.chamadas).toEqual(["serie-3", "serie-4"]);
  });

  it("sem dona, nada é enviado (sair da sessão pausa o envio)", async () => {
    writeQueue(SID, [mut("serie-1")]);
    const send = vi.fn(async () => ({ ok: true as const, data: null }));
    const posse = filas.assumir(SID, { send });
    filas.soltar(SID, posse);
    await filas.drenar(SID);
    expect(send).not.toHaveBeenCalled();
    expect(ids(readQueue(SID))).toEqual(["serie-1"]);
  });
});

describe("S1 — finalizar não apaga o que está só no aparelho", () => {
  it("a fonte: 'Finalizar' é botão (sem <Link>) e a revisão assume a fila", () => {
    const live = ler("session-live-client.tsx");
    expect(finishBar(live)).not.toMatch(/<Link\b/);
    const review = ler("session-review-client.tsx");
    expect(review).toMatch(/useSessionQueue\(/);
    expect(review).toMatch(/podeEncerrar\(/);
  });

  it("o laço antigo não ressuscita a fila depois de limpar", async () => {
    writeQueue(SID, [mut("serie-3"), mut("serie-4")]);
    const rede = redeControlada();
    filas.assumir(SID, { send: rede.send });
    void filas.drenar(SID);
    await tique();
    filas.limpar(SID);
    rede.responder(0);
    await tique();
    expect(readQueue(SID)).toEqual([]);
    expect(rede.chamadas).toEqual(["serie-3"]);
  });
});
```

`finishBar(fonte)` recorta o corpo de `function FinishBar` até a próxima `function ` de topo.

- [ ] **Step 2: `session-queue-view.test.ts`** — cada regra pura, com sim e não:

```ts
expect(estadoExibido("salvo", 0)).toBe("salvo");
expect(estadoExibido("salvo", 2)).toBe("salvo_no_dispositivo");          // M5
expect(estadoExibido("erro", 2)).toBe("erro");
expect(pendentesTexto(1)).toBe("1 a enviar");
expect(pendentesTexto(3)).toBe("3 a enviar");
expect(registrosNoAparelhoTexto(1)).toBe("1 registro ainda está só neste aparelho");
expect(registrosNoAparelhoTexto(3)).toBe("3 registros ainda estão só neste aparelho");
expect(podeEncerrar({ pending: 0 })).toEqual({ ok: true });
expect(podeEncerrar({ pending: 2 })).toEqual({ ok: false, motivo: "2 registros deste aparelho ainda não chegaram ao servidor." }); // M2
expect(podeEncerrar({ pending: 1 })).toEqual({ ok: false, motivo: "1 registro deste aparelho ainda não chegou ao servidor." });
// optimisticFromQueue: só registrar_serie; a última de cada série vence; valores = optimisticPatch
// avisosDoFimDoDescanso: vencido na montagem não toca (M19); avança uma vez; avisar não avança
expect(avisosDoFimDoDescanso({ isOver: true, isRunning: true, jaAvisou: false, jaAvancou: false, vencidoNaMontagem: true, deveAvancar: false }))
  .toEqual({ tocar: false, avancar: false });
expect(avisosDoFimDoDescanso({ isOver: true, isRunning: true, jaAvisou: false, jaAvancou: false, vencidoNaMontagem: false, deveAvancar: true }))
  .toEqual({ tocar: true, avancar: true });
expect(avisosDoFimDoDescanso({ isOver: true, isRunning: true, jaAvisou: true, jaAvancou: true, vencidoNaMontagem: false, deveAvancar: true }))
  .toEqual({ tocar: false, avancar: false });
```

- [ ] **Step 3: `sessao-ao-vivo-contratos.test.ts`** — varredura sem comentários: `FinishBar` sem `<Link`; `<RestPanel` com `key={activeRest.id}` (M4); `SyncStatus` com `aria-live="polite"` e `role="status"` (M23); `rest-panel.tsx` chama `avisosDoFimDoDescanso(`; a revisão importa `useSessionQueue` e `podeEncerrar` e chama `podeEncerrar(` **antes** de `finishSession(` e de `abandonSession(` (posição no texto de cada handler); `session-live-client.tsx` sem `useClearQueueOnFinish`; os 5 diálogos da sessão com import estático.
- [ ] **Step 4:** Rodar `npx vitest run src/components/training/session src/test/sessao-ao-vivo-contratos.test.ts` — **vermelho pelo motivo certo** (módulo/função inexistente ou asserção do comportamento atual), conferido teste a teste. Escrever no corpo do commit o motivo de cada vermelho.
- [ ] **Step 5:** `npx tsc --noEmit` passa (o vermelho é de vitest, não de compilação: os testes importam de arquivos que a Task 2 cria — se o tsc reprovar por import inexistente, o (1/2) leva stubs que lançam `Error("não implementado")`, com a assinatura certa).
- [ ] **Step 6:** Commit `test(redesign): 07-C D1 (1/2) — caracterizacao da sessao ao vivo (S1-S4)`. ⚠️ Commit com teste vermelho é **intencional** (par 1/2 → 2/2); o corpo diz isso.

### Task 2: D1 (2/2) — o conserto

**Files:**
- Modify: `src/components/training/session/session-queue-drain.ts` — `possui` antes de cada envio; depois do `await`, retirar a mutação enviada da fila **atual** (`ports.queue().filter((m) => m.id !== next.id)`), nunca da cópia de antes; `criarRegistroDeFilas`.
- Create: `src/components/training/session/session-mutations.ts` — `sendSessionMutation(sessionId: string, mutation: QueuedMutation): Promise<ActionResult<unknown>>`: o `switch` de `session-live-client.tsx:134-162` **movido sem mudança** (conferido por script, como no Passo 0).
- Create: `src/components/training/session/session-queue-view.ts` — as regras da Task 1.
- Modify: `use-session-queue.ts` — instância do registro no módulo (`filasDaAba = criarRegistroDeFilas({ ler: readQueue, gravar: writeQueue })`); o hook lê por `useSyncExternalStore(assinar, ler, () => INSTANTANEO_DO_SERVIDOR)`; posse no efeito de montagem (`assumir`/`soltar`); `enqueue` → `filasDaAba.enfileirar`; `clearSessionQueue` → `filasDaAba.limpar`; 4º parâmetro `opcoes: { assumir?: boolean }` (padrão `true`) para a revisão de sessão encerrada não assumir; retorno ganha `fila: QueuedMutation[]` e `state` passa por `estadoExibido`.
- Modify: `session-live-client.tsx` — `send` vira `React.useCallback((m) => sendSessionMutation(session.id, m), [session.id])`; camada otimista semeada **uma vez** da fila (ajuste de estado durante o render, guardado por `semeado`), com o que o dono fez depois vencendo; `registerSet` usa `optimisticPatch`; `FinishBar` vira `<Button variant="ghost" className="h-12 shrink-0" onClick={onFinish}>` (nas duas ramificações); `ConfirmFinishDialog` recebe `queue` e, com `pending > 0`, mostra o quadro da prévia (`registrosNoAparelhoTexto` + "A revisão envia todos, na ordem, antes de finalizar." + `SyncStatus` + botão "Enviar agora" → `queue.flush`); `<RestPanel key={activeRest.id} …/>`; sai `useClearQueueOnFinish` (e o import de `clearSessionQueue`, se ficar sem uso).
- Modify: `session-review-client.tsx` — `const queue = useSessionQueue(session.id, send, router.refresh, { assumir: !isClosed })` com `send = (m) => sendSessionMutation(session.id, m)`; `handleFinish`/`handleAbandon` começam por `const pode = podeEncerrar({ pending: queue.pending }); if (!pode.ok) { toast.error(pode.motivo); return; }`; barra fixa, com pendência: linha com `SyncStatus` + o motivo; "Finalizar e salvar" `disabled` com pendência; diálogo de descarte ganha "Os N registros que estão só neste aparelho também serão descartados." (com o plural certo) quando `queue.pending > 0`. `clearSessionQueue` continua depois de cada sucesso.
- Modify: `rest-panel.tsx` — `const [vencidoNaMontagem] = React.useState(timer.isOver)`; refs `avisou`/`avancou`; o efeito chama `avisosDoFimDoDescanso({ …, deveAvancar: shouldAutoAdvance(timer, autoAdvance) })`.
- Modify: `sync-status.tsx` — texto em `<span className="truncate" role="status" aria-live="polite">` com `SYNC_LABELS[state]` + (`pending > 0 && state !== "salvo"` ? ` · ${pendentesTexto(pending)}` : "") + (erro: ` · ${lastError}` em `sr-only` dentro do mesmo span); sai o `sr-only role="status"` separado.

- [ ] **Step 1:** Implementar `session-queue-view.ts` e o registro; rodar os testes puros até verde.
- [ ] **Step 2:** `session-mutations.ts` por movimento; script de conferência (corpo do `switch` idêntico, só `session.id` → `sessionId`).
- [ ] **Step 3:** Ligar hook, sessão, revisão, descanso e status; rodar `npx vitest run src/components/training src/test/sessao-ao-vivo-contratos.test.ts` — verde.
- [ ] **Step 4:** Medir a barra da revisão a 390 px (conta: `p-3` + 3 botões `h-12` com `gap-2`; "Voltar ao treino" e "Descartar" `shrink-0` com `px-4` do `Button` + ícone; "Finalizar e salvar" `text-base` `min-w-0 flex-1`). Se não couber, `truncate` no rótulo do botão de finalizar dentro de `<span className="truncate">` (o `flex-wrap` da barra já existe). Se couber, declarar no commit.
- [ ] **Step 5:** `npx tsc --noEmit`; `npx eslint` nos tocados; `npm run build` + bundle (todas as 30 rotas pelo medidor do scratchpad). ⚠️ `/treinos/sessao` ≤ 221,5 — se subir, **parar** e reportar antes de seguir.
- [ ] **Step 6:** Commit `fix(redesign): 07-C D1 (2/2) — a sessao ao vivo nao perde o que esta no aparelho` com o desenho (registro por sessão: uma cópia da fila na aba, um laço, posse da instância montada) e a consequência declarada (sair da sessão pausa o envio).

### Task 3: D2 — diálogos sob demanda

**Files:**
- Create: `src/test/dieta-treinos-dialogos.test.ts`
- Create: `src/components/shared/use-item-retido.ts` (`useItemRetido<T>(item: T | null): T | null` — guarda o último não nulo por ajuste de estado durante o render)
- Create: um arquivo por diálogo local (27, spec §6.2), **movimento puro** conferido por script byte a byte
- Modify: as telas de `app/(app)/{nutricao,treinos}/**` e `components/{nutrition,training,body}/**` que montam diálogo

- [ ] **Step 1: Varredura (vermelha hoje)** em `app/(app)/{nutricao,treinos}/**` e `components/{nutrition,training,body}/**`, sem comentários: (1) nenhum import estático de valor de módulo cujo nome termina em `-dialog`/`-sheet`/`-form-dialog`/`-picker-dialog` (import `type` pode), salvo `EXCECOES` nomeadas (5 da sessão + `TodoLinkDialog`), e cada exceção tem de continuar casando; (2) nenhuma `function \w+(Dialog|Sheet)\b` definida em arquivo de tela, salvo `ConfirmFinishDialog`; (3) por arquivo, `useLazyDialog(` ≥ `dynamic(` que carregam diálogo; (4) os 5 da sessão **sem** `dynamic` (M7); (5) fixtures dizendo sim e não. Piso de arquivos varridos contado no commit.
- [ ] **Step 2:** Vermelho. Mover os 27 locais (só `export` e imports mudam); script de conferência byte a byte do corpo.
- [ ] **Step 3:** Aplicar o molde em cada montagem: `const X = dynamic(() => import("…").then((m) => m.X), { ssr: false });` + `const montadoX = useLazyDialog(abertoX);` + `{montadoX && <X … />}`. `SortableList` por `dynamic` em `shopping-client.tsx` (só com `reordering`) e `programs-client.tsx` (só no cartão expandido). Os 13 que fecham secos: `const itemExibido = useItemRetido(item)` e renderizar a partir dele (o `open` continua vindo do item **atual**).
- [ ] **Step 4:** Verde; tsc; eslint; build + bundle das 30 rotas. `/nutricao/compras` **tem de cair**; `/nutricao/diario`, `/treinos/calendario` ≤ antes.
- [ ] **Step 5:** Roteador: dry-run → dispatch (se recomendado) em fatias por grupo de telas; patches revisados e aplicados à mão; `summary_line` literal. Commit `feat(redesign): 07-C D2 — dialogos de Dieta e Treinos carregam sob demanda` com bundle antes × depois.

### Task 4: D5 — erros de formulário

**Files:**
- Create: `src/test/dieta-treinos-formularios.test.ts`
- Modify: os arquivos de tela que chamam actions com `invalid(` (Dieta 17, Treinos 28, body)

- [ ] **Step 1: Varredura (vermelha hoje):** deriva de `src/lib/actions/{nutrition,training,body}*.ts` as actions exportadas cujo corpo chama `invalid(`; todo arquivo de tela dos dois módulos que importa uma delas e lê `.ok`/`.error` tem de importar `mapServerFieldErrors` de `@/lib/forms/server-errors`, salvo `EXCECOES` com motivo. Piso contado no commit; fixture sim/não.
- [ ] **Step 2:** RHF: `setError` nos `toSet` + `toast.error(serverErrorMessage(fallback, mapped))`. `useState`/`FormData`: `const CAMPOS = [...] as const` + estado `Record<string, string>` sob o campo onde já há lugar (3 diálogos de medidas, upload de foto, `measure-dialog`) com `aria-invalid`/`aria-describedby`; demais → toast com `serverErrorMessage`. G1: `food`/`nutrients` como raízes em `CAMPOS`, aviso no topo da seção + toast; **sem** `handleSubmit`.
- [ ] **Step 3:** Verde; tsc; eslint; `round-trip.test.ts` verde sem mudança. Roteador por fatias. Commit `feat(redesign): 07-C D5 — erros do servidor destacam o campo ou sobem com o nome`.

### Task 5: D3 — alternâncias + V1 estendida

**Files:**
- Modify: `src/components/shared/seletor-de-visao.test.ts` (estender: assinaturas B e C com fixtures; teto do corpo sobe e corpo acima **falha**; `EXCECOES_MUDAS` + `components/ai/action-history-client.tsx` (07-D); `TELAS` + os 3)
- Modify: `nutricao/diario/diary-client.tsx`, `nutricao/planejamento/planning-client.tsx`, `treinos/calendario/calendar-client.tsx` (`SeletorDeVisao`, `?visao=` e `push`/`replace` iguais); demais alternâncias do §4/A1 com `aria-pressed`/`aria-current`
- Create: `src/test/dieta-treinos-contratos.test.ts` (molde `CONTRATOS` + `PROIBIDOS` da 07-B) com as alternâncias soltas

- [ ] **Step 1:** V1 estendida e contratos — vermelhos.
- [ ] **Step 2:** Implementar; "Mostrar encerradas" com rótulo fixo + `aria-pressed`.
- [ ] **Step 3:** Verde; tsc; eslint; bundle (diário/calendário ≤ antes). Commit `feat(redesign): 07-C D3 — alternancias anunciam o estado e as visoes usam o seletor`.

### Task 6: D4 — calendários

**Files:**
- Create: `src/components/nutrition/tons-do-mes.ts` (+ teste) — `tomDaCelula(cell)` lendo `cellIntensity`/`goalPercent` existentes; `TONS_DO_MES` (chave → classe → rótulo), fonte única de célula e legenda
- Create: `src/components/nutrition/rotulos-do-mes.ts` (+ teste) — `textoDaCelulaDoMes(cell, hoje)`
- Create: `src/components/training/rotulos-do-calendario.ts` (+ teste) — textos da coluna, célula, botão de adicionar (data escrita), dia da consistência, chips de série; `statusExibido(entry, hoje)` (G2)
- Modify: `diary-month-view.tsx`, `consistency-calendar.tsx`, `calendar-client.tsx`, `diary-client.tsx`, `planning-client.tsx`, `history-client.tsx`, `treinos/page.tsx`, `session-live-client.tsx` (chips), `adherence-badge`

- [ ] **Step 1:** Testes puros (vermelhos): limites das faixas iguais aos de hoje; hoje fora da grade; plural; G2 (descanso nunca vira "atrasado"/"hoje" — M20).
- [ ] **Step 2:** Implementar; `hoje` sempre injetado pelo servidor; `aria-current="date"` + palavra; ícone de status no mês de Treinos; contorno do futuro; nomes inteiros em `sr-only`.
- [ ] **Step 3:** Contratos (consistência com `aria-current` — M12; legenda sem classes próprias — M11). Verde; `TZ=UTC` nos testes novos; tsc; eslint. Commit `feat(redesign): 07-C D4 — calendarios dizem estado e hoje sem depender da cor`.

### Task 7: D6 + L2/G5 — links, query string e campos numéricos

**Files:**
- Modify: `src/lib/search/nutrition-links.ts` (+ teste): `waterLink()`, `planningWeekLink(semana)`
- Modify: `src/lib/notifications/nutrition.ts:255` → `planningWeekLink(week.weekStart)`
- Modify: `nutricao/page.tsx`, `diary-client.tsx` (água), `integrations-card.tsx` (`/habitos?view=gerenciar`)
- Modify: `src/test/deep-links-query-string.test.ts` (`ARQUIVOS` + notificações; `lidosPela` aprende `params.x`, `params?.x` e desestruturação; `visao` validada; piso por rota contado)
- Modify: `nutrition-links.test.ts`/`training-links.test.ts` (parâmetro lido pela página de destino; `programa` exceção nomeada)
- Modify: `food-filters.tsx`, `history-client.tsx` (`useUrlText`; rótulos associados)

- [ ] **Step 1:** Contratos vermelhos (M13, M14, M15, M22).
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Verde; tsc; eslint. Commit `feat(redesign): 07-C D6 — links pelos construtores e campos que nao perdem digito`.

### Task 8: D7 — gavetas

- [ ] **Step 1:** `sheet-largura.test.ts` sem as 6 exceções (vermelho).
- [ ] **Step 2:** As 6 gavetas com `data-[side=right]:w-full data-[side=right]:sm:max-w-*`; `module-shell.tsx` continua exceção, rotulada "07-D".
- [ ] **Step 3:** Verde (M17). Commit `feat(redesign): 07-C D7 — gavetas de Dieta e Treinos na largura pedida`.

### Task 9: G + T — gráficos e textos

- [ ] **Step 1:** Contratos vermelhos: `EquivalentTable` na fachada e não no `-impl` (M16); `reports-client.tsx` com `<table className="sr-only">` por gráfico de barras, `MeasurementTable` ao lado do de medida, `aria-label` no `Select`; `src/test/vinculo-treinos-frases.test.ts` exigindo "substitu", "apagad", "abandon" nas duas frases (M18); `revisar/page.tsx` sem "Subfase"; sem "chega na Subfase 17-C".
- [ ] **Step 2:** Implementar; tirar `NutritionSectionPlaceholder`, `TrainingSectionPlaceholder`, o card "O que ainda vem" (+ `upcoming`) e `NUTRITION_SECTION_STATUS_LABELS`; `status`/`phase` ficam.
- [ ] **Step 3:** Verde; tsc; eslint; bundle (`/treinos/evolucao`, `/nutricao/relatorios` ≤ antes). Commit `feat(redesign): 07-C G+T — graficos com leitura textual e textos que descrevem o sistema de hoje`.

### Tasks 10–13: V — alinhamento visual (um commit por grupo)

Grupos: **10** Diário e Planejamento · **11** demais telas da Dieta · **12** Sessão, Preparar e Revisar · **13** demais telas de Treinos.

- [ ] **Step 1 (cada grupo):** Contratos vermelhos em `dieta-treinos-contratos.test.ts`: `EmptyState` nas seções vazias (`py-8` solta; `border-0 bg-transparent py-6` em card — inclusive os 5 já existentes dentro de Card); barras com `aria-label` (5 + medidas); `GoalProgressBar` com `aria-valuenow` ≤ `aria-valuemax` e `aria-valuetext` real, alvo 0 sem "0%"; `sr-only` "Recorde pessoal"/"Favorito"; G6 (`CardHeader` com `flex flex-row flex-wrap items-start justify-between gap-2 space-y-0` — M21); `useItemRetido` nos 13 (M24); `min-w-0`/`flex-wrap` nas linhas do §4.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Verde; tsc; eslint; commit `feat(redesign): 07-C V — <grupo>: …`.

### Task 14: Mutações, verificação final e prévia

- [ ] **Step 1:** M1–M24 (spec §7), uma a uma: aplicar → `npx tsc --noEmit` (tem de compilar) → `npx vitest run <testes envolvidos>` → registrar os **nomes** dos testes que caem → `git restore <arquivo>` → `git diff --quiet` (exit 0). Mutação verde é medida antes de ser chamada de fraqueza.
- [ ] **Step 2:** Os cinco comandos (`test:run`, `lint`, `tsc`, `build`, `perf:bundle`) + medidor das 30 rotas; `TZ=UTC npx vitest run` nos testes tocados.
- [ ] **Step 3:** Reapontar o gerador da prévia para o código final, recompilar o `globals.css` real, refotografar claro/escuro × 1280/390 com foco visível; conferir.
- [ ] **Step 4:** Entrega (spec §13 como lista de conferência manual; nenhum "zero bugs").

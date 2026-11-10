# REDESIGN-09-G · Barra de ações do celular — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (subagentes
> Claude; o Codex escreve na árvore principal neste repo). Passos com `- [ ]`.

**Objetivo:** abaixo de `lg`, uma fileira fixa de três ações (Buscar · Novo lançamento ·
Assistente) ao alcance do polegar, sem duplicar diálogo, atalho nem botão de assistente.

**Arquitetura:** a barra é um componente da casca (`barra-de-acoes.tsx`) que **embrulha** o
`FloatingAssistant`. Abaixo de `lg` ela é uma linha `fixed` no rodapé; de `lg` para cima vira
`display: contents`, os dois botões dela somem e o botão do assistente — **o mesmo elemento** —
volta a ser o círculo flutuante de hoje. Busca e lançamento continuam montados no header (uma
instância de cada diálogo e do Ctrl/⌘+K); a barra os abre por dois eventos de `window`. O recuo
do conteúdo sai de uma variável CSS que vale a altura da barra abaixo de `lg` e `0px` acima.

**Stack:** Next 16.4.3 · React 19.2.9 · Tailwind v4 · Vitest (ambiente `node`, sem teste de
componente: prova por varredura de fonte, como `src/lib/theme/casca-vidro.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md` §10.2, §6.2, §6.8,
§6.12, §6.13 e §8 (a D67 da §8 não vale; valem as regras do prompt). Desenho da prévia, fora do
git: `C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/previa-vidro/Celular.dc.html`,
linhas 157–162.

## Restrições globais

- Worktree `C:/tmp/09g-barra`, branch `feat/redesign-09g-barra`. Nunca checkout no diretório principal.
- **Sem push, sem PR, sem merge em `main`, sem deploy. Sem migration.** Não editar `CLAUDE.md`,
  `AGENTS.md` nem `docs/redesign/STATUS.md`.
- **Subagentes não fazem commit.** Cada tarefa termina com os testes dela + `npx tsc --noEmit` +
  `npm run lint` verdes. Commit só na Tarefa 7, depois dos cinco comandos com código de saída 0.
- Invariante 91: nada que a barra ou o botão importem pode ser `@/lib/ai/constants`,
  `@/lib/validators/*`, `chat-client`, `@/components/ui/sheet` ou `@/components/ui/dropdown-menu`.
  O `dynamic` do painel continua com **objeto literal**.
- `cn()` é `twMerge`: classe do chamador remove a da primitiva.
- Alvo de toque ≥ 44 px (a prévia usa 52 px). Foco visível por contorno
  (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`).
- Material: `vidro-casca` + `PRESSAO` (de `@/components/ui/materiais`), sem `bg-*`/`border-*`/
  `shadow-*` soltos junto do material. `prefers-reduced-transparency` e `prefers-reduced-motion`
  já vêm do `@utility vidro-casca` e do `PRESSAO`: não acrescentar animação própria.
- Repo público: nada de valor real, nome, banco ou categoria em teste ou doc.
- `Edit` grava CRLF: `sed -i 's/\r$//' <arquivos>` antes do commit. `next dev` reescreve o
  `AGENTS.md`: `git checkout -- AGENTS.md` antes do commit. `rm` só com caminho literal.
- Breakpoint `lg` = `64rem` (padrão do Tailwind v4; `globals.css` não redefine `--breakpoint-*`).

## Decisões tomadas neste plano (e o custo se estiverem erradas)

1. **`viewport-fit=cover` entra.** Sem ele o iOS devolve `0` para `env(safe-area-inset-*)`, e o
   `padding-bottom` pedido não faria nada: no app aberto da tela inicial a barra ficaria em cima
   do indicador de início. O header **não muda** (continua `h-16`, sem `padding-top`), então as
   barras `top-16` continuam certas. Na paisagem o iPhone tem recorte lateral: a raiz da casca
   ganha `padding` lateral de área segura (vale `0` no desktop e em pé). *Custo se errado:* se o
   app instalado estiver em modo de barra de status translúcida, o topo do header passaria por
   baixo da barra de status — só o iPhone real prova; o reparo seria um `padding-top` no header,
   que quebra a premissa `top-16` e por isso **não** foi feito às cegas. Gavetas laterais e
   diálogos não ganham recuo lateral nesta fase (podem encostar no recorte na paisagem).
2. **Eventos de `window` em vez de subir estado.** `QuickAdd` (1.731 linhas) e `SearchCommand`
   são donos do próprio `open`; dois eventos (`yuri:abrir-busca`, `yuri:abrir-lancamento`) os
   abrem sem reestruturar e sem segunda instância. *Custo:* acoplamento invisível ao `tsc`;
   coberto por teste de fonte que exige emissor e ouvinte com a mesma constante.
3. **Um só botão de assistente, por `display: contents`.** A barra recebe o `FloatingAssistant`
   como filho; o botão é o mesmo elemento nas duas larguras. "Dois botões de assistente" deixa de
   ser representável, e o selo de proposta pendente (invariante 90) vai junto para a barra sem
   código novo. *Custo:* `pointer-events: none` do contêiner é **herdado** mesmo com `contents`,
   então cada botão precisa de `pointer-events-auto` (teste fixa); e um ancestral com
   `transform`/`filter`/`backdrop-filter` passaria a ser o bloco de contenção do `fixed` do
   desktop — o contêiner não pode ter nenhum dos três (teste fixa).
4. **Header abaixo de `lg` perde os gatilhos de busca e de lançamento** (ícone e pílula da busca,
   ícone e "Lançar"); os componentes continuam montados ali. Entre 640 e 1023 px a pílula da busca
   do header some e quem busca é a barra. *Custo:* nenhum caminho perdido; só muda onde se toca.
5. **Sessão de treino:** as três barras `fixed bottom-0` (preparar, ao vivo, revisão) sobem para
   cima da barra de ações em vez de esconder a barra nessas rotas. *Custo:* ~72 px a menos de
   tela durante o treino no celular; se o dono preferir, esconder a barra por rota é uma linha
   com `usePathname` (custo de casca a medir).
6. **`data-casca` nos botões da barra**, como o botão do assistente que já o tem: sob diálogo
   aberto o desfoque deles desliga. *Custo:* com diálogo aberto, o texto atrás da barra aparece
   nítido (escurecido pelo overlay).
7. **`themeColor` da §6.13 fica de fora** (não foi pedido nesta fase e não existe hoje).

## Foco da revisão

1. **Selo no celular:** o selo é `absolute`; com o botão em fluxo na barra ele precisa de
   `relative` abaixo de `lg`, senão o número pula para o canto da tela. (Tarefa 3)
2. **Clique morto no desktop:** `pointer-events-none` herdado deixaria o botão do assistente
   inclicável no desktop. (Tarefa 3)
3. **Conteúdo coberto:** fim de página, compositor do chat em `/ia` (`sticky bottom-0`) e barras
   de sessão de treino ficariam atrás da barra. (Tarefas 1 e 4)
4. **Instância dupla:** um segundo `<SearchCommand`/`<QuickAdd`/`<FloatingAssistant` duplicaria
   o Ctrl/⌘+K e o Ctrl/⌘+I (o atalho abriria dois painéis). (Tarefas 2 e 3)
5. **390 px com zoom 200%:** o rótulo "Buscar" precisa encolher (`min-w-0` + `truncate`) em vez
   de empurrar a página (regras 2 e 3 de layout). (Tarefa 2)

---

### Tarefa 0 (controlador): linha de base

- [ ] Na worktree, antes de qualquer mudança: `npm run build`, `npm run perf:bundle`,
  `npm run test:run -- --testTimeout=30000`. Anotar contagem de testes/arquivos, mediana, maior
  rota e o KB de `/(app)/todo` e `/(app)/dashboard`. `git checkout -- AGENTS.md`.
- [x] **Medido em 2026-11-10 sobre `8389279`:** 9.502 testes / 416 arquivos verdes; build e
  `perf:bundle` com saída 0; **mediana 203,9 KB**, 71 rotas, maior **227,6 KB (`/(app)/todo`)**.

### Tarefa 1: área segura, variável do recuo e recuo do conteúdo

**Arquivos:**
- Modificar: `src/app/layout.tsx` (export `viewport`)
- Modificar: `src/app/globals.css` (duas variáveis + media query)
- Modificar: `src/components/layout/app-shell.tsx` (raiz e `<main>`)
- Criar teste: `src/lib/theme/barra-acoes.test.ts` (`describe("09-G · área segura e recuo")`)

**Interfaces — produz:** `--barra-acoes-altura` e `--recuo-barra-acoes` em `:root`, usadas nas
Tarefas 2–4 como `bottom-(--recuo-barra-acoes)` e `pb-[calc(var(--recuo-barra-acoes)+…)]`.

- [ ] **Teste (falha primeiro).** Com `ler()`/`tem()` de `casca-vidro.test.ts` (copiar os dois
  helpers, importando `SRC, semComentarios` de `./ler-tokens`):
  - `layout.tsx` contém `export const viewport` e `viewportFit: "cover"`, e importa `Viewport`
    de `"next"` como tipo.
  - `globals.css` define `--barra-acoes-altura: 4.5rem;` e
    `--recuo-barra-acoes: calc(var(--barra-acoes-altura) + env(safe-area-inset-bottom, 0px));`
    dentro de `:root`, e uma regra `@media (width >= 64rem)` com `--recuo-barra-acoes: 0px;`.
  - `app-shell.tsx`: a raiz tem `pl-[env(safe-area-inset-left)]` e `pr-[env(safe-area-inset-right)]`;
    o `<main>` tem `pt-6` e `pb-[calc(var(--recuo-barra-acoes)+1.5rem)]` e **não** tem `py-6`.
- [ ] `npx vitest run src/lib/theme/barra-acoes.test.ts` → FALHA.
- [ ] Implementar. `export const viewport: Viewport = { viewportFit: "cover" }` em `layout.tsx`.
  As variáveis num bloco `:root` próprio em `globals.css`, perto dos tokens de casca, com
  comentário dizendo que 4,5 rem = 8 px de respiro + 52 px de botão + 12 px de base (a soma das
  classes da Tarefa 2) e que **mexer numa exige mexer na outra**.
- [ ] Testes verdes; `npx tsc --noEmit`; `npm run lint`.
- [ ] Conferir o `<meta name="viewport">` gerado: depois do `npm run build` da Tarefa 7,
  `npm run start` e `curl -s localhost:3000/login | grep -o '<meta name="viewport"[^>]*>'` deve
  trazer `width=device-width, initial-scale=1, viewport-fit=cover`. Se `width`/`initial-scale`
  sumirem, acrescentá-los ao objeto.

### Tarefa 2: a barra, os eventos e o header

**Arquivos:**
- Criar: `src/components/layout/acoes-da-casca.ts` (zero imports)
- Criar: `src/components/layout/barra-de-acoes.tsx`
- Modificar: `src/components/search/search-command.tsx` (ouvinte; gatilhos só em `lg`)
- Modificar: `src/components/quick-add/quick-add.tsx` (ouvinte; gatilhos só em `lg`)
- Teste: `src/lib/theme/barra-acoes.test.ts` (`describe("09-G · barra e eventos")`)

**Interfaces — produz:**
- `acoes-da-casca.ts`: `export const EVENTO_ABRIR_BUSCA = "yuri:abrir-busca"`,
  `export const EVENTO_ABRIR_LANCAMENTO = "yuri:abrir-lancamento"`,
  `export function pedirAcaoDaCasca(evento: typeof EVENTO_ABRIR_BUSCA | typeof EVENTO_ABRIR_LANCAMENTO): void`
  (faz `window.dispatchEvent(new Event(evento))`).
- `barra-de-acoes.tsx`: `"use client"`, `export function BarraDeAcoes({ children }: { readonly children?: React.ReactNode })`.
  A Tarefa 3 passa o `<FloatingAssistant>` como `children`.

- [ ] **Teste (falha primeiro):**
  - `acoes-da-casca.ts` não tem nenhum `import`; os dois valores são distintos e começam com `yuri:`.
  - Contêiner da barra (a primeira tag do `return`): `role="group"`, `aria-label="Ações rápidas"`;
    classes `fixed inset-x-0 bottom-0 z-40 flex items-center gap-2.5 pt-2
    pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pl-[max(1rem,env(safe-area-inset-left))]
    pr-[max(1rem,env(safe-area-inset-right))] pointer-events-none lg:contents`; e **nenhuma**
    classe `transform`/`translate-*`/`scale-*`/`filter`/`blur*`/`backdrop-*`/`vidro-*` no
    contêiner (decisão 3).
  - Botão Buscar: `<button` nativo, `type="button"`, `data-casca`, `vidro-casca`, `PRESSAO`,
    `pointer-events-auto`, `h-[52px]`, `flex-1`, `min-w-0`, `rounded-full`, `lg:hidden`,
    `aria-keyshortcuts="Control+K Meta+K"`, texto visível `Buscar` num `<span>` com `truncate`,
    ícone `Search` com `aria-hidden`; `onClick` chama `pedirAcaoDaCasca(EVENTO_ABRIR_BUSCA)`.
  - Botão Novo lançamento: `Button` (primário padrão), `aria-label="Novo lançamento"`,
    `size-[52px]`, `shrink-0`, `rounded-full`, `pointer-events-auto`, `lg:hidden`; `onClick` chama
    `pedirAcaoDaCasca(EVENTO_ABRIR_LANCAMENTO)`. Verificar com `cn()` de verdade que
    `size-[52px]` sobrevive ao `size` da variante `icon` (se usá-la).
  - Invariante 91 sobre `barra-de-acoes.tsx` e `acoes-da-casca.ts`: mesma lista proibida do teste
    "a invariante 91" de `casca-vidro.test.ts`.
  - `search-command.tsx` e `quick-add.tsx`: `addEventListener(EVENTO_ABRIR_…` **e**
    `removeEventListener(EVENTO_ABRIR_…` com a constante importada; o gatilho de texto tem
    `hidden lg:flex` (busca) / `hidden lg:inline-flex` (lançamento); **não** existe mais gatilho
    com `sm:hidden` nem `sm:flex`/`sm:inline-flex` nesses dois arquivos.
  - Em todo `src/` (fora de testes), `<SearchCommand` e `<QuickAdd` aparecem **uma** vez cada.
- [ ] Rodar → FALHA.
- [ ] Implementar. Visual da prévia: Buscar alinhado à esquerda, `px-[18px]`, `gap-2`,
  `text-muted-foreground`, `font-medium`, ícone `size-[18px]`; "+" com ícone `Plus` `size-[22px]`.
  Em `SearchCommand` o ouvinte faz `setOpen(true)`. Em `QuickAdd` o ouvinte chama
  `handleOpenChange(true)` (carrega as opções) via `React.useEffectEvent` (React 19.2); se o lint
  de hooks recusar, usar um `ref` atualizado a cada render. Remover o `Button` de ícone mobile dos
  dois arquivos; se `Button` deixar de ser usado em `search-command.tsx`, remover o import.
- [ ] Testes verdes (este arquivo + `casca-vidro`, `vidro`, `primitivas`); `tsc`; `lint`.

### Tarefa 3: o botão do assistente mora na barra

**Arquivos:**
- Modificar: `src/components/ai/floating-assistant.tsx`
- Modificar: `src/components/layout/app-shell.tsx` (`<BarraDeAcoes><FloatingAssistant …/></BarraDeAcoes>`)
- Modificar teste: `src/lib/theme/casca-vidro.test.ts` (`describe("09-C · botão do assistente")`)
- Teste: `src/lib/theme/barra-acoes.test.ts` (`describe("09-G · assistente na barra")`)

**Interfaces — consome:** `BarraDeAcoes` (Tarefa 2), `--recuo-barra-acoes` (Tarefa 1).
Assinatura de `FloatingAssistant` **não muda**.

- [ ] **Teste (falha primeiro):**
  - Botão: mantém `vidro-casca`, `PRESSAO`, `data-casca`, `rounded-full`, foco por contorno,
    `aria-label`/`aria-keyshortcuts`/`aria-haspopup`/`aria-expanded`; ganha `relative`,
    `pointer-events-auto`, `size-[52px]`, `shrink-0`, `lg:fixed`, `lg:bottom-4`, `lg:z-40`,
    `lg:size-12`; **não** tem `fixed`, `bottom-4`, `z-40` nem `size-12` sem prefixo.
  - Ramos do canto: `"lg:right-4"` / `"lg:left-4"`, cada um sem o outro e sem `right-4`/`left-4`
    sem prefixo.
  - O `<div>` que embrulha `<Painel` tem a classe `contents` (senão vira um item vazio da linha
    flex e soma um `gap`).
  - O indicador do `dynamic`: `bottom-[calc(var(--recuo-barra-acoes)+1rem)]`, `max-lg:right-4`,
    `max-lg:left-auto`; **não** tem `bottom-4`.
  - `app-shell.tsx`: `<FloatingAssistant` aparece dentro de `<BarraDeAcoes>`; em todo `src/`
    `<FloatingAssistant` aparece **uma** vez e `<BarraDeAcoes` uma vez.
  - O teste da invariante 91 continua verde sem afrouxar.
  - Atualizar no `casca-vidro.test.ts` as asserções antigas (`fixed`, `bottom-4`, `z-40`,
    `size-12`, `relative === false`, `right-4`/`left-4`) para a forma nova, com comentário de que
    a 09-G as moveu para `lg:`.
- [ ] Rodar → FALHA.
- [ ] Implementar. Atualizar o comentário do topo de `floating-assistant.tsx` ("67 rotas" → 71) e
  explicar em duas linhas o `contents` e o `pointer-events-auto`.
- [ ] Testes verdes (incluindo `painel.test.ts`, `painel-persistencia.test.ts`); `tsc`; `lint`.

### Tarefa 4: nada fica atrás da barra

**Arquivos:**
- Modificar: `src/components/training/session/prepare-review-client.tsx:832`,
  `session-live-client.tsx:685`, `session-review-client.tsx:518` (`bottom-0` →
  `bottom-(--recuo-barra-acoes)`)
- Modificar: `src/components/ai/chat-client.tsx:777` (só o ramo não compacto)
- Teste: `src/lib/theme/barra-acoes.test.ts` (`describe("09-G · nada fica atrás da barra")`)

- [ ] **Teste (falha primeiro):**
  - Nos três clientes de sessão, a barra `fixed inset-x-0` tem `bottom-(--recuo-barra-acoes)` e
    não tem `bottom-0`.
  - Varredura de `src/components` e `src/app` (fora de `components/ui/` e de testes): nenhuma
    classe `fixed` junto de `bottom-0` na mesma string de classe.
  - `chat-client.tsx`: o compositor `sticky` usa `bottom-0` quando `compacto` (dentro da gaveta,
    que fica acima da barra) e `bottom-(--recuo-barra-acoes)` quando não; os dois ramos lidos do
    ternário, como o teste do `hidden ? "…"` da sidebar faz.
- [ ] Rodar → FALHA.
- [ ] Implementar (o ternário de `chat-client` passa a escolher também o `bottom-*`).
- [ ] Testes verdes (incluindo `chat-events.test.ts`, `resposta-em-andamento.test.ts`); `tsc`; `lint`.

### Tarefa 5: as telas de configuração dizem que o canto não vale no celular

**Arquivos:**
- Modificar: `src/lib/ai/painel.ts` (constante de texto; o arquivo continua **sem import**, invariante 90)
- Modificar: `src/components/ai/ai-preferences-form.tsx` (cartão "Botão flutuante", ~linha 600)
- Modificar: `src/components/ai/floating-assistant-panel.tsx` (menu "Mais opções" e toast de ocultar)
- Teste: `src/lib/ai/painel.test.ts` + `src/lib/theme/barra-acoes.test.ts` (`describe("09-G · configuração")`)

**Interfaces — produz:** `export const AVISO_DO_CANTO_NO_CELULAR =
"Em telas estreitas (celular e tablet), o botão fica na barra de ações embaixo da tela, e a posição não se aplica."`

- [ ] **Teste (falha primeiro):**
  - `painel.test.ts`: a constante existe, termina em ponto, e o arquivo continua sem `import`.
  - `ai-preferences-form.tsx` renderiza `{AVISO_DO_CANTO_NO_CELULAR}` sempre (fora do ramo
    `form.floatingHidden ?`), num `<p>` com id próprio que entra no `aria-describedby` do
    `SelectTrigger` junto do aviso de oculto quando este existir.
  - `floating-assistant-panel.tsx`: o item "Mover para o …" carrega um `<span>` com `lg:hidden`
    contendo `só no computador`; o toast de ocultar cita o atalho **e** a página Conversar.
- [ ] Rodar → FALHA.
- [ ] Implementar. Texto do toast:
  `` `Botão oculto. O atalho ${ATALHO_DO_PAINEL} e a página Conversar continuam abrindo o assistente.` ``
- [ ] Testes verdes (incluindo `ia-sistema-dialogos.test.ts`, `ia-sistema-contratos.test.ts`,
  `validators/ai.test.ts`); `tsc`; `lint`.

### Tarefa 6: documentos

**Arquivos:** `docs/redesign/REFERENCIA-VISUAL.md` §1, `docs/redesign/TOKENS.md`,
`docs/redesign/VIDRO-MEDICOES.md`.

- [ ] `REFERENCIA-VISUAL.md` §1, no item "Não vale" da barra: nota de que a REDESIGN-09-G
  (2026-11-10, spec §10.2) **revoga em parte a D65** — entra uma barra de **ações** (Buscar, Novo
  lançamento, Assistente) abaixo de `lg`; a de **abas** continua fora e a navegação segue no menu
  de três linhas.
- [ ] `TOKENS.md`: as duas variáveis da Tarefa 1, o que somam e onde são usadas.
- [ ] `VIDRO-MEDICOES.md`: seção "09-G" com antes/depois (testes, mediana, maior rota, KB de
  `/(app)/todo`), custo de casca em KB, o que foi e o que não foi conferido no navegador, e a
  conferência do iPhone como pendente.

### Tarefa 7 (controlador): verificação, conferência e commit

- [ ] `npm run test:run -- --testTimeout=30000`, `npm run lint`, `npx tsc --noEmit`,
  `npm run build`, `npm run perf:bundle` — conferir o código de saída de cada um. Nenhuma rota
  acima de 250 KB; o custo de casca (delta na mediana) vai para a Tarefa 6.
- [ ] Meta viewport (Tarefa 1, último passo).
- [ ] Chrome com a sessão do dono (harness de iframes da memória), 390/768/1280/1440 × claro/escuro:
  as três ações abrem o diálogo certo; Ctrl/⌘+K e Ctrl/⌘+I abrem **um** diálogo/painel; o selo
  aparece no botão da barra; `floating_hidden` ligada (o assistente some da barra, Ctrl/⌘+I abre)
  e desligada — **voltar a preferência ao valor original**; fim de uma página longa (último item
  visível acima da barra); formulário (`QuickAdd`) e gaveta (menu do celular, painel) abertos por
  cima da barra; 1280/1440 idênticos a antes, com o círculo flutuante no canto certo.
- [ ] Na mesma rodada, `/ia` e o painel: campo em ladrilho, resposta direto na névoa, secundários
  em `muted-on-fog`, e o compositor de `/ia` acima da barra a 390 px. Registrar o que divergir,
  sem corrigir o que for de fora do escopo.
- [ ] `git checkout -- AGENTS.md`; `sed -i 's/\r$//'` nos arquivos alterados; conferir
  `git diff --stat` e o diff inteiro por segredo/valor real; commits locais
  (`feat(redesign): 09-G barra de ações do celular` + `docs(redesign): 09-G medições e nota da D65`).
- [ ] Pedir ao dono a conferência no iPhone real (em pé e deitado, Safari e app da tela inicial):
  a barra acima do indicador de início, o header sem passar por baixo da barra de status.
- [ ] Relatório final e parar.

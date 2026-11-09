# REDESIGN-09-C — Casca em vidro: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development, uma task por vez. Passos com `- [ ]`.

**Objetivo:** vestir de vidro a sidebar, o header, o menu do celular, o assistente flutuante e o login/cadastro, sem mudar navegação, conteúdo ou regra.

**Arquitetura:** a coluna da sidebar continua com as larguras de hoje (256 / 76 / 0 px) e o painel flutua dentro dela, então a largura útil do conteúdo não muda. Os materiais já existem (`vidro-casca`, `vidro-cartao`, `MATERIAL_PILULA`, `PRESSAO`); entra um token só.

**Tecnologia:** Next.js 16, Tailwind v4, Vitest em ambiente node (prova por varredura de fonte sem comentários e medição de contraste).

**Spec:** `docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md` (§6.2, §6.8, §6.12). Prévia, só leitura: `C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/previa-vidro/Main.dc.html`.

## Restrições globais

- Worktree `C:/tmp/09-vidro`, branch `feat/redesign-09-vidro`. Sem push, PR, merge ou deploy.
- Nenhuma migration, nenhuma dependência nova, nenhuma regra de negócio. Não editar `CLAUDE.md`, `AGENTS.md`, `docs/redesign/STATUS.md`.
- Antes de cada commit: `sed -i 's/\r$//'` nos arquivos alterados, `git checkout -- AGENTS.md`, revisar o diff atrás de segredo. Commit só depois de ver os comandos passarem, com `Co-Authored-By` do modelo que escreveu.
- Repositório público: nenhum valor em R$, nome de pessoa, banco ou categoria em teste ou documento.
- Nenhuma rota sobe mais de 1 KB gz (comparar as 71 rotas com a base em três casas).
- Header: `sticky top-0 z-30 h-16`, sempre.
- `@utility vidro-*` e `ladrilho` são desconhecidas do `twMerge`; `cn()` não as remove nem deixa de remover nada. Não combinar `vidro-*` com `bg-*`, `border-*` ou `shadow-*` na mesma peça.
- Invariante 91: `floating-assistant.tsx` não importa `@/lib/ai/constants`, `@/lib/validators/*`, `chat-client`, `ui/sheet`, `ui/dropdown-menu`; o `next/dynamic` continua com objeto literal.
- Texto novo sobre vidro entra em `contraste-dos-tokens.test.ts`, incluindo hover. Texto >= 4,5:1; limite de controle e ícone de estado >= 3:1.

## Foco da revisão

1. Sidebar oculta: nenhum filete de 12 px ou de borda sobra na coluna de largura zero (padding conta na largura).
2. Altura baixa (notebook de 720 px): a lista rola dentro do painel flutuante e o botão "Recolher" continua visível.
3. Foco de teclado em item do menu: o contorno não pode ser cortado pelo `overflow` da área de rolagem.
4. Cores forçadas: a pílula ativa perde o fundo, e o item ativo precisa continuar identificável.
5. Assistente no canto esquerdo a partir de `lg`: fica sobre o painel da sidebar. Já acontecia antes; conferir e relatar, sem mudar a posição.

Os itens 1, 3 e 4 têm teste na Task 2. Os itens 2 e 5 são da conferência visual (Task 6).

---

### Task 1: token do item ativo e contraste da casca

**Arquivos:** modificar `src/app/globals.css`, `src/lib/theme/contraste-dos-tokens.test.ts`.

**Produz:** token `--nav-ativo-ink` e classe `text-nav-ativo-ink`.

Medição prévia, sobre vidro e sobreposição nas quatro superfícies: no escuro, `primary` sobre `pill-strong` dá 3,42:1 e `muted-foreground` sobre `pill` dá 4,48:1. Nenhum dos dois depende do alfa da névoa.

- [ ] **Passo 1:** acrescentar `describe("09-C · casca")`, nos dois temas, com:
  - `nav-ativo-ink` sobre `compor(pill-strong, S)` >= 4,5, com S nas quatro superfícies de vidro e nas quatro composições de `glass-strong`;
  - `muted-foreground` sobre `compor(tile, S)` >= 4,5 (texto da busca);
  - `field-border` composto sobre `compor(tile, S)`, contra esse mesmo fundo, >= 3 (limite da busca);
  - `foreground` e `muted-foreground` sobre as composições de `glass-strong` >= 4,5 (gaveta);
  - `nav-ativo-ink` sobre `compor(pill-strong, S)` >= 3 fica coberto pelo primeiro item, que também vale para o aro do modo recolhido.
- [ ] **Passo 2:** rodar `npx vitest run src/lib/theme/contraste-dos-tokens.test.ts`. Esperado: FALHA, token inexistente.
- [ ] **Passo 3:** em `globals.css`, `--nav-ativo-ink: #0062d6` em `:root`, `--nav-ativo-ink: #9cc4ff` em `.dark` (4,78:1 medido) e `--color-nav-ativo-ink: var(--nav-ativo-ink)` no `@theme inline`.
- [ ] **Passo 4:** rodar o mesmo comando. Esperado: PASSA. Commit.

### Task 2: sidebar flutuante, item ativo em pílula

**Arquivos:** modificar `src/components/layout/sidebar.tsx`, `nav-links.tsx`, `src/components/shared/logo.tsx`. Criar `src/lib/theme/casca-vidro.test.ts`.

**Consome:** `text-nav-ativo-ink`, `PRESSAO` de `@/components/ui/materiais`.

**Produz:** atributo `data-casca` no painel, usado pela Task 3. `casca-vidro.test.ts`, ampliado pelas Tasks 3 a 5. Leitor de fonte por `semComentarios` de `ler-tokens`.

- [ ] **Passo 1:** testes que falham, sobre a fonte sem comentários:
  - `aside`: mantém `sticky top-0 hidden h-svh shrink-0`, `lg:flex`, `w-64`, `w-[4.75rem]`, `w-0`; tem `transition-[width,padding]` e `motion-reduce:transition-none`; não tem `bg-sidebar` nem `border-r`;
  - estado oculto: contém `p-0` e `overflow-hidden`; o estado visível contém `py-3 pl-3`;
  - painel filho: `data-casca`, `vidro-casca`, `rounded-[28px]`, `overflow-hidden`, `h-full`;
  - `nav-links`: ativo com `bg-pill-strong text-nav-ativo-ink font-semibold`; hover com `hover:bg-tile`; usa `PRESSAO`; tem `focus-visible:outline-2` e `-outline-offset-2`; tem `forced-colors:` no ativo; não tem mais `bg-primary/10`, `text-sidebar-foreground/80`, nem o `<span` da barra lateral;
  - rótulo de seção usa `text-muted-foreground` sem `/70`.
- [ ] **Passo 2:** rodar `npx vitest run src/lib/theme/casca-vidro.test.ts`. Esperado: FALHA.
- [ ] **Passo 3:** `aside` vira a coluna transparente: `sticky top-0 hidden h-svh shrink-0 flex-col transition-[width,padding] duration-300 ease-in-out motion-reduce:transition-none lg:flex`, mais `w-0 overflow-hidden p-0` (oculta), `w-[4.75rem] py-3 pl-3` (recolhida) ou `w-64 py-3 pl-3` (normal). Dentro, `div data-casca` com `vidro-casca flex h-full min-h-0 flex-col overflow-hidden rounded-[28px]`. Linha da marca em `h-14`; sem as divisórias `border-sidebar-border`; recuo interno `px-2` recolhida e `px-3` normal. Mantêm-se `aria-hidden`, `inert` e o `min-h-0` da `ScrollArea`.
- [ ] **Passo 4:** `nav-links`: item com `${PRESSAO}`, `rounded-[14px]`, `text-foreground`, ícone `text-muted-foreground`; ativo `bg-pill-strong font-semibold text-nav-ativo-ink shadow-[inset_0_1px_0_var(--glass-hi),0_6px_16px_-8px_rgba(16,24,40,.3)] forced-colors:outline forced-colors:outline-2`, com o ícone herdando a cor. No modo recolhido, o ativo soma `ring-1 ring-nav-ativo-ink`, porque ali não há texto que confirme o estado. Foco: `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`.
- [ ] **Passo 5:** `logo.tsx`: monograma em `bg-primary-fill text-primary-fill-foreground`.
- [ ] **Passo 6:** rodar o teste e `npx tsc --noEmit`. Esperado: passam. Commit.

### Task 3: header em vidro, busca em pílula, casca sem desfoque sob sobreposição

**Arquivos:** modificar `src/components/layout/header.tsx`, `src/components/search/search-command.tsx`, `src/app/globals.css`, `src/lib/theme/casca-vidro.test.ts`, `src/lib/theme/vidro.test.ts`.

**Produz:** regra CSS para `[data-casca]`, que a Task 4 usa no botão do assistente.

- [ ] **Passo 1:** testes que falham:
  - `header` tem `sticky`, `top-0`, `z-30`, `h-16`, `vidro-casca`, `data-casca`; não tem `backdrop-blur`, `bg-background`, `border-b`;
  - margem e canto condicionados a `sidebarHidden`: `lg:ml-3` e `lg:rounded-bl-[20px]` só com a sidebar visível;
  - gatilho desktop da busca: `rounded-full`, `bg-tile`, `border-field-border`, `shadow-[inset_0_1px_0_var(--glass-hi)]`, sem `bg-card`, sem `backdrop-`; `kbd` sem `bg-muted`;
  - em `vidro.test.ts`: `[data-casca]` aparece na regra de `body:has(...)` com `backdrop-filter: none` nas duas grafias, `-webkit-` antes.
- [ ] **Passo 2:** rodar os dois arquivos. Esperado: FALHA.
- [ ] **Passo 3:** aplicar no `header` as classes do Passo 1 com `cn`. A busca usa `bg-tile`, não `bg-pill`, porque `muted-foreground` sobre `pill` mede 4,48:1 no escuro. O hover troca só a borda (`hover:border-foreground/60`) e não o fundo, porque o fundo do hover seria o par reprovado.
- [ ] **Passo 4:** em `globals.css`, regra própria, sem camada, logo depois da regra "vidro sobre vidro": `body:has([data-slot="dialog-content"], [data-slot="sheet-content"]) [data-casca]` com `-webkit-backdrop-filter: none; backdrop-filter: none`.
- [ ] **Passo 5:** rodar os testes. Esperado: passam. Commit.

### Task 4: menu do celular e assistente flutuante

**Arquivos:** modificar `src/components/layout/mobile-nav.tsx`, `src/components/ai/floating-assistant.tsx`, `src/lib/theme/casca-vidro.test.ts`.

**Consome:** `PRESSAO`, `[data-casca]`.

- [ ] **Passo 1:** testes que falham:
  - `mobile-nav`: sem `border-sidebar-border`, mantém `lg:hidden` e `SheetContent side="left"`;
  - assistente: `<button` nativo com `data-casca`, `vidro-casca`, `rounded-full`, `size-12`, `z-40`, `PRESSAO`, `focus-visible:outline-2`; ícone `text-nav-ativo-ink`; selo informativo em `bg-primary-fill text-primary-fill-foreground`; mantém `aria-label`, `aria-keyshortcuts`, `aria-haspopup`, `aria-expanded`;
  - imports: nenhum da lista proibida da invariante 91; `dynamic(` com `{ ssr: false, loading: () => null }` literal.
- [ ] **Passo 2:** rodar o teste. Esperado: FALHA.
- [ ] **Passo 3:** trocar `Button` por `<button>` nativo no assistente, porque o `Button` traz fundo próprio e o material usa `background` abreviado. Import de `Button` sai; `PRESSAO` entra. O resto do comportamento não muda.
- [ ] **Passo 4:** na gaveta, tirar a divisória da linha da marca.
- [ ] **Passo 5:** rodar o teste, `npm run build` e `npm run perf:bundle`. Esperado: passam. Commit.

### Task 5: login e cadastro

**Arquivos:** modificar `src/app/(auth)/layout.tsx`, `src/components/auth/auth-form.tsx`, `src/app/globals.css`, `src/lib/theme/casca-vidro.test.ts`, `src/lib/theme/contraste-dos-tokens.test.ts`.

**`DIVIDA_NA_NEVOA`:** as 15 entradas são combinações de token, calculadas pela matriz. Como os tokens não mudam, as 15 **continuam** reprovando. O que **sai** é o uso real em login e cadastro: `text-primary` (links) e `text-destructive` (erros de campo) passam para dentro do cartão de vidro, onde já têm 4,5:1 medido. O comentário da lista passa a dizer que ela é uma proibição de uso direto na névoa e que a dona dos usos que restarem em páginas é a 09-F. A trava contra uso novo em login e cadastro é o teste do Passo 1.

- [ ] **Passo 1:** testes que falham:
  - o elemento que embrulha `{children}` em `layout.tsx` tem `vidro-cartao` e `rounded-[28px]`;
  - `layout.tsx`, fonte inteira, sem `bg-neutral-950`, `text-neutral-`, `text-primary`, `text-destructive`, `-ink`, `text-gradient-brand`, `blur-3xl`;
  - `globals.css` sem `@utility text-gradient-brand`;
  - `auth-form.tsx` sem `text-muted-on-fog`.
- [ ] **Passo 2:** rodar o teste. Esperado: FALHA.
- [ ] **Passo 3:** `layout.tsx`: coluna da marca sem fundo próprio, texto direto na névoa só em `text-foreground` e `text-muted-on-fog`; ícones dos destaques em `ladrilho` com `text-foreground`; monograma em `bg-primary-fill text-primary-fill-foreground`. Formulário em `vidro-cartao rounded-[28px] p-6 sm:p-8`. Sai o span com gradiente e sai a `@utility`. A varredura `text-gradient-gold` de `tokens.test.ts` continua valendo.
- [ ] **Passo 4:** `auth-form.tsx`: `text-muted-on-fog` vira `text-muted-foreground`, porque agora está sobre vidro.
- [ ] **Passo 5:** atualizar o comentário de `DIVIDA_NA_NEVOA`. Rodar os testes de tema. Esperado: passam. Commit.

### Task 6: verificação, conferência visual e registro

**Arquivos:** modificar `docs/redesign/VIDRO-MEDICOES.md` e `docs/redesign/TOKENS.md` (§6-B: `--nav-ativo-ink`, `data-casca`).

- [ ] **Passo 1:** rodar os cinco comandos. Comparar as 71 rotas com a base em três casas: nenhuma acima de +1,000 KB.
- [ ] **Passo 2:** conferir no CSS do build `-webkit-backdrop-filter` antes de `backdrop-filter` nas regras novas.
- [ ] **Passo 3:** servidor de produção; pedir ao dono a janela do Chrome à frente e o login. Harness em 390, 768, 1280 e 1440 px, claro e escuro, nas telas do prompt, mais sidebar recolhida e oculta, altura baixa, assistente no canto esquerdo. `/login` e `/cadastro` em Chrome headless. Borda `--field-border` e `Select` Radix no seletor de período do `/dashboard`. Reduzir transparência e movimento simulados, e dito assim no relatório.
- [ ] **Passo 4:** amostrador em `/dashboard` e `/dashboard/financeiro`, 3 rodadas por 2 temas. Aceite: nenhum quadro acima de 50 ms, lido por repetição. Avisar o dono do teste no iPhone.
- [ ] **Passo 5:** registrar a seção 09-C. Commit. Relatório final e parar.

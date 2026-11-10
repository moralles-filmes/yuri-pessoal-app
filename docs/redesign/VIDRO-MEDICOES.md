# REDESIGN-09-A — medições do vidro (antes × depois)

Registro de desempenho da 09-A. Nenhum valor em R$, nenhum print. O "antes" é a base
`2fa0e01` (00-auditoria com as correções da 08 integradas na 09), medida em 2026-11-07.

## Como foi medido

- **Servidor:** produção local (`npm run build && npm run start -- -H 0.0.0.0`), com o
  `.env.local` do projeto (as `NEXT_PUBLIC_*` entram no build). Nunca o `next dev`.
- **Desktop:** Chrome do dono, com sessão, pela extensão Claude in Chrome. A janela estava
  maximizada a 2560 px e não aceitava redimensionar, então a tela é medida num **iframe da mesma
  origem de 1280×800** sobreposto à aba, com o tema forçado trocando a classe `light`/`dark` do
  `<html>` do iframe. Cada medição: 5 s de rolagem contínua (desce até o fim na 1ª metade e
  sobe na 2ª), conduzida por `requestAnimationFrame`, gravando o intervalo de cada quadro.
  3 repetições por tela e tema.
- **Telas:** `/dashboard` e `/dashboard/financeiro`. ⚠️ O plano dizia `/financeiro`, mas
  essa rota é a entrada curta do módulo e **não rola** (736 px de conteúdo numa janela de
  800 px; a 2560 px também não). A tela financeira com gráficos, a que o desenho cita, é
  `/dashboard/financeiro`.
- ⚠️ **Limite da medição:** o monitor roda a ~200 Hz e a extensão **não desacelera a CPU** (o
  desenho pedia 4×). Sem isso, a máquina sobra: o p95 fica preso em 5,1 ms, que é o intervalo
  de um quadro. O amostrador só pega engasgos grandes (o quadro máximo), e não diferenças finas
  de custo de pintura. **O teste do iPhone é a medida que decide.**

### Amostrador

```js
async function medir(path, tema) {
  const f = document.createElement("iframe");
  f.src = path;
  Object.assign(f.style, { position: "fixed", left: "0", top: "0", width: "1280px",
    height: "800px", zIndex: 2147483647, border: "0" });
  document.body.appendChild(f);
  await new Promise((r) => (f.onload = r));
  await new Promise((r) => setTimeout(r, 2500));
  const w = f.contentWindow, h = f.contentDocument.documentElement;
  h.classList.remove("light", "dark");
  h.classList.add(tema === "escuro" ? "dark" : "light");
  await new Promise((r) => setTimeout(r, 500));
  async function uma(ms = 5000) {
    const max = h.scrollHeight - w.innerHeight;
    w.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
    const iv = []; let t0 = null, prev = null;
    await new Promise((res) => {
      function g(t) {
        if (t0 === null) { t0 = t; prev = t; } else { iv.push(t - prev); prev = t; }
        const p = (t - t0) / ms;
        w.scrollTo(0, max * (p < 0.5 ? p * 2 : 2 - p * 2));
        if (t - t0 < ms) w.requestAnimationFrame(g); else res();
      }
      w.requestAnimationFrame(g);
    });
    const s = [...iv].sort((a, b) => a - b), m = iv.reduce((a, b) => a + b, 0) / iv.length;
    return { quadros: iv.length, fps: +(1000 / m).toFixed(1),
      p95ms: +s[Math.floor(s.length * 0.95)].toFixed(1), maiorms: +s[s.length - 1].toFixed(1) };
  }
  const r = [];
  for (let i = 0; i < 3; i++) r.push(await uma());
  return r;
}
```

## Desktop — antes (base `2fa0e01`)

Rolagem total: `/dashboard` 1.708 px; `/dashboard/financeiro` 4.350 px.

| Tela | Tema | Rodada | Quadros | fps médio | p95 (ms) | maior quadro (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| `/dashboard` | escuro | 1 | 999 | 199,6 | 5,1 | 10,9 |
| `/dashboard` | escuro | 2 | 1001 | 200,0 | 5,1 | 5,3 |
| `/dashboard` | escuro | 3 | 978 | 195,4 | 5,1 | **64,8** |
| `/dashboard` | claro | 1 | 995 | 198,8 | 5,1 | 15,1 |
| `/dashboard` | claro | 2 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard` | claro | 3 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard/financeiro` | escuro | 1 | 991 | 198,0 | 5,1 | 40,1 |
| `/dashboard/financeiro` | escuro | 2 | 1001 | 200,0 | 5,1 | 5,1 |
| `/dashboard/financeiro` | escuro | 3 | 1001 | 200,0 | 5,1 | 5,1 |
| `/dashboard/financeiro` | claro | 1 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard/financeiro` | claro | 2 | 1001 | 200,0 | 5,1 | 5,1 |
| `/dashboard/financeiro` | claro | 3 | 1001 | 200,0 | 5,1 | 5,1 |

⚠️ O "antes" **já tem** um quadro acima de 50 ms (64,8 ms, `/dashboard` escuro, 3ª rodada) e
um de 40 ms. Os dois são isolados e aparecem em rodadas diferentes da mesma tela, o que aponta
para trabalho de fundo (coleta de memória, carregamento sob demanda), não para pintura. Na T9, o
aceite "nenhum quadro acima de 50 ms" é lido **por repetição**: um engasgo isolado que também
aparece no "antes" não reprova, e um que se repete nas três rodadas reprova.

## iPhone — antes

Safari do iPhone do dono, na mesma Wi-Fi, em `http://<IP do PC>:3000`, rolando `/dashboard` e
`/dashboard/financeiro` nos dois temas.

> "Não travou" (resposta do dono, 2026-11-07).

## Testes e orçamento — antes

- `npm run test:run -- --testTimeout=30000`: **8.285 testes em 368 arquivos**, todos verdes.
- `npm run lint` e `npx tsc --noEmit`: limpos.
- `npm run build`: ok.
- `npm run perf:bundle`: todas as rotas dentro do orçamento. Mediana **203,0 KB** gz (build com o `.env.local`; sem ele, 202,8), 71 rotas,
  0 com teto próprio. A tabela abaixo lista **todas** as rotas (o script imprime só as 10
  maiores; a lista completa sai da mesma conta).

| KB gz | Rota | Chunks |
| --- | --- | --- |
| 226.4 | `/(app)/todo` | 19 |
| 222.2 | `/(app)/rotinas` | 18 |
| 217.4 | `/(app)/treinos/calendario` | 19 |
| 216.8 | `/(app)/tarefas` | 18 |
| 215.3 | `/(app)/financeiro/lancamentos` | 20 |
| 215.1 | `/(app)/habitos` | 19 |
| 214.7 | `/(app)/nutricao/diario` | 19 |
| 214.7 | `/(app)/treinos/treinos/[id]` | 19 |
| 214.5 | `/(app)/treinos/evolucao` | 20 |
| 213.8 | `/(app)/nutricao/relatorios` | 19 |
| 212.9 | `/(app)/agenda` | 17 |
| 212.6 | `/(app)/treinos/relatorios` | 19 |
| 211.4 | `/(app)/treinos/sessao` | 19 |
| 210.9 | `/(app)/terceiros` | 17 |
| 210.5 | `/(app)/treinos/sessao/preparar` | 18 |
| 210.0 | `/(app)/nutricao/compras` | 19 |
| 209.4 | `/(app)/relatorios` | 18 |
| 208.1 | `/(app)/treinos/historico` | 19 |
| 207.9 | `/(app)/nutricao/medidas` | 18 |
| 206.8 | `/(app)/treinos/metas` | 19 |
| 206.6 | `/(app)/importar` | 18 |
| 206.4 | `/(app)/treinos/exercicios/[id]` | 19 |
| 206.2 | `/(app)/financeiro/recorrencias` | 19 |
| 206.0 | `/(app)/cartoes/meus` | 18 |
| 205.8 | `/(app)/financeiro/contas-fixas` | 19 |
| 205.5 | `/(app)/nutricao/refeicoes` | 18 |
| 205.2 | `/(app)/financeiro/contas` | 19 |
| 204.7 | `/(app)/nutricao/planejamento` | 18 |
| 204.7 | `/(app)/dashboard/financeiro` | 18 |
| 204.3 | `/(app)/treinos/historico/[id]` | 17 |
| 204.0 | `/(app)/nutricao/alimentos` | 18 |
| 203.7 | `/(app)/treinos/sessao/revisar` | 18 |
| 203.6 | `/(app)/financeiro/categorias` | 19 |
| 203.3 | `/(app)/treinos/recordes` | 18 |
| 203.2 | `/(app)/nutricao/receitas` | 18 |
| 203.0 | `/(app)/ia/configuracoes` | 18 |
| 201.7 | `/(app)/nutricao/substituicoes` | 18 |
| 201.4 | `/(app)/treinos/treinos` | 18 |
| 201.1 | `/(app)/nutricao/metas` | 18 |
| 200.1 | `/(app)/treinos/exercicios` | 18 |
| 200.0 | `/(app)/nutricao/configuracoes` | 17 |
| 199.7 | `/(app)/treinos/configuracoes` | 17 |
| 199.5 | `/(app)/faturas` | 19 |
| 199.3 | `/(app)/dashboard` | 17 |
| 199.3 | `/(app)/ia` | 18 |
| 199.0 | `/(app)/treinos/programas` | 18 |
| 198.5 | `/(app)/parcelamentos` | 17 |
| 198.3 | `/(app)/ia/conversas/[id]` | 18 |
| 198.1 | `/(app)/ia/comprovantes` | 18 |
| 196.6 | `/(app)/configuracoes` | 17 |
| 196.0 | `/(app)/estudos/[id]` | 17 |
| 194.8 | `/(app)/ia/insights` | 17 |
| 194.5 | `/(app)/ia/acoes` | 17 |
| 194.0 | `/(app)/nutricao` | 17 |
| 192.9 | `/(app)/estudos` | 17 |
| 192.5 | `/(app)/ia/memoria` | 17 |
| 192.2 | `/(app)/treinos/hoje` | 17 |
| 191.1 | `/(app)/ia/conversas` | 17 |
| 190.6 | `/(app)/treinos` | 16 |
| 189.6 | `/(app)/cartoes/relatorios` | 17 |
| 189.1 | `/(app)/ia/consumo` | 16 |
| 189.0 | `/(app)/notificacoes` | 16 |
| 187.4 | `/(app)/cartoes/proximos-meses` | 17 |
| 186.5 | `/(app)/busca` | 16 |
| 186.4 | `/(app)/cartoes` | 16 |
| 186.0 | `/(app)/financeiro` | 17 |
| 161.5 | `/(auth)/login` | 11 |
| 161.5 | `/(auth)/cadastro` | 11 |
| 49.1 | `/` | 6 |
| 49.1 | `/_not-found` | 6 |
| 3.9 | `/_global-error` | 1 |

## Desktop — depois (base do vidro, `75fd464`)

Mesmo amostrador, mesmo iframe de 1280×800, servidor de produção, 2026-11-07. Rolagem total:
`/dashboard` 1.724 px (+16, o raio maior); `/dashboard/financeiro` 4.382 px (+32).

| Tela | Tema | Rodada | Quadros | fps médio | p95 (ms) | maior quadro (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| `/dashboard` | escuro | 1 | 1001 | 200,0 | 5,1 | 5,1 |
| `/dashboard` | escuro | 2 | 1001 | 200,0 | 5,1 | 5,3 |
| `/dashboard` | escuro | 3 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard` | claro | 1 | 940 | 187,8 | 5,1 | 30,0 |
| `/dashboard` | claro | 2 | 973 | 194,4 | 5,1 | 20,0 |
| `/dashboard` | claro | 3 | 988 | 197,4 | 5,1 | 25,0 |
| `/dashboard` | claro (2ª série) | 1 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard` | claro (2ª série) | 2 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard` | claro (2ª série) | 3 | 1001 | 200,0 | 5,1 | 5,3 |
| `/dashboard/financeiro` | escuro | 1 | 1000 | 199,8 | 5,1 | 10,6 |
| `/dashboard/financeiro` | escuro | 2 | 1001 | 200,0 | 5,1 | 5,3 |
| `/dashboard/financeiro` | escuro | 3 | 999 | 199,6 | 5,1 | 11,1 |
| `/dashboard/financeiro` | claro | 1 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard/financeiro` | claro | 2 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard/financeiro` | claro | 3 | 1001 | 200,0 | 5,1 | 5,2 |

**Aceite: nenhum quadro acima de 50 ms** (o "antes" tinha um de 64,8). A 1ª série de
`/dashboard` claro teve engasgos de 20–30 ms nas três rodadas; repetida logo em seguida, saiu
limpa (5,2–5,3 ms nas três). Se fosse custo de pintura do vidro, ele voltaria na segunda série; o padrão
aponta para trabalho de fundo da máquina naquele momento, não para a névoa. O p95 continua
preso no intervalo de um quadro (5,1 ms), com o mesmo limite de medição do "antes" (sem
desaceleração de CPU).

## iPhone — depois

Mesmo método do "antes": Safari do iPhone do dono, mesma Wi-Fi, `http://<IP do PC>:3000`,
`/dashboard` e `/dashboard/financeiro` nos dois temas.

> "Teste no iphone tudo ok" (resposta do dono, 2026-11-07).

É a única confirmação do `backdrop-filter` no Safari/WebKit: o desktop mediu no Chrome.

## Testes e orçamento — depois

- `npm run test:run -- --testTimeout=30000`: **8.338 testes em 371 arquivos**, todos verdes
  (+53 testes e +3 arquivos: `contraste`, `contraste-dos-tokens` e `vidro`).
- `npm run lint` e `npx tsc --noEmit`: limpos.
- `npm run build`: ok.
- `npm run perf:bundle`: todas as rotas dentro do orçamento, mediana **203,0 KB** gz (igual),
  71 rotas. Comparando as 71 com a tabela do "antes": **nenhuma subiu**; duas caíram 0,1 KB
  (`/(app)/treinos/calendario` e `/(app)/ia`), as outras 69 ficaram idênticas. A névoa, os
  materiais e a fonte são CSS e não entram na conta de JS. A Inter passou a `preload: false`:
  o woff2 latino (47,3 KB) só baixa onde a fonte do sistema Apple não existe.
- **Depois da correção da revisão final (`f3d5ccb`)**: 8.341 testes em 371 arquivos (+3, os testes de
  "reduzir transparência" nos tokens e da matriz de texto sobre a névoa); lint, tipos e build
  limpos; mediana 203,0 KB. Uma rota subiu 0,1 KB (`/(app)/treinos/exercicios/[id]`, a troca de
  classe no `PageHeader`), dentro da tolerância de 1 KB do plano; as outras ficaram como acima.

## Conferência visual — depois

`/dashboard`, `/financeiro` e `/todo` com a sessão do dono (iframes de 390/768/1280/1440 px),
`/login` sem sessão (Chrome headless), claro e escuro. A névoa aparece atrás do conteúdo em
todas, os cartões ficam translúcidos e o texto continua legível. Sem as primitivas (09-B) e a
casca (09-C), estas coisas ainda destoam — anotadas, não corrigidas:

- **Header** continua `bg-background/80`: no escuro vira uma faixa mais escura sobre a névoa (09-C).
- **Painel da marca do `/login`** continua opaco e quase preto no escuro, cortando a névoa ao
  meio da tela a partir de 768 px (09-C).
- **Botão primário no escuro** continua `bg-primary` (azul-claro com texto escuro), não
  `--primary-fill` (09-B).
- **`Card` no claro** está sem borda de luz, então o cartão translúcido se separa da névoa só
  pela sombra (09-B).
- **Texto direto sobre a névoa aberta** (revisão final da 09-A). Fora do vidro, o texto vê a
  mancha composta sobre a base (`compor(fog-k, fog-base)`). Contraste medido com a fórmula de
  `contraste.ts`:

  | Claro | muted-foreground | muted-on-fog | foreground | primary | destructive | success-ink | warning-ink | info-ink |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | fog-1 | 3,81 | 5,27 | 10,73 | 3,41 | 3,51 | 4,55 | 3,58 | 3,41 |
  | fog-2 | 4,15 | 5,75 | 11,70 | 3,72 | 3,83 | 4,97 | 3,91 | 3,72 |
  | fog-3 | 4,76 | 6,59 | 13,41 | 4,27 | 4,39 | 5,69 | 4,48 | 4,27 |

  | Escuro | muted-foreground | muted-on-fog | foreground | primary | destructive | success-ink | warning-ink | info-ink |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | fog-1 | 5,02 | 5,02 | 10,89 | 4,80 | 4,15 | 5,96 | 6,54 | 4,80 |
  | fog-2 | 5,41 | 5,41 | 11,74 | 5,17 | 4,48 | 6,43 | 7,05 | 5,17 |
  | fog-3 | 4,95 | 4,95 | 10,73 | 4,73 | 4,09 | 5,88 | 6,44 | 4,73 |

  O secundário do `PageHeader` e o texto secundário do login (sobre a coluna do formulário, sem
  Card) passaram de `text-muted-foreground` para `text-muted-on-fog`, que passa nas seis
  combinações. `primary`, `destructive` e os `-ink` direto na névoa reprovam em 15 combinações
  (claro: destructive, info-ink, primary e warning-ink nas três manchas; escuro: destructive nas
  três) e ficam como **dívida declarada da 09-C**: o login/cadastro passa a pôr o formulário sobre
  vidro e os links coloridos saem da névoa. O teste `contraste-dos-tokens.test.ts` fixa essa lista
  (`DIVIDA_NA_NEVOA`) e fica vermelho se ela crescer ou encolher. O alfa da névoa **não foi
  baixado**: para o `primary` claro passar seria preciso fog-1 <= 0,08 e fog-2 <= 0,15, o que
  apaga a névoa aprovada.

## Raio de 1rem — onde ficou exagerado (T6, anotado sem corrigir)

Percorrido a 390 e a 1440 px: `/dashboard`, `/financeiro/lancamentos` (com o diálogo "Novo
lançamento" aberto), `/todo`, `/treinos` e `/configuracoes`, nos dois temas.

| Onde | O que se vê | Quem corrige |
| --- | --- | --- |
| `Input`, `SelectTrigger` (altura ~32 px, `rounded-lg` = 1rem) | quase pílula; nos formulários densos (diálogo de lançamento, Configurações) os campos parecem botões | 09-B: campos são ladrilho de 14–16 px (desenho §6.5), não pílula |
| `Textarea` ("Observações" do lançamento) | cantos de 1rem numa caixa baixa; a borda superior quase some nos cantos | 09-B |
| Bloco "Classificação" dentro do diálogo (`rounded-xl` = 1,4rem) | raio maior que o do campo de dentro e sem relação com o do diálogo: não é concêntrico | 09-F (módulo financeiro) |
| Fichas de contagem do TO-DO (Pendentes, Para hoje…) | raio de cartão em peças de ~40 px de altura, ficam ovais | 09-F (TO-DO) ou 09-B se forem `Card` |
| Botões pequenos (`size="sm"`) e chips de filtro | já quase pílula; está na direção do desenho (botão em pílula) | — |
| Caixas de seleção | continuam quadradas arredondadas; aceitável | — |

## REDESIGN-09-B — primitivas em vidro (2026-11-08)

Servidor de produção local, Chrome do dono pela extensão, harness de iframes em 390, 768, 1280 e
1440 px, claro e escuro. `/login` em Chrome headless, sem sessão.

### Testes e orçamento

| | Antes (5a753fb) | Depois |
| --- | --- | --- |
| Testes | 8.347 em 371 arquivos | 8.470 em 373 arquivos |
| Mediana de JS por rota | 203,0 KB | 203,6 KB |
| Rotas acima de +1 KB gz | | 0 de 71 |
| Maior aumento | | `/(app)/nutricao/receitas`, +1,0 KB (203,2 → 204,2) |
| `/_global-error` | 3,9 KB | 4,0 KB |

### Amostrador (mesmo método da 09-A, iframe de 1280×800)

| Tela | Tema | fps médio | p95 (ms) | maior quadro (ms), 3 rodadas |
| --- | --- | --- | --- | --- |
| `/dashboard` | claro | 61,3 | 20,1 | 20,2 · 20,1 · 20,1 |
| `/dashboard` | escuro | 61,0–61,3 | 20,1 | 20,2 · 20,4 · 20,1 |
| `/dashboard/financeiro` | claro | 61,2 | 20,1 | 20,1 · 20,2 · 20,2 |
| `/dashboard/financeiro` | escuro | 60,6–61,2 | 20,1 | **100,0** · 20,1 · 20,2 |

Lido por repetição, como na 09-A: o quadro de 100 ms é isolado e não se repete nas outras duas
rodadas. Medido antes do último ajuste (brilho do botão e 1 px do indicador). Sem desaceleração de
CPU: só pega engasgos grandes.

### O que a conferência mostrou

- Sem rolagem horizontal em nenhuma combinação de tela, largura e tema.
- Diálogo, gaveta, `Select` e menu abertos: `backdrop-filter` real. Rodapé da gaveta opaco.
- O CSS do build traz `-webkit-backdrop-filter` e `backdrop-filter` em todas as regras de vidro.
- Reduzir transparência e reduzir movimento: conferidos aplicando as regras de `@media` do próprio
  CSS no iframe, sem emulação do navegador. Sem desfoque, superfícies sólidas, transição `none`.
- Aviso do `sonner`: conferido por um elemento com os atributos do componente, sem disparar uma
  ação real. O vidro e a sombra da regra sem camada foram aplicados.
- A borda de 1 px do `Card` tirava 2 px da largura interna e quebrava o valor do indicador em
  1280 px. Corrigido em `--card-spacing` e no `indicador.tsx`.

### Dívida para as próximas fases

- 09-D: `StatCard` e outros `CardContent` com `p-N` não recebem o desconto de 1 px.
- 09-F: anéis `ring-primary` somados à borda do cartão; `relatorios-client` com `sm:h-8` na lista
  de abas.
- Borda de campo: era 1,01:1 no diálogo claro; o dono delegou e ela passou a `--field-border` (foreground a 52%, escuro 42%), acima de 3:1.

## REDESIGN-09-C — casca em vidro (2026-11-08)

Servidor de produção local, Chrome do dono pela extensão, harness de iframes em 390, 768, 1280 e
1440 px, claro e escuro. `/login` e `/cadastro` em Chrome headless sem sessão, por CDP, em 390 e
1440 px.

### Testes e orçamento

| | Antes (7e6e61d) | Depois (78fa477) |
| --- | --- | --- |
| Testes | 8.470 em 373 arquivos | 8.525 em 374 arquivos |
| Mediana de JS por rota | 203,6 KB | 203,9 KB |
| Rotas acima de +1 KB gz | | 0 de 71 |
| Maior aumento | | +0,259 KB (`/(app)/todo`, `/(app)/rotinas`, `/(app)/treinos/calendario`) |
| `/(auth)/login` e `/(auth)/cadastro` | | -0,004 KB |

Largura útil do conteúdo a 1280 px: não mudou, a coluna da sidebar continua com 256 px.

### Amostrador (mesmo método da 09-A, iframe de 1280×800, janela em primeiro plano)

| Tela | Tema | fps médio (3 rodadas) | p95 (ms) | maior quadro (ms), 3 rodadas |
| --- | --- | --- | --- | --- |
| `/dashboard` | claro | 75,8 · 61,1 · 61,3 | 20,0–20,1 | 30,0 · 20,2 · 20,1 |
| `/dashboard` | escuro | 69,9 · 61,3 · 61,3 | 20,1 | 35,1 · 20,2 · 20,2 |
| `/dashboard/financeiro` | claro | 117,3 · 61,3 · 61,2 | 20,0–20,1 | 35,1 · 35,0 · 35,1 |
| `/dashboard/financeiro` | escuro | 61,0 · 61,1 · 61,2 | 20,1 | 35,0 · 35,1 · 34,9 |

Nenhum quadro acima de 50 ms. Sem desaceleração de CPU. ⚠️ Com a janela fora do primeiro plano, o
`requestAnimationFrame` cai para 1 fps e o número não vale: confira antes de ler.

### iPhone

Safari do iPhone do dono, servidor de produção na mesma Wi-Fi, `/dashboard` e
`/dashboard/financeiro`, dois temas: "Testes no iphone passou" (resposta do dono, 2026-11-08).

### O que a conferência mostrou

- Sem rolagem horizontal em nenhuma combinação de tela, largura e tema. Header com 64 px exatos.
- Sidebar normal, recolhida e oculta (largura 256, 76 e 0, sem filete). A 640 e 720 px de altura a
  lista rola dentro do painel e "Recolher" continua visível.
- Menu do celular, painel do assistente, diálogo "Novo lançamento" e gaveta do TO-DO abertos.
  Com diálogo aberto a sidebar perde o desfoque e o header mantém.
- Borda nova dos campos (`--field-border`) visível no diálogo nos dois temas. `Select` Radix
  conferido no seletor de período do `/dashboard`.
- O CSS do build traz `-webkit-backdrop-filter` antes de `backdrop-filter` na regra nova e na casca.
- Reduzir transparência e movimento: **simulados**, aplicando as regras de `@media` do próprio CSS
  no iframe. Header e sidebar ficam sólidos, sem desfoque, sem transição. Na mesma simulação o
  `Select` aberto continuou com desfoque; a regra existe no CSS do build, e esse ponto não foi
  esclarecido (o `Select` é da 09-B).

### Decisões do dono e achados

- **Header sobre foto clara no tema escuro:** com um bloco branco atrás do header, o texto da busca
  cai para perto de 1,6:1 pela conta sem desfoque; ícones e botões continuam visíveis. O dono
  **aceitou** (opção A): é passageiro e só acontece com foto grande rolando sob o header. O vidro do
  header não ficou mais opaco.
- **Assistente no canto esquerdo a partir de `lg`** cobre o botão "Recolher". Já acontecia antes da
  09-C; não foi alterado.
- **Fora do escopo, não corrigido:** com `yuri:sidebar-collapsed=true`, a página recarregada veio
  com a sidebar expandida. `layout.tsx` e `app-shell.tsx` não mudaram nesta fase. Precisa de
  investigação própria.
- **`DIVIDA_NA_NEVOA`:** as 15 combinações continuam reprovando, porque os tokens não mudaram. Saiu o
  uso real em login e cadastro, e um teste impede a volta. Os usos que restarem em páginas são da 09-F.

## REDESIGN-09-D — peças do painel em vidro (2026-11-08)

Servidor de produção local, Chrome do dono pela extensão, harness de iframes em 390, 768, 1280 e
1440 px, claro e escuro.

### Testes e orçamento

| | Antes (4e60329) | Depois |
| --- | --- | --- |
| Testes | 374 arquivos | 8.552 em 374 arquivos |
| Mediana de JS por rota | 203,9 KB | 203,9 KB |
| Rotas acima de +1 KB gz | | 0 de 71 |
| Maior aumento | | +0,351 KB (`/(app)/dashboard/financeiro`, os ícones dos blocos) |

### Amostrador (mesmo método da 09-A, iframe de 1280×800, `document.hasFocus()` verdadeiro)

| Tela | Tema | fps médio (3 rodadas) | p95 (ms) | maior quadro (ms), 3 rodadas |
| --- | --- | --- | --- | --- |
| `/dashboard` | claro | 128,1 · 120,4 · 122,6 | 15,0 | 30,1 · 15,1 · 15,1 |
| `/dashboard` | escuro | 120,3 · 119,1 · 119,8 | 15,0–15,1 | 15,3 · 30,0 · 30,0 |
| `/dashboard/financeiro` | claro | 122,7 · 120,4 · 120,0 | 15,0–15,1 | 15,2 · 15,2 · 30,1 |
| `/dashboard/financeiro` | escuro | 119,0 · 118,9 · 119,5 | 15,0–15,1 | 30,1 · 30,0 · 30,2 |

Nenhum quadro acima de 50 ms. Sem desaceleração de CPU.

### O que a conferência mostrou

- Sem rolagem horizontal e um único `<h1>` em `/dashboard`, `/dashboard/financeiro`,
  `/financeiro/lancamentos`, `/treinos` e `/configuracoes`, nas quatro larguras e nos dois temas.
- Número do `Indicador`: 24 px a 1280 px (conteúdo do cartão com 222 px) e 28 px a 1440 px (263,5 px).
  O degrau planejado de 16,5rem não alcançava 1440 px por 0,5 px e passou a 16rem.
- Olho fechado mantém a máscara no tamanho do número. "Personalizar" mantém o raio de 28 px e o
  cursor de arrasto, com a barra abaixo do título.
- Sidebar recolhida a 1280 px: 76 px, sem rolagem horizontal; os cartões ganham largura e o número vai a 28 px.
- Reduzir transparência e movimento: **simulados**, aplicando as regras de `@media` do próprio CSS no
  iframe. O cartão fica sólido e sem filtro.

### Achado para as próximas fases

- A 1280 px, um `StatCard` de `/dashboard/financeiro` tem o número 7 px mais largo que a coluna de
  texto (137 × 130 px). Ele avança sobre o espaço antes do ícone, sem encostar nem cortar. O valor
  usa espaço inseparável, então `break-words` cortaria o número no meio. Fica para decisão do dono.
- Número do `Indicador` a 28 px: o dado de hoje cabe. Pela conta, sem medição, um valor de sete dígitos fica justo a 1440 px e um de oito não cabe; como o valor usa espaço inseparável, `break-words` o parte no meio dos dígitos. A 1280 px continua em 24 px. Fica para decisão do dono.
- O número do `Indicador` usa peso 600 (`font-semibold`); o desenho (§6.4) citava 650.

## REDESIGN-09-E — gráficos em vidro (2026-11-08)

Servidor de produção local, Chrome do dono pela extensão, harness de iframes em 390, 768, 1280 e
1440 px, claro e escuro.

### Testes e orçamento

| | Antes (c2cd34b) | Depois |
| --- | --- | --- |
| Testes | 8.553 em 374 arquivos | 8.787 em 375 arquivos |
| Mediana de JS por rota | 203,9 KB | 203,9 KB |
| Rotas acima de +1 KB gz | | 0 de 71 |
| Maior aumento | | +0,079 KB (`/(app)/cartoes/relatorios`) |
| Maior queda | | −0,055 KB (`/(app)/dashboard`) |

### Amostrador (mesmo método da 09-A, iframe de 1280×800, `document.hasFocus()` verdadeiro)

| Tela | Tema | fps médio (3 rodadas) | p95 (ms) | maior quadro (ms), 3 rodadas |
| --- | --- | --- | --- | --- |
| `/dashboard` | claro | 126,6 · 120,4 · 122,9 | 15,0 | 30,1 · 15,1 · 15,1 |
| `/dashboard` | escuro | 120,7 · 120,6 · 120,5 | 15,0 | 15,2 · 15,1 · 15,1 |
| `/dashboard/financeiro` | claro | 123,4 · 120,7 · 119,3 | 15,0–15,1 | 20,0 · 15,2 · 30,1 |
| `/dashboard/financeiro` | escuro | 119,3 · 120,2 · 120,7 | 15,0–15,1 | 30,1 · 29,9 · 30,1 |

Nenhum quadro acima de 50 ms. Sem desaceleração de CPU.

### O que a conferência mostrou

- Sem rolagem horizontal em `/dashboard/financeiro`, `/dashboard`, `/relatorios`, `/habitos`,
  `/treinos/evolucao`, `/treinos/relatorios`, `/nutricao/medidas` e `/estudos/[id]`, nas quatro
  larguras e nos dois temas. `/nutricao/medidas` e `/estudos/[id]` não têm dado para desenhar nesta
  conta: viu-se o estado vazio.
- Dica em vidro aberta só no hover (uma por vez, desfoque de 24 px), esmaecimento dos outros grupos
  a 30%, volta ao normal ao sair, e clique sem prender dica nem esmaecimento.
- Rosca: o centro troca para a fatia e volta ao total. Anel de água: um arco só.
- Olho fechado: dica, centro, legenda e eixo de valor mascarados; meses e nomes de categoria continuam.
- Toque: **simulado** com eventos sintéticos. A dica abre, tocar fora ou rolar fecha, e reabre.
- Crescimento das barras: o Chrome do dono informa `prefers-reduced-motion`, então nada anima ali (o
  que prova o desligamento). A animação foi **simulada** forçando o `@keyframes`: roda uma vez e
  marca `data-crescido`.
- Reduzir transparência: **simulado**, aplicando a regra do material no iframe. A dica fica sólida e
  sem filtro.
- Nenhum gráfico vive dentro de diálogo ou gaveta hoje; a regra `body:has` cobre a dica se um dia viver.

### Defeitos que só o navegador mostrou

- Mudar props de `Cell` faz o recharts remontar os `path` (a chave de animação muda). Na rosca isso
  perdia o hover: ela passou a memoizar a árvore e a aplicar a opacidade direto no DOM dos setores.
  Nas barras a dica funciona porque o estado vem da própria recharts, mas o esmaecimento entra sem
  transição.
- Em `/dashboard/financeiro` o `OlhoDosValores` só envolvia os indicadores. Agora vai até o fim dos
  gráficos, e o bloco do caixa passou a obedecer também.

### Para as próximas fases

- Tabelas do painel com dinheiro sem `ValorComOlho` continuam visíveis com o olho fechado.
- As pilhas (faturas, projeção) crescem por segmento, cada um da própria base.
- Teclado não troca o centro da rosca; a legenda traz os mesmos dados.

## REDESIGN-09-F — varredura dos módulos em vidro (2026-11-09)

Base do bundle: início da fase (commit do plano `e773be0`). Servidor de produção, sessão real no Chrome.

### Testes e orçamento

| | Antes | Depois |
| --- | --- | --- |
| Testes | 8.787 (375 arquivos) | 9.003 (376 arquivos) |
| Mediana de JS gz, 71 rotas | 203,860 KB | 203,842 KB |
| Rota mais pesada (`/todo`) | 227,164 KB | 227,456 KB |
| Maior alta | | `/terceiros` +0,645 KB |
| Rotas acima de +1 KB | | 0 |
| Lint, tsc, build, `perf:bundle` | verdes | verdes |

### Amostrador (mesmo método da 09-A, iframe de 1280×800, `document.hasFocus()` verdadeiro em todas as rodadas)

| Tela | Tema | fps médio (3 rodadas) | p95 (ms) | maior quadro (ms), 3 rodadas |
| --- | --- | --- | --- | --- |
| `/dashboard` | claro | 61,0 · 61,0 · 61,1 | 35,0 | 35,2 · 35,1 · 35,2 |
| `/dashboard` | escuro | 74,1 · 61,1 · 61,1 | 35,0 | 35,2 · 35,2 · 35,1 |
| `/dashboard/financeiro` | claro | 61,1 · 61,1 · 60,9 | 35,0–35,1 | 35,2 · 35,2 · 35,1 |
| `/dashboard/financeiro` | escuro | 61,0 · 60,8 · 60,8 | 35,0 | 35,2 · 35,2 · 35,1 |
| `/financeiro/lancamentos` | claro | 61,3 · 61,1 · 61,3 | 35,0–35,1 | 35,1 · 35,2 · 35,1 |
| `/financeiro/lancamentos` | escuro | 76,2 · 61,2 · 61,0 | 35,0 | 35,2 · 35,2 · 35,2 |
| `/todo` | claro e escuro | 200 | 5,1 | 5,2 (ver a ressalva) |

Nenhum quadro acima de 50 ms. Sem desaceleração de CPU.

⚠️ A média caiu de cerca de 120 fps (09-E) para cerca de 61 fps, com o p95 de 15 para 35 ms. A causa não foi isolada: esta medição não separa a fase de carga da máquina. `/todo` não tinha conteúdo que rolasse na janela (rolagem 0), então seu número não mede nada; por isso entrou `/financeiro/lancamentos`, com 18.646 px de rolagem.

### iPhone

Conferência do dono no Safari, servidor de produção na rede local: rolagem nos dois temas, círculo de concluir, toque na dica e na rosca, desfoque da dica, largura de `/rotinas`. Resposta: tudo certo.

### O que a conferência mostrou

- 63 rotas autenticadas varridas no DOM a 1280 px nos dois temas: `h1` único, nenhum salto de título, nenhuma rolagem horizontal.
- Folhas de 62 rotas em 390, 768, 1280 e 1440 px nos dois temas, olhando a primeira dobra de cada uma, com medição de estouro em todas as larguras. Abaixo da dobra, só a medição.
- Círculo de concluir: 44×44 em `/habitos` e `/todo`, a 390 e 1280 px. Grade de 49 pontos por círculo, nenhum em outro controle, sem clicar.
- Hover, foco visível, menu, diálogo e gaveta conferidos. O seletor nativo aberto não aparece em captura.
- Só mostraram vazio: `/financeiro/recorrencias`, `/tarefas`, `/nutricao/metas`, `/nutricao/compras`, `/nutricao/receitas`, `/nutricao/substituicoes`, `/nutricao/planejamento`, `/nutricao/diario`, `/ia/memoria`, `/busca` e a vista Hoje de `/todo`.
- Não abertas: `/treinos/exercicios/[id]` (sem link com identificador na listagem), `/treinos/sessao/preparar`, `/treinos/sessao/revisar`.

### Defeitos que só o navegador mostrou

- `/rotinas` estourava 75 px a 390 px: texto em `truncate` numa grade sem coluna explícita. Corrigido com `grid-cols-1`.
- `--muted-foreground` no claro direto na névoa dá 3,8:1 em `fog-1` e 4,18:1 em `fog-2`, um par que o teste não cobria. Passou a `--muted-on-fog` e entrou em `DIVIDA_NA_NEVOA`.
- Bordas de estado planejadas a 40% e 50% davam 1,85:1. Subiram para `border-primary/75`, 3,08:1 no claro e 4,03:1 no escuro.

### Para as próximas fases

- O número do Indicador parte em duas linhas a 1280 px em `/cartoes/relatorios`, `/faturas` e `/parcelamentos`.
- O calendário de `/treinos/calendario` a 1280 px trunca o nome do treino em uma letra.
- Bordas de estado anteriores à 09-F não foram medidas a 3:1: `border-primary/30` em Dieta, `/60` no histórico e `/50` no dia de hoje do calendário.

## REDESIGN-09-G — barra de ações do celular (2026-11-10)

Base do bundle: `8389279` (main com a 09-A a 09-F). Sem migration.

### Testes e orçamento

| | Antes | Depois |
| --- | --- | --- |
| Testes | 9.502 (416 arquivos) | 9.530 (417 arquivos) |
| Mediana de JS gz, 71 rotas | 203,9 KB | 204,4 KB |
| Rota mais pesada (`/(app)/todo`) | 227,6 KB | 228,1 KB |
| Rotas com teto próprio | 0 | 0 |
| Rotas acima de 250 KB | 0 | 0 |
| `test:run`, lint, tsc, build, `perf:bundle` | | saída 0 |

Custo de casca: **+0,5 KB gz em todas as rotas** (a barra entra em toda a casca autenticada).

### Conferência no navegador

Feita no Chrome em 2026-11-10, com o build de produção local e a sessão do dono, em 390, 768, 1280 e
1440 px, nos temas claro e escuro (harness de iframes).

| Largura | Resultado (claro e escuro) |
| --- | --- |
| 1280 e 1440 | Idêntico ao anterior: pílula de busca e "Lançar" no header; assistente `fixed` de 48 px a 16 px do canto, clicável; Buscar e "+" ocultos; recuo 0. |
| 390 e 768 | Três botões de 52 px a 12 px da base, todos recebendo o toque; header sem os gatilhos duplicados; sem rolagem horizontal. |

- Buscar, "+" e o assistente abrem um diálogo ou painel cada; Ctrl+K e Ctrl+I abrem um só. Diálogo,
  painel e menu do celular cobrem a barra.
- Fim de página longa: 48 px entre o último item e os botões. Em `/ia`, o compositor termina acima da
  barra.
- Com `floating_hidden` ligada: barra só com Buscar e "+", Ctrl+I abre o painel, aviso correto; a
  preferência foi devolvida ao valor original.
- O aviso do canto aparece no formulário e entra no `aria-describedby`; grupo e botão presentes na
  árvore de acessibilidade em `lg`.
- Achado e corrigido nesta rodada: o menu "Mais opções" do painel a 390 px (rótulo quebrava em quatro
  linhas, a nota vazava do menu e o nome acessível saía colado).
- Divergência registrada, fora do escopo: no chat, "Pergunte qualquer coisa…" usa
  `text-muted-foreground` direto na névoa em `/ia`, e "Usa o provedor…" usa `text-muted-on-fog` dentro
  do painel (superfície de sobreposição).

### iPhone

**Conferido pelo dono em 2026-11-10, no iPhone real: "tudo certo".** Safari do iPhone na mesma Wi-Fi,
servidor de produção local (`next start -H 0.0.0.0`) com o código desta subfase. O roteiro entregue a
ele cobria: a barra acima do indicador de início (`viewport-fit=cover` +
`env(safe-area-inset-bottom)`), o header sob a barra de status, o fundo das gavetas, a paisagem (recorte
lateral, inclusive nas barras da sessão de treino), o teclado virtual aberto e a rolagem. Se um dia a
barra de status translúcida cobrir o header no app da tela inicial, o reparo é um `padding-top` no
header, que quebra a premissa `top-16` das barras fixas — por isso não foi feito às cegas.

### Fora do escopo

- `themeColor` (§6.13 da spec) continua inexistente: não foi pedido nesta fase.
- Rodada de correção final (itens 1, 2, 3 e 6):
  - Impressão: o contêiner da barra leva `print:hidden` (a barra repetiria em todas as folhas).
  - Foco e rolagem: `html` ganha `scroll-padding-bottom: var(--recuo-barra-acoes)` (WCAG 2.4.11).
  - Área segura: `SheetContent` com `side="bottom"` ganha `pb-[env(safe-area-inset-bottom)]`, que
    sobrevive ao `p-0` do chamador no `twMerge`.
  - Altura: `--barra-acoes-altura` virou `calc(52px + 1.25rem)`, sem misturar `px` e `rem` com a
    soma das classes da barra.
- Gavetas laterais e diálogos não ganham recuo lateral de área segura; na paisagem podem encostar no
  recorte.
- Sessão de treino: as três barras fixas sobem para cima da barra de ações (cerca de 72 px a menos de
  tela durante o treino no celular).

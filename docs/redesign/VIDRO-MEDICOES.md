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

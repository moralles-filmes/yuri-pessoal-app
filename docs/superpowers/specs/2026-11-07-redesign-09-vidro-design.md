# REDESIGN-09 — Visual em vidro (desenho)

**Data:** 2026-11-07 · **Situação:** rascunho para aprovação do dono
**Prévia aprovada pelo dono em 2026-11-07:** https://claude.ai/artifact/P2AETJuU3rfqT1ho81hbYe
(abrir com a ferramenta `Artifact`, ação `read`).

⛔ **A cópia local da prévia fica FORA do git**, como os prints da D65, porque traz o nome do
dono:
`C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/previa-vidro/`
(`Main.dc.html`, `Celular.dc.html`, `Componentes.dc.html`; os valores são inventados). Uma
worktree não tem essa pasta: leia pelo caminho absoluto e cite-o em cada prompt de subfase.
Os valores de partida dos tokens, que não têm nome nenhum, estão no **Apêndice A** deste
documento, que vai para o git.

---

## 1. Intenção

O dono quer que o sistema tenha a cara do iOS 26 e do site da Apple: **placas de vidro
translúcidas sobre um fundo desfocado, cantos bem arredondados, uma linha fina de luz na
borda, tipografia grande e confiante, muito respiro, botões que afundam e voltam com mola e
gráficos mais limpos**. A referência que ele mandou é a tela inicial do iPhone (pastas e dock
em vidro sobre papel de parede desfocado). Ele disse "quero algo premium, moderno e
minimalista" e, depois de ver a prévia, **"Aprovado!"**.

Ele abre o sistema no computador e **como app no iPhone** (atalho na tela inicial). As duas
experiências importam igualmente.

O redesign anterior (REDESIGN-00 a 08) cuidou de **significado e estrutura**: o que cada número
quer dizer, navegação, dashboards, relatórios, terceiros, cartões. Esta fase cuida de
**material, forma e movimento**. Ela não muda o que nenhuma tela mostra nem o que nenhum número
significa.

## 2. O que a prévia decide

A prévia tem três telas. Ela é a referência de **aparência**: material, cor, raio, tipo,
movimento e densidade. Ela **não** é referência de conteúdo — os blocos, números, rótulos e
regras de cada tela continuam sendo os que o código tem hoje (REDESIGN-04, 05, 06, 07).

| Tela da prévia | O que ela fixa |
| --- | --- |
| Dashboard no computador | fundo de névoa, sidebar em vidro flutuante, busca em pílula, abertura sem caixa (saudação grande), indicadores e blocos em vidro, gráfico de barras com dica em vidro, anel de hábitos, semana de treinos |
| Dashboard no iPhone | a mesma linguagem a 390 px, tema escuro, título grande, barra flutuante inferior |
| Botões, controles e gráficos | as variantes de botão, o seletor segmentado, o interruptor, campos, etiquetas de situação, a rosca com legenda e o aviso (toast), nos dois temas |

Quando a prévia e uma regra do projeto discordarem sobre **significado** (o que um número é, o
que vazio/zero/falha mostram, base visível, cor que segue o significado), **vale a regra**. A
prévia só ganha em aparência.

## 3. Objetivos

1. Linguagem visual única de vidro em **todas** as rotas autenticadas e nas telas de login e
   cadastro, nos dois temas.
2. A maior parte do efeito sai de **tokens e primitivas** (`globals.css`, `src/components/ui/`,
   casca do app, peças do painel e tema dos gráficos), não de reescrever tela por tela.
3. Botões, seletor, interruptor, caixas de seleção e itens de navegação com resposta ao toque
   no estilo Apple (afunda ao pressionar, volta com mola).
4. Gráficos mais limpos e com camada de dica (tooltip) em vidro, sem perder nenhuma das regras
   de leitura do `TOKENS.md` §8.
5. Contraste AA medido e registrado para cada par novo, nos dois temas.
6. Nenhuma regressão de desempenho perceptível no iPhone.

## 4. Não-objetivos

- Mudar navegação, rotas, ordem de menu, blocos de qualquer tela ou o que qualquer número
  significa. A D65 continua valendo, com uma exceção: a barra de **ações** do celular (§10.2),
  que não é navegação.
- Mudar regra de negócio, Server Action, consulta, schema ou migration. **Nenhuma migration.**
- Trocar a biblioteca de gráficos (continua `recharts`) ou adicionar biblioteca de animação.
- Ícones novos de terceiros (continua `lucide-react`).
- Redesenhar cada módulo à mão. Ajuste por módulo só onde a tela tem estilo próprio que não
  herda das primitivas (ver §7, 09-F).

## 5. Antiobjetivos (o que tornaria a entrega reprovada mesmo "funcionando")

- **Texto ilegível sobre o vidro** em qualquer ponto do fundo, em qualquer tema.
- **Rolagem travando no iPhone** porque tudo virou `backdrop-filter`.
- **Vidro sobre vidro desfocado** (um painel com desfoque dentro de outro): fica turvo e caro.
- Néon, brilho colorido, sombras pesadas, gradiente chamativo em botão ou cartão.
- Copiar a Apple: logotipo, ícones SF Symbols, fonte SF embarcada, anéis de atividade
  triplos, telas idênticas a apps deles. É *inspirado em*, não cópia.
- Um gráfico mais bonito com significado errado (regra 1 do `docs/redesign/README.md`).

## 6. O desenho

### 6.1 O fundo (névoa)

O vidro só existe se houver algo atrás para desfocar. O app ganha um **fundo de névoa**: uma
cor base e três ou quatro manchas grandes e suaves de cor, desenhadas com
`radial-gradient(closest-side, cor, transparent)` — **sem `filter: blur`, sem imagem, sem
arquivo**.

- Fica numa camada fixa atrás de tudo (ex.: `body::before` com `position: fixed; inset: 0;
  z-index: -1`). **Nunca `background-attachment: fixed`**, que o Safari do iPhone ignora ou
  repinta a cada quadro.
- Tokens novos por tema: `--fog-base`, `--fog-1`, `--fog-2`, `--fog-3`. Valores de partida
  (os da prévia):

| Token | Claro | Escuro |
| --- | --- | --- |
| `--fog-base` (= `--background`) | `#e8ecf3` | `#0a0c11` |
| `--fog-1` (azul) | `rgba(120,160,235,.85)` | `rgba(34,78,170,.75)` |
| `--fog-2` (lavanda) | `rgba(196,186,240,.80)` | `rgba(88,56,150,.60)` |
| `--fog-3` (areia / verde-água) | `rgba(244,214,178,.75)` | `rgba(16,96,92,.55)` |

- As manchas ficam no **topo** da página e nos cantos. O fundo é o mesmo em todas as rotas.
- ⚠️ **Exceção declarada à regra 7 do `TOKENS.md` §8** ("sem gradiente forte"): a névoa é um
  fundo, não decoração de componente. A regra continua valendo para botão, cartão e gráfico,
  e é reescrita nesse sentido (§6.14).

### 6.2 Os três materiais

O ponto central do desenho, e também da conta de desempenho: **o desfoque de verdade
(`backdrop-filter`) só aparece onde há conteúdo passando por trás**. Como a névoa é lisa, um
cartão translúcido parado sobre ela fica visualmente igual a um cartão desfocado, e não custa
nada.

| Material | Onde | Receita |
| --- | --- | --- |
| **Vidro de casca** | sidebar, header, barras `sticky`, botão flutuante do assistente, barra inferior do celular, menu do celular | translúcido + `backdrop-filter: blur(30px) saturate(175%)` + borda de luz + brilho superior |
| **Vidro de cartão** | `Card`, `StatCard`, `Bloco`, `Indicador`, painéis de página | translúcido + borda de luz + brilho superior + sombra suave. **Sem `backdrop-filter`** (a decisão pode ser revista na 09-A se a medição mostrar custo desprezível no iPhone; ver §6.11) |
| **Vidro de sobreposição** | `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, conteúdo do `Select`, `Tooltip`, aviso (sonner), dica dos gráficos | mais opaco (alfa 0,85–0,94) + `backdrop-filter` — o que está por trás é conteúdo, não névoa, e precisa ser apagado para a leitura |
| **Ladrilho interno** | quadradinhos de contagem dentro de um bloco, itens de agenda, campos | preenchimento translúcido plano + borda fina. **Nunca** desfoque |

Receita do vidro (prévia, `Main.dc.html`, classe `.glass`):

```css
background: linear-gradient(180deg, var(--glass-sheen), transparent 42%), var(--glass);
border: 1px solid var(--glass-border);
box-shadow: inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo), var(--glass-shadow);
```

Tokens novos: `--glass`, `--glass-strong` (sobreposição), `--glass-solid` (a cor efetiva
medida, usada como fallback e como superfície de validação), `--glass-border`, `--glass-hi`,
`--glass-lo`, `--glass-sheen`, `--glass-shadow`, `--tile`, `--tile-border`. Valores de partida
nos dois temas: os de `.t-claro` e `.t-escuro` na prévia.

`--card` passa a valer `--glass`. `--popover` passa a valer `--glass-strong`.

### 6.3 Cor

| Papel | Claro | Escuro | Medido |
| --- | --- | --- | --- |
| Superfície efetiva do vidro (`--glass-solid`) | `#f3f5f9` | `#1b1e26` | — |
| Texto (`--foreground`) | `#16181d` | `#f2f4f8` | 16,27 · 15,13 |
| Texto secundário (`--muted-foreground`) | `#596070` | `#a1a8b6` | 5,77 (5,22 sobre a mancha azul) · 6,98 |
| Primário como **preenchimento** com texto branco | `#0062d6` | `#1f6fe5` | 5,65 · 4,70 |
| Primário como **texto/link** | `#0062d6` | `#6aa8ff` | 5,17 · 6,87 |
| Sucesso (texto) | `#0f7a3e` | `#3fcf7f` | 4,97 · 8,29 |
| Perigo (texto) | `#c2262e` | `#ff7b7f` | 5,33 · 6,66 |
| Atenção (texto) | `#8a5a00` | `#f5b83d` | 5,43 · 9,37 |

⛔ **No escuro, o primário não cabe num token só.** Branco sobre azul só passa de 4,5:1 num
azul escuro, e azul como texto sobre grafite só passa num azul claro. Hoje o escuro resolve com
azul claro e texto escuro no botão (`#0d2847` sobre `#6da7ec`). A prévia usa o azul saturado com
texto branco, que é o visual aprovado. Por isso:

- `--primary` continua sendo **a cor de texto** nos dois temas (182 usos de `text-primary` em
  113 arquivos não mudam);
- nasce `--primary-fill` (e `--primary-fill-foreground`, branco nos dois temas), usado pelo
  `Button` padrão e pelos preenchimentos sólidos que levam texto branco;
- no claro, os dois valem `#0062d6`.

O construtor confere `bg-primary` + `text-primary-foreground` (eram 24 pares na 02-B) e decide
par a par qual passa a usar `--primary-fill`.

Cores de entidade (de cartão, conta, categoria, projeto e calendário) **não mudam** (TOKENS §1).

### 6.4 Tipografia

⚠️ **Substitui a exigência "Arial, copiar literalmente"** do `TOKENS.md` §1. O dono aprovou a
prévia, que declarava essa troca por escrito.

```css
--font-sans: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", system-ui, sans-serif;
```

- No iPhone e no Mac sai a fonte do sistema da Apple, **sem baixar nada**.
- No Windows e no Android sai a **Inter**, por `next/font/google` (auto-hospedada, só
  `latin`, `display: swap`, **`preload: false`**). Sem `preload: false`, o aparelho Apple
  baixaria uma fonte que nunca usa. ⚠️ Isso revoga "não há `next/font` e não vai haver".
- Escala (da prévia): abertura 54 px / 700 / −0,04em (38 px no celular); título de bloco
  17 px / 600 / −0,018em; número de indicador 28 px / 650 / −0,028em; corpo 14 px; legenda
  12,5 px. Tracking negativo **só** a partir de ~17 px.
- `tabular-nums` continua obrigatório em coluna de dinheiro (TOKENS §8 regra 6).

### 6.5 Forma

- Raio por hierarquia: blocos de página **28 px**; indicadores **24 px**; ladrilhos, itens de
  lista e campos **14–16 px**; botões, seletores, etiquetas e busca em **pílula**; diálogos
  **28 px**; `Sheet` arredondada só na borda exposta.
- Raios **concêntricos**: um elemento encostado no canto de outro usa `raio externo − espaço`.
- `--radius` sobe (de 0,7rem para algo perto de 1rem). A escala derivada
  (`--radius-sm`…`--radius-4xl`) escala junto. São 679 usos de `rounded-*`: o construtor confere
  os que ficarem exagerados, sem trocar um por um por padrão.
- ⚠️ Substitui "arredondamento excessivo está fora da direção" (TOKENS §1).

### 6.6 Movimento

Só CSS, **nenhuma dependência nova**. `tw-animate-css` já está instalado.

- **Pressão:** `:active { transform: scale(.94–.96) }` com
  `transition: transform .5s cubic-bezier(.22,1.45,.36,1)` (afunda rápido e volta com uma mola
  leve). Substitui o `active:translate-y-px` do `Button`.
- **Caixa de seleção redonda** (TO-DO, hábitos): o visto "estala" ao marcar.
- **Interruptor:** o botão estica ao ser pressionado, como no iOS.
- **Seletor segmentado:** o item ativo é uma pílula branca elevada.
- **Gráficos:** as barras crescem da base **uma vez**, ao montar. É o único movimento que não
  responde a uma ação do dono.
- **Tema:** a troca claro/escuro faz transição de cor de 0,3–0,5 s.
- Nada de entrada com "fade + slide" em cada seção nem de cartão que levanta no hover.
- `prefers-reduced-motion: reduce` desliga transição e animação.

### 6.7 Primitivas (`src/components/ui/`)

| Primitiva | O que muda |
| --- | --- |
| `button` | pílula; `default` → primário com brilho superior e sombra azul; `outline` e `secondary` → vidro; `ghost` → discreto (só texto, fundo tingido no hover); `destructive` → fundo vermelho translúcido; `link` igual. **Alturas não mudam nesta fase** (decisão minha: 222 arquivos usam `Button`, e mudar a altura padrão mexe em layout de tabela e de formulário). Pressão com mola |
| `card` | vidro de cartão, raio 24–28 |
| `input`, `textarea`, `select` (gatilho) | ladrilho; foco com anel de 2 px + halo suave de 4 px |
| `switch` | trilho 52×32, botão que estica |
| `tabs` | aparência de seletor segmentado |
| `checkbox` | continua quadrada arredondada (formulários). A redonda é peça de módulo (§6.10) |
| `badge` | pílula; toda situação com ícone **e** palavra |
| `dialog`, `sheet`, `popover`, `dropdown-menu`, `tooltip`, `sonner` | vidro de sobreposição |
| `skeleton` | tom do ladrilho; o brilho que passa é sutil |
| `separator` | cor da grade (`--grid`) |

⛔ As regras do `CLAUDE.md` sobre `cn()` = `twMerge` continuam: classe de fora **remove** a da
primitiva. Se a primitiva puser `rounded-3xl` e um chamador tiver `rounded-lg`, o chamador
vence. O construtor varre os chamadores que sobrescrevem raio, fundo ou sombra das primitivas
alteradas.

### 6.8 Casca do app

- **Sidebar:** painel de vidro de casca **flutuante**, afastado 12–16 px das bordas, raio 28,
  com os grupos que o `nav.ts` já tem. O item ativo vira pílula clara elevada, com ícone e
  texto no azul. O modo recolhido e o modo oculto continuam funcionando.
- **Header:** continua `sticky top-0` com **64 px** (`h-16`). A regra 5 de layout depende disso
  (`top-16`). Vira vidro de casca. A busca global (`SearchCommand`) aparece como pílula de
  vidro.
- **Menu do celular:** o hambúrguer continua (D65). A gaveta é vidro de sobreposição.
- **Assistente flutuante:** botão redondo de vidro. ⛔ As restrições de import e o orçamento
  da invariante 91 continuam valendo.
- **Login e cadastro:** névoa + um cartão de vidro. O `text-gradient-brand` (único
  consumidor) pode sair.

### 6.9 Peças do painel (`src/components/shared/painel/`)

- **`BannerDeBoasVindas` vira abertura sem caixa:** data, saudação grande e a linha que diz do
  que trata a tela, direto sobre a névoa, com os botões de ação à direita (se a tela tiver).
  **Saem** a faixa em degradê, a `montanha.tsx` e a caixa translúcida da frase do dia. Os tokens
  `--banner-from`/`--banner-to` saem junto. Continuam: a saudação pelo horário de Brasília
  calculada no servidor, o primeiro nome e Server Component sem JS. O emoji da saudação sai,
  porque a prévia aprovada não tem. É usado
  em `/dashboard` e `/dashboard/financeiro`.
  - A frase do dia e o teste de vocabulário dela: sai a frase, sai o teste (decisão minha, já
    que a prévia aprovada não tem frase).
  - A linha-resumo "Você tem 3 tarefas para hoje…" da prévia **só entra** se a página já tiver
    o dado. Nenhuma consulta nova nesta fase.
- **`Indicador`:** vidro de cartão, raio 24. Ícone num quadrado de 40 px com raio 12 e fundo
  tingido, número 28 px. A linha de comparação mantém **toda** a semântica da 03-E (até o dia
  D, "sem base", cor segue o significado, seta + palavra).
- **`Bloco`:** vidro de cartão, raio 28, título 17 px com ícone, "Ver tudo ›" no azul.
- **`StatCard`** (31 arquivos): o mesmo material, sem mudar a API.
- **`PageHeader`** (o título de página das outras rotas): título grande no estilo da
  abertura, numa escala menor (≈ 30–32 px / 700 / −0,03em, 26 px no celular), com a descrição em
  texto secundário. A estrutura e as props não mudam. Em `/dashboard` e
  `/dashboard/financeiro`, **a abertura substitui o `PageHeader`** e carrega o único `<h1>` da
  página. Duas faixas de título empilhadas não podem existir. (decisão minha)

### 6.10 Gráficos

Tudo passa por `src/components/dashboard/chart-theme.ts` e pelas 14 fachadas `*-impl.tsx`.

- **Barras:** finas (até ~22 px; ~13 px com mais de 6 grupos), ponta superior com raio 4,
  base reta, **2 px de vão** entre barras vizinhas, sem linha de eixo, grade horizontal leve,
  sem grade vertical.
- **Ao passar o mouse ou tocar**, os outros grupos esmaecem para ~30%, e a dica em vidro de
  sobreposição mostra o mês e cada série com amostra de cor — **só os valores que o gráfico já
  mostra hoje**, nos rótulos de `rotulos-dos-graficos.ts`. ⛔ A linha "Sobrou" da prévia **não
  entra**: seria um número novo, e número novo exige aprovação própria (regra 2 do redesign).
  (decisão minha)
- **Mês em andamento:** contorno tracejado e preenchimento a ~35%, com entrada própria na
  legenda ("ainda em andamento"). Já é a regra 5 do §8; só muda a forma.
- **Linhas:** 2 px, mira com linha vertical no hover.
- **Rosca:** vão de 2–3 px entre fatias, total no centro, legenda com valor e percentual
  (**obrigatória**). Passar o mouse numa fatia destaca a fatia e troca o centro para ela.
- **Anel de progresso** (hábitos): um anel só, nunca três concêntricos.
- **Ainda valem:** `YAxis width="auto"`, fachada + `next/dynamic`, paleta de 8 slots em ordem
  fixa, sem eixo duplo, texto em token de texto, rótulos de `rotulos-dos-graficos.ts`.
- ⛔ **A validação da paleta caduca e tem de ser refeita** sobre as superfícies novas. Refiz
  para os 5 primeiros slots nos dois temas: passam. No claro, sobre `#f3f5f9`, ficam abaixo de
  3:1 **quatro** slots (`#eb6834` 2,93 · `#1baf7a` 2,58 · `#eda100` 1,98 · `#e87ba4` 2,47); sobre
  o branco eram três. O laranja entra na lista dos que exigem rótulo direto. O construtor roda os
  8 slots e grava o laudo no `TOKENS.md` §7. O teste "`--card` continua sendo a superfície em
  que a paleta foi validada" passa a apontar para `--glass-solid`.

### 6.11 Desempenho

- Nenhuma dependência de execução nova. `perf:bundle` não deve se mexer, exceto a Inter.
- `backdrop-filter` só nos materiais de casca e de sobreposição (§6.2). Numa tela, é a
  sidebar, o header, o botão do assistente e o que estiver aberto por cima.
- **Como medir, sem publicar nada (D67).** O app instalado no iPhone aponta para produção, e
  o "depois" só chega lá no fim. Por isso:
  - **O agente mede no desktop:** Performance do Chrome com CPU 4× mais lenta, 5 s de rolagem
    contínua no `/dashboard` e no `/financeiro`, antes e depois. **Aceite:** nenhum quadro
    longo acima de 50 ms causado por pintura ou composição, e a média de quadros não cai mais
    que 10% em relação ao "antes".
  - **O dono confere no iPhone:** o agente sobe o `npm run dev` acessível na rede local
    (`-H 0.0.0.0`, liberando a porta no firewall do Windows) e entrega o endereço. O dono abre
    no **Safari** do iPhone, na mesma Wi-Fi, rola as duas telas nos dois temas e diz se travou.
    É o mesmo motor do app instalado. São dois minutos, uma vez na 09-A (base) e uma vez na
    09-F (final).
  - Os números e a resposta do dono vão para o STATUS.
- O desfoque nos cartões continua **desligado**. Ele só entra se, depois de ver o vidro de
  cartão sem desfoque, o dono pedir, e se a medição do desktop continuar dentro do aceite.
  (decisão minha)

### 6.12 Acessibilidade

- Contraste AA medido para cada par da §6.3, **sobre a superfície efetiva** (o vidro composto
  sobre a névoa), inclusive no ponto mais forte de cada mancha. O texto da abertura é medido
  direto sobre a névoa.
- `@media (prefers-reduced-transparency: reduce)`: todo vidro vira `--glass-solid`, sem
  desfoque.
- `@media (forced-colors: active)`: as bordas continuam visíveis.
- Foco visível: anel de 2 px na cor de texto primária, afastado 2 px.
- Alvos de toque de pelo menos 44 px nas ações principais do celular. ⛔ **Nenhuma linha
  muda de comportamento:** a linha do TO-DO continua com as ações separadas que tem hoje
  (título abre os detalhes, alça de arrastar, seleção em massa, menu). O que cresce é só a
  **área de toque** do círculo de concluir, para 44 px, com espaço invisível em volta. Na
  prévia a linha inteira era o botão; isso não vale para o app, porque um toque acidental
  conclui de verdade (a tarefa recorrente avança e o evento se move no Google Agenda).
  (decisão minha)
- **O círculo de concluir redondo** entra onde já existe a ação de concluir tarefa ou hábito:
  na lista, no quadro e no calendário do TO-DO, nos cartões de hábito e nos blocos do
  dashboard. É troca de aparência do controle que já está lá, não um controle novo.
- Situações nunca só por cor: ícone e palavra (TOKENS §5).

### 6.13 iPhone: barra de status e área segura

- **Nesta fase não há `viewport-fit=cover`** e a névoa **não** passa por trás da barra de
  status. Com isso, a premissa "header de 64 px / `top-16`" das 12 barras fixas continua
  verdadeira. (decisão minha)
- O que entra é barato: um `export const viewport` com `themeColor` por tema
  (`(prefers-color-scheme: light)` → `--fog-base` claro; `dark` → escuro), para a barra do
  Safari ganhar a cor da névoa em vez do branco.
- `env(safe-area-inset-bottom)` aparece só na barra inferior da 09-G (§10.2).

### 6.14 Documentos que mudam

- `docs/redesign/TOKENS.md`: o §1 (tipografia e raio), o §3 e o §4 (valores), o §7 (laudo novo)
  e a regra 7 do §8, que passa a ser: *"Sem néon, sem sombra pesada. Gradiente só na névoa de
  fundo e no brilho do material; nunca em botão, cartão ou gráfico como decoração."*
- `docs/redesign/REFERENCIA-VISUAL.md` §2.1: o banner é substituído pela abertura.
- `docs/redesign/PLANO.md` e `STATUS.md`: a fase nova e as decisões D-nn.
- `CLAUDE.md` do projeto: só se uma regra estrutural mudar (ex.: a de `next/font`).
- Os comentários de `globals.css` que dizem "Arial é exigência" e "não há `next/font`".

## 7. Fatiamento sugerido

Cada subfase é verificável sozinha e deixa o app inteiro funcionando.

| Subfase | Escopo |
| --- | --- |
| **09-A** | tokens de cor, névoa, materiais, raio e fonte em `globals.css` + `layout.tsx` (Inter); testes de token; laudo da paleta; contrastes; medição de desempenho de base no iPhone |
| **09-B** | primitivas de `src/components/ui/` (§6.7) + varredura de chamadores que sobrescrevem raio/fundo/sombra |
| **09-C** | casca: sidebar, header, menu do celular, assistente flutuante, login/cadastro |
| **09-D** | peças do painel: abertura, `Indicador`, `Bloco`, `StatCard`; `/dashboard` e `/dashboard/financeiro` |
| **09-E** | gráficos: `chart-theme.ts`, as 14 fachadas, dica em vidro, rosca, anel |
| **09-F** | varredura dos módulos: 84 arquivos com `<Card`, 63 `bg-card`, 15 `shadow-*`, estilos próprios (círculo de concluir do TO-DO e dos hábitos, calendário de consistência dos treinos, gaveta de registros) + conferência visual de todas as rotas |
| **09-G** | barra de ações inferior do celular (§10.2) |

Depois da 09-G vem a **parte de regressão e entrega da REDESIGN-08** (§10.1).

## 8. Regras do projeto que continuam valendo (não são novas, mas mordem aqui)

- Integridade dos dados vence estética. Vazio, zero medido e falha de leitura continuam
  visualmente distintos (01-C, 03-G).
- Dark e light em tudo; 390/768/1280/1440 px e zoom 200%.
- As 6 regras de layout responsivo do `CLAUDE.md` (em especial `cn()`/`twMerge`, `min-w-0`,
  `top-16`, densidade por `@container`).
- As 4 regras de carregamento sob demanda e o orçamento de 250 KB gz por rota.
- Repositório público: nada de valor real, nome de pessoa, banco ou categoria em doc, teste ou
  print versionado. Os prints de referência continuam fora do git.
- Publicação (D67): sem push, sem PR, sem merge em `main` e sem deploy. Integração local; o PR
  único acontece uma vez só, no fim, a pedido do dono.
- O `Edit` grava CRLF neste repositório: normalizar antes do commit.
- `next dev` reescreve o `AGENTS.md`: reverter antes de commitar.
- Verificação "pronta": `npm run test:run` + `npm run lint` + `npx tsc --noEmit` +
  `npm run build` + `npm run perf:bundle`, mais a conferência visual com o Chrome (harness de
  iframes em 4 larguras e 2 temas).

## 9. Fica com o construtor

- Os valores finais dos tokens, desde que passem nas medições (os da prévia são o ponto de
  partida, não o final).
- Os nomes exatos de token e de classe utilitária (`@utility glass` etc.).
- Ajustes finos de raio, de alfa e de sombra por componente.
- Como dividir cada subfase em tarefas e commits.
- Qual ferramenta de medição usar no iPhone, desde que o número fique registrado.

## 10. Decisões do dono (2026-11-07)

### 10.1 O vidro entra ANTES da entrega

- A **REDESIGN-08** (em andamento em `feat/redesign-08-entrega`) **termina só as correções que
  já está fazendo** (os itens K e C do desenho dela) e é integrada em
  `feat/redesign-00-auditoria` como as outras subfases.
- A **parte de regressão e entrega** da 08 fica para **depois** da 09: a regressão visual e de
  acessibilidade, a tabela de desempenho antes/depois, o `REVERSAO.md` e o texto do PR #65.
  Assim ela confere o visual final uma vez só.
- A 09 nasce de `feat/redesign-00-auditoria` **depois** dessa integração. Portão:
  `git merge-base --is-ancestor feat/redesign-08-entrega feat/redesign-00-auditoria`.
- Tudo vai no **PR único #65** (D67), com um merge só, quando o dono pedir.
- ⚠️ A sessão que está rodando a 08 precisa ser avisada de que deve **parar antes da
  regressão**.

### 10.2 A barra inferior do celular ENTRA (09-G)

Ela **revoga em parte a D65** ("a barra de abas inferior do celular: a navegação fica como
está"). Não é uma barra de abas: o menu de três linhas continua sendo a navegação. É uma barra
de **ações** que junta, ao alcance do polegar, três coisas que já existem:

| Botão | O que abre (já existe) |
| --- | --- |
| **Buscar** (pílula larga) | a busca global (`SearchCommand`) |
| **Novo lançamento** | o lançamento rápido do header |
| **Assistente** | o painel do assistente (`FloatingAssistant`) |

- Aparece **só abaixo de `lg`**. No desktop nada muda.
- Vidro de casca, com `padding-bottom: env(safe-area-inset-bottom)`. O conteúdo ganha recuo
  inferior para a barra nunca cobrir o fim da página (nem o último item de lista nem um botão
  de formulário).
- No celular, **o botão flutuante do assistente passa a morar na barra**: não pode haver dois
  botões de assistente na tela. ⛔ A preferência `floating_hidden` continua sendo respeitada
  (invariante 93): com ela ligada, o botão do assistente some da barra e o atalho continua. A
  preferência `floating_corner` não se aplica no celular enquanto a barra existir, e as telas
  de configuração dizem isso.
- Se o header do celular mostrar a busca e o lançamento rápido em duplicidade, o construtor
  pode escondê-los abaixo de `lg`, **desde que cada ação continue alcançável** por um caminho.
- ⛔ As restrições de import e de orçamento da invariante 91 valem para a barra. Ela entra na
  casca e, portanto, nas 67 rotas.
- O `REFERENCIA-VISUAL.md` §1 ganha a nota da revogação parcial.

## Apêndice A — valores de partida dos tokens (da prévia)

Ponto de partida, não valor final (§9). Os contrastes da §6.3 foram medidos sobre
`--glass-solid`.

⚠️ **Medido depois, no plano da 09-A:** com estes alfas, o centro da mancha azul reprova no
claro (link azul a 4,02:1 e cinza a 4,48:1 sobre o vidro; cinza a 2,74:1 direto na névoa) e o
verde reprova no escuro (4,38:1). O plano baixa os alfas da névoa, cria `--muted-on-fog` e
ajusta quatro tons de texto. **Os valores da Task 2 do plano
`docs/superpowers/plans/2026-11-07-09a-vidro-tokens-e-fundo.md` vencem este apêndice e o quadro
da §6.3.**

```css
/* claro */
--fog-base:#e8ecf3; --fog-1:rgba(120,160,235,.85); --fog-2:rgba(196,186,240,.8); --fog-3:rgba(244,214,178,.75);
--glass:rgba(255,255,255,.56); --glass-solid:#f3f5f9; --glass-border:rgba(255,255,255,.78);
--glass-hi:rgba(255,255,255,.95); --glass-lo:rgba(255,255,255,.35); --glass-sheen:rgba(255,255,255,.55);
--glass-strong:rgba(255,255,255,.94);
--glass-shadow:0 1px 2px rgba(16,24,40,.04),0 20px 50px -22px rgba(30,45,90,.28);
--tile:rgba(255,255,255,.55); --tile-border:rgba(255,255,255,.7);
--pill:rgba(255,255,255,.82); --pill-strong:#ffffff;
--foreground:#16181d; --muted-foreground:#596070; --ink3:#8a90a0;
--track:rgba(22,24,29,.07); --grid:rgba(22,24,29,.07);
--primary:#0062d6; --primary-fill:#0062d6; --acc-bg:rgba(0,98,214,.10);
--success-ink:#0f7a3e; --destructive:#c2262e; --warning-ink:#8a5a00;
--bar-out:#b4bccb; /* série neutra (Saídas) */

/* escuro */
--fog-base:#0a0c11; --fog-1:rgba(34,78,170,.75); --fog-2:rgba(88,56,150,.6); --fog-3:rgba(16,96,92,.55);
--glass:rgba(28,31,40,.58); --glass-solid:#1b1e26; --glass-border:rgba(255,255,255,.10);
--glass-hi:rgba(255,255,255,.14); --glass-lo:rgba(255,255,255,.04); --glass-sheen:rgba(255,255,255,.07);
--glass-strong:rgba(38,42,52,.95);
--glass-shadow:0 1px 2px rgba(0,0,0,.3),0 26px 60px -24px rgba(0,0,0,.7);
--tile:rgba(255,255,255,.05); --tile-border:rgba(255,255,255,.07);
--pill:rgba(255,255,255,.10); --pill-strong:rgba(255,255,255,.16);
--foreground:#f2f4f8; --muted-foreground:#a1a8b6; --ink3:#6b7282;
--track:rgba(255,255,255,.09); --grid:rgba(255,255,255,.07);
--primary:#6aa8ff; --primary-fill:#1f6fe5; --acc-bg:rgba(80,150,255,.14);
--success-ink:#3fcf7f; --destructive:#ff7b7f; --warning-ink:#f5b83d;
--bar-out:#4a5060;
```

Manchas da névoa no computador (prévia): `--fog-1` em cima à esquerda (≈ 980×760, começando
−260 px acima do topo), `--fog-2` à direita (≈ 900×820, a ~120 px do topo), `--fog-3` no meio
(≈ 1000×760, a ~880 px) e `--fog-1` de novo embaixo à esquerda. No celular são três, menores.
Todas como `radial-gradient(closest-side, cor, transparent)`.

Movimento: `transition: transform .5s cubic-bezier(.22,1.45,.36,1)`; `:active` com
`scale(.94)` e `transition-duration: .12s`; o visto do círculo usa
`cubic-bezier(.22,1.6,.36,1)`.

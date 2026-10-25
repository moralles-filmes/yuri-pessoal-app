# Referência visual — Financeiro e Dashboard geral

**Decidido em 2026-10-25 (D65).** Você mandou dois prints como referência visual e disse:
*"Vamos seguir o plano que já tem, mas adaptar para a referência visual. Esquece a sidebar. Um
redesign igual ao print para a parte FINANCEIRO e outro para o DASHBOARD GERAL."*

| Print | Tela | Fase |
| --- | --- | --- |
| **1 — Financeiro** | Painel financeiro, `/dashboard/financeiro` | **REDESIGN-04-A** |
| **2 — Dashboard geral** | Dashboard, `/dashboard` | **REDESIGN-06** |

⛔ **Os prints NÃO entram no repositório.** Ele é público, e o print 2 tem cara de dado real
(nomes de cartões e de cursos, valores com centavos). Este arquivo os descreve em palavras,
sem valor em R$, sem nome de pessoa, de banco, de categoria ou de curso (regra 6 do `README.md`).
Quem for executar a fase pede os prints ao dono na conversa.

**Precedência.** O print decide layout, hierarquia, densidade e forma dos componentes. Ele
**não** decide o que um número significa. Quando o print contradiz uma regra do projeto, vale a
regra (*integridade dos dados vence estética*, regra 1 do `README.md`), e o desvio fica escrito
no §6. Tokens, paleta e regras de uso continuam sendo os do `TOKENS.md`.

---

## 1. O que vale e o que não vale do print

**Vale:**
- o banner de boas-vindas no topo;
- a fileira de quatro indicadores logo abaixo dele;
- a grade de blocos em cartões brancos, de raio grande, borda sutil e sombra leve;
- o ícone em quadrado colorido;
- o número grande com a linha de comparação embaixo;
- o "Ver todas ›" no canto de cada bloco;
- o estado vazio com ícone, frase e botão.

**Não vale:**
- a **sidebar** e a **barra de abas inferior do celular**: a navegação fica como está, por decisão
  sua;
- os valores mostrados;
- tudo o que o sistema não tem (§6).

---

## 2. A linguagem comum — as duas telas usam as MESMAS peças

⛔ **Quem chegar primeiro (04-A ou 06) cria as peças; a outra reusa.** Duas cópias do banner
ou do indicador divergem na primeira edição, como já aconteceu com os seletores de visão (F3).

### 2.1 Banner de boas-vindas

- Largura total do conteúdo, faixa azul em degradê **suave**, feito com tons de `--primary`
  (mais claro à esquerda, mais profundo à direita). Ilustração de montanhas no canto
  inferior direito, **desenhada em SVG inline por nós**. Sem foto, sem banco de imagens, sem
  arquivo de terceiros.
- **Esquerda:**
  - saudação pelo horário de **Brasília** ("Bom dia", "Boa tarde" ou "Boa noite"), calculado no
    servidor com `timeInSaoPaulo`, nunca com a hora do processo;
  - o primeiro nome, da mesma fonte que o menu do usuário já usa;
  - uma linha que diz do que trata a tela.
- **Direita (`lg` para cima):** uma frase curta numa caixa translúcida.
  - A frase sai de uma **lista fixa** e é escolhida pelo dia (`hojeISO()`), então fica a mesma o
    dia inteiro e não troca a cada recarregar.
  - A lista passa pelo vocabulário de `src/lib/tone/`, com teste.
- **Celular:** banner mais baixo, sem a frase, com a ilustração reduzida ou ausente.
- **Escuro:** degradê mais profundo. O texto branco precisa medir **≥ 4,5:1 sobre o ponto mais
  claro** do degradê, nos dois temas, e a medição fica registrada.
- **Server Component, zero JS no cliente.** O emoji da saudação vai com `aria-hidden`.
- ⚠️ **Exceção declarada à regra 7 do `TOKENS.md` §8** ("sem gradiente forte"): o banner é a
  **única** superfície com degradê do sistema. Ele não abre precedente para card, botão ou
  gráfico.

### 2.2 Indicador (os quatro números do topo)

- Cartão branco, quadrado de ícone com fundo tingido à esquerda (azul para saldo, verde para
  entrada, vermelho para saída, azul-claro para cartão e terceiros), com os tokens
  semânticos do `TOKENS.md` §5. O texto usa sempre a variante `-ink`.
- O rótulo vem com um ícone (i) que abre a explicação da regra do número.
  - ⛔ **A base e a data continuam VISÍVEIS como texto**, não escondidas na dica: "toda tela diz
    a base" é entrega da 03-E.
  - A dica complementa, nunca substitui.
- O número fica grande, e a linha de comparação vem embaixo, com seta, percentual e "em
  relação ao mês anterior":
  - mês em andamento compara **até o dia D** (regra da 03-E);
  - sem base anterior aparece "sem base", **nunca** `+∞%` nem `NaN`;
  - a cor segue o **significado**: gasto que sobe **não** é verde;
  - seta e palavra sempre acompanham a cor ("cor nunca sozinha").
- ⚠️ **É uma variante nova, não uma mudança no `StatCard` padrão**, que todos os módulos usam.
  Mudar o padrão redesenharia, em silêncio, os lotes já entregues na REDESIGN-07.
- Densidade pela largura do cartão (`@container`, regra 4 de layout do `CLAUDE.md`), e
  `min-w-0`/`truncate` no lado do texto (regras 2 e 3).

### 2.3 Bloco

- Título à esquerda e **"Ver todas ›"** à direita. O link aponta para uma rota que existe, e o
  teste de `href` no disco da 02-D cobre isso.
- Quando o bloco tem janela própria, um seletor compacto fica no canto (ex.: "Últimos 9 meses").
- Estado vazio: ícone em traço fino, uma frase e um botão de ação, se houver ação.
  ⛔ **Vazio, zero medido e falha de leitura continuam sendo três coisas diferentes na tela**
  (01-C e 03-G). O vazio do print não pode virar o desenho da falha.

### 2.4 Gráficos

- **Entradas × Saídas:** barras agrupadas, de topo arredondado, com Entradas em azul (slot 1 da
  paleta) e Saídas em cinza neutro. Grade horizontal leve e legenda com pontos no alto, à
  direita.
- **Rosca:** total no centro, legenda à direita com percentual. ⛔ **Cores da paleta validada de
  8 slots** (`TOKENS.md` §7), não tons de azul como no print, porque sete azuis parecidos não se
  distinguem na legenda. Sem negativo. Quando dobrar fatias em "Outros" é decisão da REDESIGN-06
  (D15).
- Tudo como fachada + `*-impl.tsx` com `next/dynamic`, `YAxis width="auto"`, e mês em andamento
  ou projeção visualmente distintos do realizado.

### 2.5 Listas e tabela

- **Fatura:** marcador na **cor do cartão** (`credit_cards.cor`, que já existe) + nome + valor +
  data + selo de estado com palavra (Prevista · Aberta · Fechada · Paga), os estados da 05.
- **Transações:** Data · Descrição · Categoria (ícone + nome) · Valor (sinal e cor `-ink`) ·
  **Tipo**, um selo que sai de `transactions.classificacao` (Meu · Terceiro · Dividido), lido e
  nunca deduzido. No celular a tabela vira lista em cartões.

### 2.6 Ocultar valores (o "olho")

- Fica no primeiro indicador, como no print 2. Ele esconde os valores em R$ **dos quatro
  indicadores** da tela ("R$ ••••").
- A preferência fica no **cookie** deste aparelho, e o servidor a lê (`await cookies()`) para a
  página já chegar escondida. Com `localStorage` o valor apareceria por um instante antes de
  sumir.
- A dica do botão diz que é **discrição na tela, não sigilo**.
- Sem migration e sem preferência no banco.

---

## 3. Financeiro — print 1 → REDESIGN-04-A (`/dashboard/financeiro`)

De cima para baixo, em 1280 px ou mais:

1. **Banner**, com a linha "Aqui está um resumo da sua vida financeira".
2. **Período e base** (Caixa realizado × Competência, da 03-E), visíveis.
3. **Alertas**, que já existem: faixa compacta, só quando há algum.
4. **Quatro indicadores:**
   - **Saldo das contas** com a data no rótulo (RR-E-6);
   - **Minhas entradas**, com a renda pessoal como número principal (RR4);
   - **Minhas saídas**;
   - **De terceiros**, o gasto atribuído a terceiros no período.
5. **Minhas entradas × saídas** (barras, ~⅔ da largura) e **Distribuição dos meus gastos**
   (rosca, ~⅓).
6. **Cartões de crédito** (~⅗) e **Próximas faturas** (~⅖):
   - cada cartão é um bloco na sua cor, com nome, fatura atual e "fecha em DD/MM";
   - o último bloco é "Adicionar cartão", que leva a `/cartoes`;
   - clicar no cartão **não** dispara ação financeira (aceite da 05).
7. **Últimas transações** (~5 linhas, "Ver todas" → `/financeiro/lancamentos`) e **A receber de
   terceiros** no lugar de "Metas do mês":
   - em aberto por pessoa, com os **rótulos da 03-D**;
   - nenhum quarto número inventado.
8. **Abaixo, tudo o que existe hoje e o print não mostra.** ⛔ **Nada é removido**:
   - bloco do caixa;
   - meu × bruto × terceiros;
   - gasto no cartão e à vista;
   - contas a pagar;
   - forma de pagamento;
   - projeção;
   - faturas dos próximos meses.

**Celular (390 px):**
- banner compacto;
- Saldo das contas grande;
- os outros três indicadores menores em linha, com `min-w-0` e `truncate`;
- o gráfico;
- o resto empilhado;
- sem barra de abas inferior.

## 4. Relatório — REDESIGN-04-A2 (`/relatorios`, aba Financeiro)

- Mesmas peças do §2, **sem banner**, porque é tela de análise.
- Leva a barra de filtros completa que a 04-A previa: período, base, responsabilidade, conta,
  cartão, pessoa e categoria.
- Mantém a sequência Resumo → Evolução → Composição → Detalhamento → Projeções.
- As outras abas (Cartões, Hábitos, Estudos, Tarefas) ficam como estão.

## 5. Dashboard geral — print 2 → REDESIGN-06 (`/dashboard`)

1. **Barra:** seletor de período do dashboard, **corrigindo o F3** (`aria-pressed`, a quinta
   cópia registrada na 07-A), e o botão **Personalizar**, que já existe.
2. **Banner**, com a linha "Aqui está um resumo da sua vida em um só lugar".
3. **Resumo financeiro:** faixa fixa com quatro indicadores. Ela **não** é um dos 11 cards e não
   entra no "Personalizar".
   - **Saldo das contas**, com o olho;
   - **Entradas do mês**;
   - **Saídas do mês**;
   - **Total em cartões**, com "à vista" embaixo.

   Cada um com a base visível. ⛔ **A faixa e o card Financeiro usam a MESMA leitura**
   (`cache` do React), nunca uma segunda: o pipeline triplicado (P1-9) foi unificado na 03-B.
4. **Grade de cards:**
   - 3 colunas em `xl`, 2 em `md`, 1 no celular, todos do mesmo tamanho;
   - o layout salvo guarda só `order` e `hidden`, e tamanho por card mudaria esse formato, por
     isso a última linha de quatro do print não é copiada;
   - a ordem padrão continua a de `DASH_CARD_IDS`, e a ordem que você salvou é preservada.
5. **Anatomia de cada card**, do print:

| Card | O que mostra |
| --- | --- |
| Financeiro | saldo + barras de 6 meses (entradas × saídas) + seletor |
| TO-DO | quatro quadros: Hoje · Atrasadas · Urgentes (P1) · Concluídas hoje (urgentes em vermelho claro, concluídas em verde claro) + estado vazio |
| Cartões & Faturas | quatro quadros: Abertas · Fechadas · Pagas · Total pendente + próximos vencimentos (§2.5) |
| Agenda | Eventos hoje · No mês + estado vazio com "Adicionar evento" |
| Dieta | o conteúdo de hoje; sem configuração, estado vazio com "Configurar dieta" |
| Tarefas & Rotinas | Hoje · Atrasadas · Em andamento + rotinas de hoje |
| Hábitos | anel de progresso "X/Y concluídos hoje" + sequência + lista de hoje |
| Estudos | Em andamento · Horas no mês · Atrasados + cursos em andamento |
| Treinos | "N de M treinos na semana" + volume + barras de Seg a Dom. ⛔ **Dia sem treino não é vermelho** (invariante 22 de Treinos: o calendário não cobra) |
| Notificações | não lidas + lista + "Ver todas" → `/notificacoes`, o que resolve a divergência do `card-meta.ts` (`NAVEGACAO.md` §5) |
| Insights da IA | fora do print, **fica**: mesma anatomia, só exibe (`boundaries.test.ts`) |

Os números do print que a leitura atual de um card não traz (ex.: "Concluídas hoje",
"Urgentes", "Horas no mês") entram **só se saírem de função que o módulo já tem**. Sem regra
nova e sem migration. Senão ficam fora e o desvio vai para o §6.

## 6. Desvios do print, e por quê

| No print | Aqui | Por quê |
| --- | --- | --- |
| Sidebar e barra de abas do celular | ficam como estão | sua decisão, 2026-10-25 |
| Montanha fotográfica | SVG desenhado por nós | sem asset de terceiros; peso zero de JS; funciona no escuro |
| Rosca em tons de azul | paleta validada de 8 slots | categorias precisam se distinguir (`TOKENS.md` §7) |
| Logos dos bancos | marcador na cor do cartão + nome | sem marca de terceiros; a cor já está cadastrada |
| Últimos 4 dígitos do cartão | nome + bandeira | o sistema não guarda os dígitos; guardá-los exigiria migration |
| "Metas do mês" | A receber de terceiros | meta financeira não existe; criá-la exige tabela nova, fora do plano |
| Boletos/Códigos, CMV, Contas a Receber | fora | estão na sidebar, e não existem no sistema |
| Seta verde em gasto que subiu | cor pelo significado, com seta e palavra | gasto que sobe não é "bom"; cor nunca sozinha |
| Números sem base | base visível em todo número financeiro | entrega da 03-E |
| "Saldo total" | "Saldo das contas · em DD/MM" | RR-E-6 |
| "Entradas (meu)" | renda pessoal como número principal | RR4 (03-C) |
| Grade com 4 cards na última linha | cards do mesmo tamanho | o layout salvo não guarda tamanho |

## 7. Aceite visual (soma-se ao aceite da fase)

- **Primeiro entregável da 04-A e da 06: prévia isolada com dado sintético marcado como tal**,
  como na 01-C, conferida a 390, 768, 1280 e 1440 px e nos dois temas, e **aprovada por você
  antes de qualquer código de produção**. As prévias da 01-C foram aprovadas em 2026-09-20 **sem**
  este visual.
- O contraste do banner é medido e registrado nos dois temas.
- `perf:bundle` verde, e o banner não acrescenta JS de cliente.
- Nenhum valor, nome ou saldo real em documento, teste ou prévia versionada.

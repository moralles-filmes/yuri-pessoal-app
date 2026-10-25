# Plano por fases

Cada fase termina com: o que mudou · arquivos afetados · testes executados com resultado real ·
evidências · limitações · riscos residuais · próxima fase. **E para.**

Regra permanente: nenhuma migration, nenhuma mudança de regra de negócio e nenhum
push/merge/deploy sem autorização explícita e específica.

---

## REDESIGN-00 — Auditoria e baseline ✅ CONCLUÍDA

Baseline dos 5 comandos, inventário, mapeamento de cálculos, contrato financeiro preliminar,
proposta de navegação, riscos, plano. **Zero alteração de código funcional.**

---

## REDESIGN-01 — Contratos e protótipos 🔓 gate liberado

**Gate de entrada:** ✅ decisões D6–D11 tomadas em 2026-09-20
(`METRICAS-FINANCEIRAS.md` §11–§12).

⛔ **A 01 continua sem aplicar migration.** Ela **desenha** as três aprovadas (E1, E6, E7) e as
apresenta; aplicar no Supabase exige uma segunda autorização, específica por migration.

| Subfase | Entrega |
| --- | --- |
| **01-A** | Dicionário de métricas **fechado**: cada indicador com nome, fórmula, fonte, data, status incluídos, exclusões. Decisão sobre E1–E6 |
| **01-B** | Tokens e padrões visuais: paleta azul em claro/escuro, neutros re-matizados, tokens semânticos `success`/`warning`/`info`, escala de espaçamento e raio. **Tipografia preservada** (`Arial, "Helvetica Neue", Helvetica, system-ui, …`, sem `next/font`) |
| **01-C** | Prévias isoladas de Dashboard, Relatório financeiro e Central de cartões, com **dados sintéticos marcados como tais**, validadas em 390/768/1280/1440 px |

**Não entra código de produção na 01.** As prévias vivem em rota isolada ou artefato, e são
descartadas depois.

**Aceite:** você aprova o dicionário e o visual antes de qualquer propagação.

---

## REDESIGN-02 — Base visual e navegação

| Subfase | Entrega |
| --- | --- |
| **02-A** | ⛔ **Desacoplar `gold` de `bg-primary`** em `todo/constants.ts:141,153` — **antes** de tocar qualquer token. Sem isso, todo projeto/etiqueta "Dourado" vira azul em silêncio (risco R1) |
| **02-B** | Tokens em `globals.css`: primário azul, neutros re-matizados, `success`/`warning`/`info`. `--font-sans` intocado |
| **02-C** | Sidebar, header e menu mobile na nova organização. **Item ativo pela rota mais específica**, com teste fixando que `/dashboard/financeiro` acende **um** item |
| **02-D** | Teste novo: todo `href` de `nav.ts` tem `page.tsx` no disco. Alinhar `training-links.test.ts` e `nutrition-links.test.ts` ao padrão de `ai-links.test.ts` |
| **02-E** | `ModuleNav`/`ModuleShell` únicos, consumidos por Nutrição, Treinos, IA e Financeiro |

**Aceite:** `perf:bundle` verde **e** `/(app)/configuracoes` ainda abaixo de 285 KB · suíte
verde · os 212 usos de cor solta ainda funcionando (a migração deles é gradual, não big bang) ·
claro e escuro conferidos · módulos ainda não redesenhados continuam legíveis.

---

## REDESIGN-03 — Contratos financeiros e consultas

O coração. **Testes de caracterização primeiro**: fixar o comportamento atual em teste **antes**
de mexer, para que qualquer mudança de número seja visível e intencional.

| Subfase | Entrega |
| --- | --- |
| **03-A** | Testes de caracterização de `resumoMes`, `gastosPorCategoria`, `proximas6Faturas`, `totalAReceber` — congelando o que eles devolvem hoje |
| **03-B** | **Unificar o pipeline triplicado** (P1-9) num módulo só, com uma janela de leitura declarada. Sem mudar número nenhum |
| **03-B2** | **Fechar os riscos residuais da 03-B** (decidido em 2026-09-27, D40): R1 como erro de tipo, linhas estritas, fronteira robusta, tetos visíveis e `LeituraDoDono` nas leituras que faltam — sem mudar número — e, só com "sim" item a item, fatura vazia fora do sino, régua única do gasto alto e a definição de saldo da IA |
| **03-C** | Separação de **renda pessoal × movimentação de terceiros** (E2/E3): `classificacao` e `valor_pessoal` passam a valer para receita, gravados no lançamento |
| **03-C2** | **Categorias** (E7, decisão D8): marcação de terceiros como **atalho de preenchimento e filtro**, lista agrupada por tipo. ⛔ Teste que prove que **nenhum relatório lê a categoria** para decidir de quem é o dinheiro |
| **03-D** | Reembolsos e recebíveis: os três números distintos do briefing §7 + **recebimento parcial** (E1). Recebível `ignorado` visível como "não será cobrado" |
| **03-E** | Modo **caixa exato × competência** com rótulo (E6). `liquidado_em` nulo cai para `competence_date` **com a aproximação declarada**, nunca em silêncio. Regra de comparação de mês parcial |
| **03-F** | Idempotência do pagamento de fatura (P0-4) e confirmação no desfazer (P1-8) |
| **03-G** | Erro é erro: `error.tsx` por rota e leituras que param de engolir falha (P0-5) |
| **03-G2** | **As escritas e o fechamento** (decidido no desenho da 03-G, §12): atomicidade de `updateTransaction`/`criarTransacao`/`reapplySplit`/`deleteTransaction`, as 29 escritas que ignoram o erro, a confirmação de excluir em Lançamentos (RR-F-6) e a matriz de fechamento da REDESIGN-03 (D32) |

**Aceite:** os 18 casos financeiros mínimos do briefing §13 + o cenário sintético obrigatório,
todos como teste puro · nenhum teste existente alterado para passar · conciliação card × tabela
× gráfico para filtros equivalentes.

---

## REDESIGN-04 — Relatórios e terceiros

🎨 **Referência visual (D65, 2026-10-25): print 1 → Painel financeiro.** Descrita em
[REFERENCIA-VISUAL.md](REFERENCIA-VISUAL.md) §2–§4. O print decide layout e forma, não o que um
número significa. Os desvios dele estão no §6.

| Subfase | Entrega |
| --- | --- |
| **04-A** | **Painel financeiro (`/dashboard/financeiro`) no visual do print 1.** A ordem de cima para baixo é Resumo → Evolução → Composição → Cartões e faturas → Detalhamento → Projeções: banner, os 4 indicadores (saldo com data, minhas entradas, minhas saídas, de terceiros), barras × rosca, cartões na cor de cada um × próximas faturas, últimas transações × a receber de terceiros, e abaixo tudo o que o painel já tem. **Primeiro entregável: prévia com dado sintético, aprovada antes do código.** Cria as peças comuns (banner, indicador, bloco, olho) se a 06 ainda não as tiver criado |
| **04-A2** | **Relatório financeiro (`/relatorios`, aba Financeiro) com as mesmas peças**, sem banner. Barra de filtros com período, base, responsabilidade, conta, cartão, pessoa, categoria. Resumo → Evolução → Composição → Detalhamento → Projeções. As outras abas ficam como estão |
| **04-B** | Detalhamento que abre os registros por trás de cada indicador |
| **04-C** | Área Terceiros e reembolsos: por pessoa, origem do débito, valor atribuído, recebimentos, saldo, histórico |
| **04-D** | Exportação com período, base, filtros e identificação de projeções no arquivo. XLSX oferecido (a lib já existe) |

**Pendências que já estavam endereçadas à 04-A** continuam nela:

| Pendência | Origem | Vai para |
| --- | --- | --- |
| RR4: o número principal de "Entradas" é bruto | 03-C | 04-A (e 06) |
| RR5: o saldo da evolução é bruto − bruto | 03-C | 04-A, no componente do gráfico, o que vale também para a 04-A2 |
| RR-E-6: "Saldo atual" sem corte de data | 03-E | 04-A |
| RR-E-7: a régua do gasto alto compara mês parcial com meses cheios | 03-E | 04-A (alertas do painel) |
| "parcial" nas telas (campo entregue pela 03-B2) | 03-B2 | 04-A, 04-A2 e 06 |
| RR-C2-10: filtro ligado × desligado no escuro | 03-C2 | 04-A2 (barra de filtros) |
| RR-C2-6: seletor de categoria do formulário | 03-C2 | 04-A ou subfase de formulário (inalterado) |

**Aceite:** todo indicador abre os registros que o explicam · totais conciliam · gráfico de
pizza sem negativo · série futura visualmente distinta de realizado · **o aceite visual de
`REFERENCIA-VISUAL.md` §7** (prévia aprovada, 390/768/1280/1440 px, claro e escuro, contraste
do banner medido, banner sem JS de cliente) · nenhum bloco que o painel tem hoje sumiu.

---

## REDESIGN-05 — Central de cartões e faturas

| Subfase | Entrega |
| --- | --- |
| **05-A** | `layout.tsx` compartilhado em `/cartoes`, `/faturas`, `/parcelamentos` + navegação interna + Visão geral + Meus cartões. **Nenhuma página muda de lugar** |
| **05-B** | Faturas e pagamentos: priorizar atuais/vencidas/a vencer, detalhamento dentro da fatura, fluxo de pagamento reusado com tratamento de reenvio |
| **05-C** | Próximos meses (matriz cartão × mês, com os quatro estados distinguíveis), Parcelamentos e Relatórios de cartão |

**Aceite:** `/faturas?card=X&month=Y` e `/parcelamentos` continuam respondendo com parâmetros ·
rótulo honesto de horizonte (**nunca** "6 faturas" para 6×N) · fatura existente, projeção, paga,
zero e "sem lançamentos conhecidos" visualmente distintos · clique no card não dispara ação
financeira.

---

## REDESIGN-06 — Dashboard geral

🎨 **Referência visual (D65, 2026-10-25): print 2.** Descrita em
[REFERENCIA-VISUAL.md](REFERENCIA-VISUAL.md) §2 e §5.

Barra (período + Personalizar) → **banner de boas-vindas** → **Resumo financeiro** (faixa fixa
de 4 indicadores: saldo das contas com o olho, entradas do mês, saídas do mês, total em cartões
com à vista) → **grade dos 11 cards**, todos do mesmo tamanho, cada um com a anatomia do print.

⚠️ **A sequência antiga** (Cabeçalho compacto → Prioridades do dia → Resumo financeiro →
Organização → Saúde → Insights) **foi substituída pela do print.** O "hoje" de cada módulo
fica nos quadros do próprio card (Hoje · Atrasadas · Urgentes no TO-DO, Eventos hoje na Agenda,
concluídos hoje em Hábitos), e o bloco "Prioridades do dia" sai do plano. O agrupamento
Organização/Saúde também sai, porque a ordem dos cards é sua e o "Personalizar" já a guarda.

**Entram aqui também:** o F3 (o seletor de período do dashboard sem `aria-pressed`, registrado
na 07-A), o D15 (quando dobrar fatias em "Outros"), o RR4 no card Financeiro e a divergência do
`card-meta.ts` em Notificações (`NAVEGACAO.md` §5).

**Primeiro entregável: prévia com dado sintético, aprovada antes do código.** Cria as peças
comuns (banner, indicador, bloco, olho) se a 04-A ainda não as tiver criado. Se já tiver,
**reusa**, nunca copia.

**Aceite:** os 11 ids de `DASH_CARD_IDS` preservados · layout personalizado existente não é
resetado · carregamento por bloco mantido · erro isolado por bloco, **inclusive na faixa do
Resumo financeiro** · a faixa e o card Financeiro saem da **mesma** leitura · card de "hoje"
**diz** que é de hoje · salvar ordem não sequestra o período padrão (R7) · **a IA continua sem
gerar nada no carregamento** (`boundaries.test.ts:552` tem de continuar verde) · **o aceite
visual de `REFERENCIA-VISUAL.md` §7**.

---

## REDESIGN-07 — Demais módulos

Um lote por vez, cada um com seu gate.

| Lote | Módulos | Cuidado |
| --- | --- | --- |
| **07-A** | TO-DO, Agenda, Rotinas e tarefas | Não misturar `todo_*` com `tasks`; preservar vínculos com agenda e notificações |
| **07-B** | Hábitos, Estudos | Não duplicar registro vindo de módulo especializado; não alterar contagem de tempo |
| **07-C** | Dieta, Treinos | ⛔ **Sessão de treino ao vivo não pode ser reiniciada por remontagem.** Cronômetro por timestamp, fila local e estado no servidor |
| **07-D** | IA, Configurações, Notificações, Busca | ⛔ Streaming SSE e o painel flutuante; distinguir sugestão × aguardando confirmação × executada; **não ampliar permissão nem iniciar gasto** |

---

## REDESIGN-08 — Regressão e entrega

Testes operacionais · revisão claro/escuro · **390/768/1280/1440 px e zoom 200%** ·
acessibilidade (teclado, foco visível, contraste, retorno de foco, alternativa a arrastar) ·
comparação de performance antes/depois · documentação · plano de reversão.

**Entrega preparada. Nada é publicado sem sua autorização.**

---

## Ordem e dependências

```
00 ✅ ──▶ 01 ──┬──▶ 02 ──┬──▶ 06 (dashboard)
               │         └──▶ 07 (lotes A–D)
               └──▶ 03 ──┬──▶ 04 (relatórios e terceiros)
                         └──▶ 05 (central de cartões)
                                   └──▶ 08 (regressão e entrega)
```

02 e 03 são independentes e podem andar em paralelo — 02 é visual, 03 é significado. 04, 05 e
06 dependem das duas. **08 fecha.**

04-A e 06 compartilham as peças visuais de `REFERENCIA-VISUAL.md` §2. A primeira das duas a
rodar as cria e a outra reusa. Não há ordem obrigatória entre elas.

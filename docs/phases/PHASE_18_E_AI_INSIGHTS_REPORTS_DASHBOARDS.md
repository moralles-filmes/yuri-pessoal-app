# Fase 18-E — IA · Insights, relatórios e dashboards

> Quinta das **6 subfases** da Fase 18. **Depende das 18-A a 18-D concluídas.**
> Desenho geral em `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`.

## Contexto

Esta subfase leva a IA para onde o usuário já olha todo dia: o dashboard. É também onde um
módulo de IA costuma ficar caro e barulhento — chamando o modelo a cada carregamento de página
e produzindo texto genérico que ninguém lê duas vezes.

As duas regras que evitam isso: **o modelo recebe métricas já calculadas, nunca o banco**; e
**o dashboard nunca chama a IA no carregamento** — insights são gerados, persistidos,
expirados e invalidados de forma controlada.

## Objetivo

1. **Insight Engine** sobre indicadores determinísticos.
2. **Persistência, expiração e invalidação** de insights.
3. **Área "Insights da IA"** configurável no dashboard geral.
4. **Resumo do Dia** e **Revisão Semanal**, opcionais.
5. **Análises cruzadas** honestas, sem afirmar causalidade.
6. **Conversar com um relatório.**

## Dependências

18-A a 18-D. `src/lib/dashboard/*` (cards configuráveis da Fase 12), `src/lib/reports/*`
(Fase 14), `src/lib/finance/*`, `src/lib/training/metrics.ts` (única fonte de agregado de
Treinos), `src/lib/nutrition/calc.ts` e `reports.ts`, `src/lib/body/*`. Cron da Vercel
(`0 12` e `0 0` — 09h e 21h BRT).

## Escopo

### Fluxo obrigatório

```txt
1. Job agendado seleciona o período
2. Serviços determinísticos calculam os indicadores    ← metrics.ts, calc.ts, invoice.ts, reports/
3. O modelo recebe dados RESUMIDOS
4. O modelo explica padrões
5. Validações impedem afirmação não suportada pelos dados enviados
6. Insight é salvo
7. O dashboard apresenta o insight salvo
8. O usuário pode abrir as fontes
```

**Nenhum insight é gerado no carregamento da página.**

### Frequências e tipos

Diário · semanal · mensal · sob demanda.
Informativo · atenção · oportunidade · meta · anomalia · planejamento · conquista.

### Cada insight contém

Título · resumo · explicação · módulo · período · prioridade · confiança · evidências · fontes
· ações sugeridas · provedor · modelo · `prompt_version` · data de geração · validade · status
· feedback.

### Ações do usuário

Abrir · ver fontes · transformar em tarefa · criar evento · aplicar sugestão · dispensar ·
adiar · não mostrar novamente · avaliar como útil ou inútil.

Transformar em ação passa **sempre** pelo fluxo de proposta e confirmação da 18-C.

### Cards no dashboard

Resumo do dia · atenções financeiras · tarefas importantes · conflitos de agenda · hábitos ·
progresso de estudos · alimentação · próximo treino · metas · sugestão da semana.

Cada card mostra agente, período, resumo, confiança, fontes, ação sugerida, data da análise,
e botões abrir chat, dispensar, adiar e transformar em ação. A área é configurável, no padrão
de `dashboard_layout` que já existe.

### Resumo do Dia

Compromissos · tarefas · rotinas · hábitos · refeições · treino · contas · fatura próxima ·
sessões de estudo · alertas · sugestão de prioridades. Separado em **obrigatório hoje ·
importante · opcional · atrasado · bloqueado · conflito**. Envio como notificação interna em
horário configurável.

### Revisão Semanal

Resumo financeiro · tarefas concluídas e pendentes · agenda · hábitos · rotinas · estudos ·
dieta · treinos · metas · principais avanços · pontos de atenção · sugestão para a próxima
semana. As sugestões viram tarefas, eventos, metas, planejamento alimentar ou de treino —
sempre pelo fluxo de confirmação.

### Análises cruzadas

Agenda cheia × tarefas atrasadas · dias de treino × alimentação planejada · rotina de estudos ×
tempo disponível · gastos com delivery × planejamento alimentar · frequência de treino × metas.

**Não afirmar causalidade sem evidência.** Linguagem do tipo "há uma associação nos registros".
Mostrar os períodos comparados e as limitações. Sem diagnóstico médico. Dado incompleto nunca
vira conclusão definitiva.

### Restrições herdadas que continuam valendo

Sem prescrição nutricional ou de treino · sem "peso ideal" nem IMC classificatório · sem
sugestão de carga máxima · sem linguagem de culpa (o teste de vocabulário proibido das Fases
16-F e 17-F **também varre** os textos gerados aqui) · dia sem registro não é zero ·
"esqueci de anotar" não é "falhei na meta".

### Novas tabelas

`ai_insights`, `ai_insight_sources`, `ai_insight_feedback`.

## Fora do escopo

Memória, voz, automações configuráveis pelo usuário, botão flutuante, notificações no sino,
busca global, retenção e pesquisa externa — tudo 18-F.

## Regras de segurança

O modelo recebe **resumo**, nunca linhas cruas em volume · fontes registradas por insight ·
insight não pode citar registro que não estava nas fontes · validação impede afirmação não
suportada · orçamento e limites de job automático respeitados (limite separado para jobs) ·
job que falha registra erro sanitizado e não repete escrita.

## Regras de confirmação

Insight é **sugestão**, nunca ação. Transformar insight em tarefa, evento, meta, refeição,
treino ou lançamento passa pelo fluxo da 18-C, com o nível de risco da ação de destino.

## Plano de implementação

1. Contrato de indicador (o que cada módulo entrega já calculado).
2. Migrations das três tabelas. 3. Insight Engine + validações. 4. Geração agendada pelo Cron
existente, com dedupe determinístico. 5. Persistência, expiração e invalidação. 6. Cards no
dashboard. 7. Resumo do Dia e Revisão Semanal. 8. Conversar com um relatório. 9. Testes.
10. Documentação.

## Critérios de aceite

Geração funciona · insight é persistido · fontes ficam registradas e abrem os registros reais
· expiração funciona · feedback é gravado · transformar em tarefa passa por confirmação ·
**não há duplicação** (rodar o job três vezes não gera três insights iguais) · **o dashboard
não chama a IA em nenhum carregamento** · insight não cita registro fora das fontes · nenhum
cálculo é feito pelo modelo · análise cruzada não afirma causalidade e mostra períodos e
limitações · o teste de vocabulário proibido passa em todo texto gerado · limite de orçamento
de job é respeitado · transversais do projeto.

## Testes

Geração · persistência · fontes · expiração · feedback · transformar em tarefa · não duplicação
· dashboard não dispara IA · comparação entre o número do insight e o número da tela (mesmo
serviço determinístico) · vocabulário proibido · afirmação não suportada é bloqueada · job com
orçamento esgotado não roda.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Custo recorrente alto | Limite separado para jobs automáticos; frequência configurável; modo econômico |
| Insight genérico e inútil | Entrada é indicador calculado, não texto solto; feedback do usuário orienta o prompt |
| IA chamada a cada carregamento | Insight persistido; teste dedicado |
| Afirmação sem suporte nos dados | Validação contra as fontes enviadas |
| Linguagem de cobrança | Teste de vocabulário proibido, o mesmo das Fases 16-F e 17-F |
| Cron só roda 2×/dia (09h e 21h BRT) | Frequências planejadas dentro dessa cadência; geração sob demanda cobre o resto |

## Instruções para o agente seguinte

A 18-F fecha a Fase 18: integra ao sino, à busca global e ao botão flutuante, e **valida os
critérios de aceite gerais do módulo inteiro**, não só os seus.

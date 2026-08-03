# Fase 16-E — Dieta e Alimentação · Medidas corporais, evolução e relatórios

> Quinta das **6 subfases** da Fase 16. **Depende das 16-A a 16-D concluídas.**

## Contexto

O módulo já registra o que entra; falta acompanhar o que muda. Esta subfase fecha o ciclo
com medidas corporais, fotos privadas de evolução e os relatórios que dão sentido ao
histórico acumulado nas subfases anteriores.

## Objetivo

1. **Medidas corporais** com tipos padrão e personalizados, histórico e metas.
2. **Evolução** com valor atual/inicial, diferença absoluta e percentual, gráficos e média
   móvel quando adequada.
3. **Fotos de evolução privadas** (frontal, lateral, traseira) com comparação entre datas.
4. **Relatórios** nutricionais e de evolução + **exportação**.

## Dependências

16-A a 16-D. Fase 14 — bucket privado `attachments` e o padrão de policy por pasta
`{user_id}/…`. Fase 07/14 — componentes de gráfico (`recharts`) e `src/lib/reports/*`.

## Escopo

### Dados
`nutrition_measurement_types` (seed: peso, percentual de gordura, massa muscular, cintura,
abdômen, quadril, peitoral, pescoço, braço D/E, antebraço D/E, coxa D/E, panturrilha D/E +
personalizados), `nutrition_measurements`, `nutrition_measurement_goals`,
`nutrition_progress_photos`.

### Registro de medida
Data, horário, valor, unidade, observação, **condição da medição** (jejum, pós-treino,
manhã…), foto opcional, origem (`manual` | integração futura).

### Fotos
Bucket **privado** (`nutrition-photos` ou reuso do `attachments`), caminho
`{user_id}/nutrition_photo/{id}/…`, **URL assinada de vida curta**, validação de MIME e
tamanho, policy de `storage.objects` por pasta. **Nunca** URL pública permanente.

### Relatórios
Consumo diário/semanal/mensal, média por período, planejado × consumido por macro,
micronutrientes disponíveis, refeições e alimentos mais consumidos, substituições mais
realizadas, dias com maior/menor aderência; peso e medidas ao longo do tempo, meta ×
evolução, consumo × evolução, frequência de registros, tendências.

### Exportação
CSV (padrão do projeto, `src/lib/reports/csv.ts`), JSON via `/api/export` estendido, e
XLSX onde já houver infraestrutura (`xlsx` já está no projeto).

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Integração com balança/wearable | Não planejado. `source` já prevê o campo. |
| Notificação de medida semanal pendente | **16-F** |
| Cards de evolução no dashboard geral | **16-F** |

## Regras de negócio

1. **Fotos são privadas.** Bucket privado + RLS + URL assinada curta. Nenhum caminho
   público, nenhuma foto no export JSON (só a referência).
2. **Nenhuma afirmação de causalidade** entre um alimento e uma alteração corporal. Os
   relatórios mostram séries lado a lado e dizem explicitamente que correlação não é causa.
3. **Relatório usa a meta vigente na época** (`nutrition_goal_periods`), nunca a atual.
4. **Média móvel** só onde há dados suficientes; caso contrário a UI omite em vez de
   inventar suavização.
5. **Exportação contém apenas dados do usuário** — as leituras rodam sob a sessão dele,
   com RLS.
6. **Gráfico nunca é a única forma de ler o dado** — tabela/valor textual sempre disponível
   (acessibilidade).

## Plano de implementação

1. Migrations (4 tabelas) + bucket/policies de storage.
2. Puros: `src/lib/nutrition/measurements.ts` (diferença, percentual, média móvel,
   comparação entre datas) e `reports.ts` (agregações por período).
3. Queries, actions, upload assinado.
4. UI `/nutricao/medidas` e `/nutricao/relatorios` + integração na aba de `/relatorios`.
5. Verificação + documentação.

## Critérios de aceite

- [ ] Registro, edito, duplico e excluo medidas; seleciono várias e excluo em massa.
- [ ] Filtro por período, tipo de medida, com/sem foto e meta relacionada.
- [ ] Vejo valor atual, inicial, diferença absoluta e percentual, meta e evolução.
- [ ] Vejo gráfico e histórico, com leitura textual equivalente.
- [ ] Envio fotos frontal/lateral/traseira e comparo duas datas.
- [ ] As fotos **não** são acessíveis sem sessão e não têm URL pública.
- [ ] Gero relatórios nutricionais e de evolução por período e exporto.
- [ ] Nenhum relatório afirma causalidade.
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

Registro e edição de medida; comparação entre datas; diferença absoluta e percentual;
meta × atual; média móvel com poucos dados; agregação por dia/semana/mês; média por período;
planejado × consumido no período; relatório usando a meta da época; export contendo só o
usuário; **teste de privacidade da foto** (caminho assinado expira; sem sessão → negado).

## Riscos

| Risco | Mitigação |
| --- | --- |
| Vazar foto de evolução | Bucket privado, policy por pasta, URL assinada curta, teste de acesso negado. |
| Sugerir causalidade | Texto revisado; relatório só apresenta séries. |
| Relatório retroativo mudar ao alterar meta | Meta lida por data de vigência; teste dedicado. |

## Arquivos de documentação a atualizar

Os mesmos da 16-A.

## Instruções para o próximo agente

Próxima: **16-F** (`docs/phases/PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md`).
É a subfase que fecha a Fase 16 — ela precisa validar os **40 critérios de aceite gerais**
listados lá, não só os seus próprios.

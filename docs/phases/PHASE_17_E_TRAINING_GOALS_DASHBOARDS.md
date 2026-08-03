# Fase 17-E — Treinos · Metas, medidas corporais compartilhadas, dashboards e relatórios

> Quinta das **6 subfases** da Fase 17. **Depende das 17-A a 17-D concluídas.**

## Contexto

O módulo já registra e já lê. Falta a camada de **direção** (metas) e de **síntese**
(dashboards e relatórios) — e a ponte com a evolução corporal, que é o que dá sentido a todo
o resto.

Esta subfase carrega a decisão arquitetural mais delicada da Fase 17, e ela **não** é sobre
treino.

## ⚠️ Decisão registrada: medidas corporais são um módulo central, não de Treinos

Peso, percentual de gordura, massa muscular e circunferências interessam a **Treinos** e a
**Dieta e Alimentação** ao mesmo tempo. Duas tabelas para o mesmo dado significam dois
gráficos que discordam sobre quanto o usuário pesa.

Levantamento feito em **2026-08-03**: essa estrutura **ainda não existe** no sistema. A Fase
16-E a tinha planejado como `nutrition_measurement_types` / `nutrition_measurements` /
`nutrition_measurement_goals` / `nutrition_progress_photos` — ou seja, como estrutura
exclusiva de Dieta.

**Decisão:** a estrutura nasce como **módulo central compartilhado**, com prefixo `body_*` e
código em `src/lib/body/`, consumida por Dieta **e** por Treinos.

| Tabela | Papel |
| --- | --- |
| `body_measurement_types` | Tipos (peso, %GC, massa muscular, cintura, abdômen, quadril, peitoral, pescoço, braço D/E, antebraço D/E, coxa D/E, panturrilha D/E) — globais + personalizados. |
| `body_measurements` | O registro: data, hora, valor, unidade, condição da medição, observação, `source`. |
| `body_measurement_goals` | Meta por tipo de medida, com valor inicial, alvo, prazo e status. |
| `body_progress_photos` | Fotos privadas de evolução (bucket privado, URL assinada curta). |

**Quem chegar primeiro cria; o outro consome.** Se a Subfase 16-E for implementada antes da
17-E, ela cria as tabelas `body_*` (não as `nutrition_measurement_*`) e esta subfase apenas
lê e escreve por meio de `src/lib/body/`. Se a 17-E vier primeiro, a 16-E consome o que
estiver pronto. **Em nenhuma hipótese existem duas tabelas de peso corporal.**
A Subfase 16-E já foi anotada com essa alteração no seu próprio arquivo.

O módulo Treinos pode: exibir os dados, criar registros **pelo serviço compartilhado**,
relacionar medidas a metas e mostrar gráficos. Não pode ter tabela própria de medida
corporal.

## Objetivo

1. **Metas de treino** — frequência, desempenho, corporais, organização e personalizadas,
   com períodos, progresso e histórico de alterações.
2. **Módulo central de medidas corporais** (`body_*`), consumido por Treinos e por Dieta.
3. **Dashboards** semanal, mensal e anual + distribuição por grupo muscular + calendário de
   consistência.
4. **Relatórios** por período, com filtros e exportação.

## Dependências

17-A a 17-D. Fase 14 (`attachments`, bucket privado, exportação, `src/lib/reports/*`).
Fase 07 (padrões de gráfico com `recharts`). Fase 16-B (`nutrition_goal_periods` como
referência de "meta vigente por data").

## Escopo

### Schema

**Treinos (2 tabelas):** `training_goals`, `training_goal_progress`.
**Central (4 tabelas):** `body_measurement_types`, `body_measurements`,
`body_measurement_goals`, `body_progress_photos` — *se ainda não existirem*.

### Tipos de meta

- **Frequência**: treinos por semana/mês/ano, dias ativos, semanas consecutivas.
- **Desempenho**: peso em um exercício, repetições, 1RM estimado, volume, séries por semana,
  tempo total treinado.
- **Corporais**: peso, %GC, massa muscular, medidas — **lidas de `body_*`**.
- **Organização**: cumprir programa, concluir N sessões, manter frequência, treinar um grupo.
- **Personalizadas**: nome, descrição, unidade, valor inicial, alvo e prazo livres.

Períodos: semanal, mensal, trimestral, semestral, anual, personalizado.
Status: planejada, ativa, atingida, pausada, cancelada, expirada.

### Lógica pura (com testes)

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/training/goals.ts` | Progresso da meta por tipo, meta vigente por data, status derivado, metas intermediárias. |
| `src/lib/training/dashboards.ts` | Agregações de semana/mês/ano, aderência, comparação entre períodos, sequência. |
| `src/lib/body/measurements.ts` | Diferença absoluta e percentual, comparação entre datas, média móvel, progresso da meta corporal. |
| `src/lib/training/reports.ts` | Séries por período para os relatórios e para a exportação. |

### Interface

- `/treinos/metas` — criar, acompanhar, pausar, concluir; metas intermediárias; histórico.
- `/treinos/evolucao` — desempenho (17-D) **+** evolução corporal (`body_*`), lado a lado.
- `/treinos` (visão geral) — agora completa: resumo do dia, resumo semanal, evolução recente
  e ações rápidas.
- `/treinos/relatorios` — relatórios com filtros e exportação CSV.
- Calendário de consistência (mapa de calor) em `/treinos/calendario`.

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Notificação de meta atingida / medição pendente | **17-F** |
| Cards de treino no dashboard geral do sistema | **17-F** |
| Integração com balança ou wearable | **Não planejado.** `body_measurements.source` já prevê o campo. |
| Recomendação de meta pelo sistema | **Nunca.** Meta é decisão do usuário. |

## Regras de negócio

1. **Uma só fonte de verdade corporal.** Nenhuma tabela de peso/medida dentro do prefixo
   `training_*` ou `nutrition_*`.
2. **Meta não reescreve o passado.** Alterar o alvo hoje não muda o progresso registrado
   ontem; toda alteração vira linha em `training_goal_progress` com valor anterior, valor
   novo, data e origem.
3. **Status derivado na leitura** — `atingida`, `expirada` e `em atraso` saem de valor atual
   × alvo × prazo. Só `pausada` e `cancelada` são gravados por decisão do usuário.
4. **Todo número vem de `metrics.ts`** (17-D). Dashboards não recalculam volume.
5. **Séries por grupo muscular é registro, não prescrição.** A tela diz "seu registro de
   treinamento", nunca "o ideal é X séries".
6. **Sem linguagem de culpa.** O calendário de consistência mostra dias treinados, parciais,
   descansos planejados e não realizados — sem cobrança, sem alarme.
7. **Fotos são privadas.** Bucket privado, policy por pasta `{user_id}/…`, URL assinada de
   vida curta, nenhuma URL pública, nenhuma foto no export (só a referência).
8. **Nenhuma afirmação de causalidade** entre treino e alteração corporal. Séries lado a lado,
   com o aviso de que correlação não é causa.
9. **Média móvel só com dados suficientes** — caso contrário a UI omite em vez de inventar
   suavização.
10. **Gráfico sempre tem leitura textual equivalente.**

## Plano de implementação

1. Verificar se `body_*` já existe (16-E). Se não, criar as 4 tabelas + bucket/policies.
2. Migrations de `training_goals` e `training_goal_progress`.
3. Puros: `goals.ts`, `dashboards.ts`, `src/lib/body/measurements.ts`, `reports.ts` + testes.
4. Queries agregadas, actions, upload assinado de foto.
5. UI: metas, evolução, visão geral completa, relatórios, calendário de consistência.
6. Estender `/api/export` e `/relatorios` com os dados de treino.
7. Verificação + documentação.

## Critérios de aceite

- [ ] Crio metas de frequência, desempenho, corporais, de organização e personalizadas.
- [ ] Defino período, valor inicial, valor-alvo, unidade, prazo e metas intermediárias.
- [ ] Vejo progresso, percentual e status; pauso, cancelo e concluo.
- [ ] Alterar uma meta não apaga o histórico anterior.
- [ ] Registro peso, %GC e medidas corporais **usando a estrutura compartilhada**, e o mesmo
      dado aparece no módulo Dieta.
- [ ] Não existe nenhuma segunda tabela de peso corporal no banco.
- [ ] Envio fotos de evolução privadas e comparo duas datas; sem sessão, o acesso é negado.
- [ ] Vejo dashboards semanal, mensal e anual com comparação com o período anterior.
- [ ] Vejo séries semanais por grupo muscular, frequência e última vez treinado.
- [ ] Vejo o calendário de consistência com dias treinados, parciais, descanso e não
      realizados — sem linguagem de culpa.
- [ ] Gero relatórios por período com filtros e exporto em CSV.
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

**Metas** — progresso por tipo (frequência, desempenho, corporal, organização,
personalizada); meta semanal/mensal/anual; status derivado (atingida, expirada, em atraso);
alteração preservando histórico; meta intermediária; período personalizado; virada de
semana/mês/ano com primeiro dia de semana configurável.

**Dashboards** — agregação semanal/mensal/anual; aderência; comparação com o período
anterior; sequência de semanas cumprindo a meta; distribuição por grupo muscular; período sem
nenhum treino (não pode dividir por zero nem exibir `NaN`).

**Medidas (`src/lib/body/measurements.ts`)** — diferença absoluta e percentual; comparação
entre datas; média móvel com poucos dados; progresso da meta corporal; unidade preservada.

**Privacidade** — foto sem sessão: negada; URL assinada expira; export não contém binário.

**Exportação** — CSV com os dados do período; export JSON só do próprio usuário.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Criar tabela de peso paralela à da Dieta | Decisão registrada acima + verificação explícita no passo 1 + critério de aceite que confere o banco. |
| Dashboard divergir do histórico | Todo número sai de `metrics.ts`; nada recalculado. |
| Linguagem de cobrança/culpa | Texto revisado item a item; sem alarme, sem "você falhou". |
| Vazar foto de evolução | Bucket privado + policy por pasta + URL assinada curta + teste de acesso negado. |
| Sugerir causalidade treino → corpo | Séries lado a lado com aviso explícito. |

## Arquivos de documentação a atualizar

Os mesmos da 17-A **mais** `docs/phases/PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md`, se a
estrutura `body_*` for criada aqui.

## Instruções para o próximo agente

Próxima: **17-F** (`docs/phases/PHASE_17_F_TRAINING_INTEGRATIONS_POLISH.md`).
É a subfase que fecha a Fase 17 — ela precisa validar os **critérios de aceite gerais do
módulo**, listados lá, não apenas os seus próprios.

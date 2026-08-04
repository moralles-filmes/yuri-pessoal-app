# Fase 18-B — IA · Contexto, ferramentas de leitura e agentes

> Segunda das **6 subfases** da Fase 18. **Depende da 18-A concluída e verificada.**
> Desenho geral em `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`.

## Contexto

A 18-A entregou uma fundação segura que **não sabe nada** sobre os dados do usuário. Esta
subfase abre a primeira porta: leitura. É onde a IA passa a conversar sobre o financeiro, o
TO-DO, a agenda, as rotinas, os hábitos, os estudos, a dieta e os treinos.

O risco central aqui não é vazar dado — a RLS já protege. É **inventar dado**. Um assistente
que responde "você gastou R$ 1.240 em mercado" sem que esse número tenha saído de uma consulta
real é pior do que um assistente que diz "não sei". Por isso rastreabilidade e a distinção
entre fato, cálculo, inferência e sugestão são requisito, não enfeite.

O segundo risco é **enviar o banco inteiro para o modelo**. O Context Engine existe para
buscar só o necessário.

## Objetivo

1. **Tool Registry povoado** — só ferramentas de **leitura**, com allowlist por agente.
2. **Context Engine** que interpreta intenção, escolhe módulos, período e filtros, pagina,
   agrega, poda e limita.
3. **Rastreabilidade** — toda resposta baseada em dados mostra suas fontes.
4. **Oito agentes especializados** + orquestrador.
5. **Contexto da página atual**, explícito e opt-in.
6. **Auditoria de leitura** — `ai_run_steps` e `ai_tool_calls`.

## Dependências

18-A concluída. Todos os módulos de leitura já existentes: `src/lib/finance/*`,
`src/lib/todo/*`, `src/lib/calendar/*`, `src/lib/tasks/*`, `src/lib/habits/*`,
`src/lib/studies/*`, `src/lib/nutrition/*`, `src/lib/training/*`, `src/lib/body/*`,
`src/lib/dashboard/*`, `src/lib/reports/*`.

## Escopo

### Tool Registry — leitura

Cada ferramenta declara os 13 campos do contrato: `name`, `version`, `module`, `description`,
`inputSchema`, `outputSchema`, `kind`, `riskLevel`, `requiresApproval`, `allowedAgents`,
`requiredPermissions`, `executor`, `timeoutMs`, `idempotencyPolicy`, `auditPolicy`.

Exemplos do que entra (a lista definitiva sai do inventário de abertura):

```txt
finance.get_dashboard_summary · finance.search_transactions · finance.get_invoice
finance.list_cards · finance.get_receivables · finance.get_installments
todo.search_tasks · todo.get_today · todo.list_projects
calendar.list_events · calendar.check_conflicts · calendar.find_free_slots
routines.list · habits.get_streaks · studies.get_progress
nutrition.get_daily_summary · nutrition.search_foods · nutrition.get_goals
training.get_last_workout · training.get_volume · training.get_records
body.get_measurements
```

Nomes representam **ações de domínio**. Proibido: `execute_sql`, `run_code`,
`call_any_endpoint`, `update_any_table`, `delete_any_record`, `fetch_url_unrestricted`,
`database.insert` e equivalentes.

### Context Engine

Interpreta intenção · define módulos, período e filtros · chama ferramentas de leitura ·
pagina · agrega · remove o desnecessário · respeita permissões · cria referências aos
registros · limita o contexto · registra quais fontes foram usadas.

**Cálculo é do backend, nunca do modelo.** Somas, médias, contagens, comparações e projeções
saem dos serviços determinísticos que já existem — `src/lib/training/metrics.ts`,
`src/lib/nutrition/calc.ts`, `src/lib/finance/invoice.ts`, `src/lib/reports/*`. O modelo
recebe o resultado pronto e **explica**.

**Texto não estruturado** (comentários, notas, descrições) pode usar busca textual. Embeddings
só se justificarem — e **nunca** substituem consulta relacional para valor financeiro, data,
fatura, série de treino, macronutriente, evento, tarefa ou meta. A extensão `vector` está
disponível no projeto mas **não instalada**; instalar é decisão desta subfase, com
justificativa registrada.

### Fontes e rastreabilidade

Chips de fontes · período analisado · quantidade de registros · "Ver dados usados" · links
para abrir os registros · aviso quando o dado estiver incompleto · data da análise.

A IA diferencia **dado confirmado**, **cálculo do sistema**, **inferência**, **sugestão** e
**informação ausente**. **Nunca inventa registro para completar resposta.**

### Agentes

Orquestrador **Assistente Pessoal** + 8 especializados: Financeiro, TO-DO, Agenda, Rotinas,
Hábitos, Estudos, Dieta e Alimentação, Treinos. Cada um com identificador, nome, descrição,
ícone, prompt versionado, escopo de dados, allowlist de leitura, allowlist de escrita (vazia
até a 18-C), provedor e modelo padrão, limites, regras de segurança, data da versão, status e
testes próprios.

O orquestrador identifica intenção, identifica módulos, seleciona o agente, seleciona
ferramentas de leitura, pede esclarecimento só quando realmente necessário, apresenta resultado
e registra fontes. **Não duplica a lógica dos especializados.**

Restrições de domínio que continuam valendo, herdadas das Fases 16 e 17: sem prescrição, sem
diagnóstico, sem afirmar equivalência nutricional sem evidência, sem sugerir carga máxima, sem
recomendar aumento com dor registrada, sem linguagem de culpa, sem afirmar causalidade em
análise cruzada.

### Contexto da página

Contexto **explícito**: rota, módulo, tipo do registro, ID autorizado, título e campos mínimos
permitidos. A página **não** envia HTML nem estado completo. O usuário vê quando o contexto
está sendo usado e pode desligar ("Usar contexto desta página").

### Novas tabelas

`ai_run_steps` e `ai_tool_calls`, penduradas em `ai_runs.id`. Registram ferramenta, versão,
argumentos sanitizados, duração, status, erro e **rejeições** (nome desconhecido, fora da
allowlist, schema inválido). Mais `ai_context_snapshots` e `ai_source_references` se o
inventário mostrar necessidade.

## Fora do escopo

Toda escrita (18-C) · imagens e documentos (18-D) · insights e dashboards (18-E) · memória,
voz, botão flutuante, automações, notificações e busca global (18-F).

## Ferramentas autorizadas

**Somente `kind = 'read'`.** O executor de escrita continua indisponível. Uma ferramenta de
escrita presente no registry mas sem executor habilitado é rejeitada com auditoria.

## Regras de confirmação

Leitura dentro dos dados do próprio usuário não exige confirmação. Nenhuma leitura desta
subfase é Nível 1 ou superior.

## Regras de segurança

`user_id` e `owner_id` não existem nos schemas · Zod `.strict()` rejeita campo adicional ·
ferramenta desconhecida rejeitada · ferramenta fora da allowlist do agente rejeitada · toda
rejeição vira auditoria sanitizada · o executor obtém o usuário da sessão · o modelo não
escolhe usuário, não ativa ferramenta desativada, não altera nível de risco e não decide se
haverá confirmação · resultado de ferramenta entra como resultado de ferramenta, nunca como
mensagem de sistema · ID de registro vindo do modelo é validado quanto à propriedade antes de
qualquer leitura.

## Plano de implementação

1. **Inventário** das leituras já existentes por módulo (o que existe, o que falta).
2. Contratos e registry de leitura.
3. Executor com allowlist, timeout e auditoria.
4. `ai_run_steps` + `ai_tool_calls` (migration) e regeneração de tipos.
5. Context Engine.
6. Fontes e rastreabilidade na UI.
7. Prompts dos 8 agentes + orquestrador, versionados.
8. Contexto da página.
9. Testes.
10. Documentação.

## Critérios de aceite

Roteamento escolhe o agente certo · ferramentas restritas por agente, comprovado por teste ·
consulta cruzada funciona pelo orquestrador · falta de dado é declarada, não preenchida ·
toda resposta com dado mostra fontes, período e quantidade · "Ver dados usados" abre os
registros reais · inferência e sugestão aparecem separadas de fato · troca de agente preserva
a conversa · contexto da página é explícito, mínimo, visível e desligável · nenhum cálculo é
feito pelo modelo · nenhuma query de módulo é reimplementada dentro de `src/lib/ai/` ·
ferramenta desconhecida, fora da allowlist ou com schema inválido é rejeitada e auditada ·
registro de outro usuário é inacessível · prompt injection vinda de conteúdo de registro não
altera comportamento · nenhuma escrita acontece · transversais do projeto (pt-BR, dark/light,
responsividade, RLS, lint/tsc/test/build, `TZ=UTC`).

## Testes

Puros: seleção de agente, seleção de ferramenta, montagem e poda de contexto, limites de
paginação, formatação de fontes, classificação fato/cálculo/inferência/sugestão.
Segurança: ferramenta permitida × proibida, schema inválido, argumento extra, registro de
outro usuário, propriedade incorreta, data inválida, valor inválido, timeout, prompt injection
em conteúdo de registro.
Comparação: o número que a IA relata **bate** com o número que a tela mostra, usando o mesmo
serviço determinístico (mesmo padrão do teste que compara dashboard com `aggregateSessions`
na 17-E).

## Riscos

| Risco | Mitigação |
| --- | --- |
| IA inventa número | Cálculo só no backend; fontes obrigatórias; teste comparando com a tela |
| Contexto grande demais (custo e latência) | Limites por ferramenta, paginação, poda de campos, resumo antes de enviar |
| Embeddings usados onde consulta relacional é obrigatória | Regra explícita + revisão; `vector` só entra com justificativa |
| Duplicação de regra de leitura dentro de `src/lib/ai/` | Teste de fronteira: as ferramentas chamam `queries.ts` dos módulos |
| Orquestrador vira um prompt gigante com o sistema inteiro | Cada agente recebe só suas regras, suas ferramentas e o contexto necessário |

## Instruções para o agente seguinte

A 18-C abre com a **matriz obrigatória de ferramentas de escrita** (12 colunas) antes de
qualquer código. Não comece a 18-C sem ela. Atualize `CURRENT_STATUS.md`,
`LAST_PHASE_SUMMARY.md` e `NEXT_AGENT_INSTRUCTIONS.md` ao fechar esta subfase.

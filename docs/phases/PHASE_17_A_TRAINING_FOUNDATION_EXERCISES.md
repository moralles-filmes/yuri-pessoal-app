# Fase 17-A — Treinos · Fundação, vocabulário e catálogo de exercícios

> Primeira das **6 subfases** da Fase 17 (Módulo Treinos). Não depende de nenhuma subfase
> anterior de Treinos — depende do sistema já existente (Fases 01–16).

## Contexto

O sistema organiza dinheiro, tempo, tarefas, hábitos, estudos e alimentação, mas não sabe
nada sobre treino. A Fase 17 abre o módulo **Treinos** em `/treinos`: musculação, hipertrofia,
força, condicionamento complementar, organização de rotinas, registro de desempenho,
progressão de carga, metas, evolução corporal, histórico e relatórios.

Esta primeira subfase constrói o **chão** do módulo. Nada de sessão, nada de programa, nada
de histórico — mas **tudo** o que vem depois depende do vocabulário e do catálogo definidos
aqui. Um exercício mal modelado agora vira dado impossível de somar na Subfase D.

A decisão que define o módulo inteiro nasce aqui: **um exercício não é uma linha de texto, é
um contrato de medição**. "Supino reto com barra" mede peso × repetições; "Prancha" mede
tempo; "Caminhada na esteira" mede duração e distância; "Barra fixa assistida" mede
repetições com peso de **assistência** (que reduz a carga, não aumenta). O campo
`tracking_type` é o que impede o sistema de somar coisas incompatíveis mais tarde.

## Objetivo

1. **Módulo `/treinos`** na sidebar, com casca e navegação interna própria para os
   **13 submódulos**, seguindo exatamente o padrão do TO-DO (Fase 15) e da Dieta (Fase 16).
2. **Vocabulário do domínio**: grupos musculares, equipamentos, padrões de movimento, tipos
   de acompanhamento, lateralidade — como dado consultável e como enums tipados.
3. **Catálogo de exercícios** completo: base do sistema somente leitura + exercícios pessoais,
   com filtros, duplicação, favoritos, arquivamento, ações em massa e exportação.
4. **Base inicial útil de exercícios** (≈106), **de autoria própria**, sem nenhum asset,
   texto, imagem, vídeo ou dado copiado de aplicativos de terceiros.
5. **Preferências do módulo** (unidade de peso, escala de dificuldade, descanso padrão,
   incremento padrão) — porque toda subfase seguinte lê daqui.

## Dependências

- **Fase 01** — design system (preto/branco/dourado, dark+light), app shell, `PageHeader`,
  `EmptyState`, `StatCard`, `SortableList`.
- **Fase 14** — `settings`, exportação, políticas de segurança.
- **Fase 15** — padrão de módulo com navegação interna própria (`todo`).
- **Fase 16-A** — **referência arquitetural direta**: `nutrition_foods` resolve exatamente o
  mesmo problema (base global imutável + cópia pessoal + preferência do usuário). O catálogo
  de exercícios copia essa estrutura de propósito, para o sistema ter **um** jeito de fazer
  isso, não dois.

## Escopo

### Schema (7 tabelas novas, todas com RLS + FORCE RLS)

| Tabela | Papel |
| --- | --- |
| `training_muscle_groups` | Grupos musculares. Linhas globais (`user_id is null`) + próprias. |
| `training_equipment` | Equipamentos. Mesma regra de propriedade. |
| `training_exercises` | Exercício. Base do sistema (`user_id is null`) + pessoais. |
| `training_exercise_muscles` | Músculos secundários (N:N, com ênfase opcional). |
| `training_exercise_alternatives` | Alternativas entre exercícios (do usuário, dirigidas). |
| `training_exercise_prefs` | Favoritar/arquivar/ajustar um exercício **global** sem editá-lo. |
| `training_preferences` | Preferências do módulo. Uma linha por usuário. |

### Vocabulários fixos (CHECK + enum em `constants.ts`)

- **Padrão de movimento** (18): empurrar horizontal/vertical, puxar horizontal/vertical,
  agachamento, dobradiça de quadril, extensão/flexão de joelho, abdução, adução,
  flexão/extensão de cotovelo, elevação, rotação, anti-rotação, estabilização, locomoção,
  outros.
- **Tipo de acompanhamento** (11): `peso_reps`, `peso_corporal_reps`,
  `peso_corporal_adicional`, `peso_corporal_assistido`, `duracao`, `distancia_duracao`,
  `calorias`, `reps_sem_carga`, `isometria`, `lado_a_lado`, `personalizado`.
- **Lateralidade**: `bilateral`, `unilateral_alternado`, `unilateral_simultaneo`.
- **Origem**: `sistema`, `usuario`, `duplicado`, `importado`.

### Base inicial de exercícios (≈106)

Peitoral (12), Costas (13), Ombros (13), Bíceps (10), Tríceps (9), Quadríceps e glúteos (17),
Posteriores de coxa (8), Panturrilhas (5), Abdômen e core (12), Cardio complementar (7).

Cada registro traz nome pt-BR, grupo principal, grupos secundários, equipamento, padrão de
movimento, tipo de acompanhamento e lateralidade. Pipeline reexecutável:
`data/training/exercise-base/exercises.json` → `scripts/training/generate-exercise-base-migration.mjs`
→ migration idempotente. Procedência em `data/training/exercise-base/ATTRIBUTION.md`.

### Lógica pura (com testes)

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/training/constants.ts` | Enums, rótulos pt-BR, seções da navegação. Sem I/O, sem React. |
| `src/lib/training/types.ts` | Tipos de domínio. |
| `src/lib/training/tracking.ts` | **Contrato de medição**: quais campos cada `tracking_type` usa, quais são obrigatórios, qual é o incremento padrão do equipamento. |
| `src/lib/training/filters.ts` | Busca sem acento, filtros combináveis, ordenação, URL ↔ filtros. |

### Interface

- Item **Treinos** na sidebar (grupo **Saúde**).
- `/treinos` — visão geral **honesta**: o que já existe (catálogo, preferências) e o que chega
  em cada subfase. Não inventa número de treino que ainda não pode existir.
- `/treinos/exercicios` — catálogo completo.
- `/treinos/configuracoes` — preferências do módulo.
- As outras 10 rotas existem e abrem uma tela que diz **em qual subfase** cada uma chega.

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Programas, treinos-modelo, planejamento semanal | **17-B** |
| Sessão de treino, cronômetro, séries, offline | **17-C** |
| Histórico, volume, 1RM, recordes, progressão | **17-D** |
| Metas, medidas corporais, dashboards, relatórios | **17-E** |
| Busca global, lançamento rápido, notificações, agenda, TO-DO, dieta, hábitos | **17-F** |
| Imagem/vídeo por exercício | Campo e URL existem desde já; **upload** vai para a 17-F (reusa `attachments`). Nenhum asset de terceiro entra, em nenhuma subfase. |

## Modelagem

### Propriedade: `user_id is null` = base do sistema, imutável

Mesma regra do catálogo de alimentos, e pelo mesmo motivo: o usuário precisa **ler** a base
sem nunca poder reescrevê-la. As policies são **separadas por comando** — `SELECT` alcança o
global, `INSERT/UPDATE/DELETE` só alcançam o próprio. Uma constraint amarra
`user_id is null` a `is_system_exercise`, então não dá para forjar um exercício "oficial".

**Favoritar, arquivar, renomear para si e ajustar descanso/incremento de um exercício global
grava em `training_exercise_prefs`**, que é dado do usuário. Duplicar cria cópia editável com
`origin_exercise_id`.

### `tracking_type` é o contrato de medição

```
peso_reps               → peso + repetições                    (supino, agachamento)
peso_corporal_reps      → repetições                            (flexão, barra fixa)
peso_corporal_adicional → repetições + carga adicional          (paralelas com cinto)
peso_corporal_assistido → repetições + peso de assistência      (barra fixa na máquina)
duracao                 → segundos                              (prancha)
distancia_duracao       → distância + segundos (+ inclinação, resistência)
calorias                → calorias exibidas pelo equipamento    (sempre rotulado ESTIMATIVA)
reps_sem_carga          → repetições                            (abdominal)
isometria               → segundos sob tensão                   (isometria com carga)
lado_a_lado             → valores independentes por lado
personalizado           → campos livres definidos pelo usuário
```

`src/lib/training/tracking.ts` é a **única** fonte dessa matriz. Formulário, sessão (17-C),
volume (17-D) e relatório (17-E) leem daqui — é o que impede o sistema de somar segundos com
quilos.

### Grupo principal × secundários

`primary_muscle_group_id` é coluna do exercício; secundários vivem em
`training_exercise_muscles` com `role in ('secundario','estabilizador')`. Uma constraint
impede que o **principal** apareça também como secundário — a duplicidade inconsistente que o
briefing pede para evitar.

### Alternativas

`training_exercise_alternatives (exercise_id, alternative_exercise_id, note)`, **dirigida** e
sem auto-referência. É organização do usuário, não equivalência biomecânica — a interface diz
isso com todas as letras.

## Regras de negócio

1. **A base do sistema é somente leitura.** Nenhuma action edita ou exclui exercício com
   `user_id is null`; a policy barra no banco e a action barra antes, para devolver mensagem
   em pt-BR em vez de "0 linhas afetadas".
2. **Preferência ≠ exercício.** Favorito, arquivado, apelido, descanso e incremento
   personalizados de um exercício global vão para `training_exercise_prefs`.
3. **Duplicar cria cópia pessoal** com `origin_exercise_id` e `source = 'duplicado'`. A cópia
   nasce editável e **não** herda o selo de verificado.
4. **Nada de dado inventado com cara de oficial.** Um exercício criado à mão nunca recebe
   `is_system_exercise` nem `is_verified`.
5. **`tracking_type` nunca é adivinhado.** É campo obrigatório, com default `peso_reps` e
   explicação na interface.
6. **Excluir é a última opção.** Arquivar é o caminho padrão; excluir exige confirmação e,
   a partir da 17-C, é **bloqueado** quando o exercício já tem sessão registrada (o histórico
   guarda snapshot, mas a referência não pode virar órfã silenciosamente).
7. **Sem prescrição, sem diagnóstico.** Instruções e erros comuns são texto organizacional do
   usuário. O módulo não recomenda treino, não avalia lesão e não promete resultado.
8. **Nenhum asset de terceiros.** Sem imagem, vídeo, ícone, texto ou base de dados copiados
   de Hevy, Strong, JEFIT, Fitbod, Alpha Progression ou qualquer outro app. A referência é
   **funcional** apenas, e a procedência da base fica registrada.

## Plano de implementação

1. Migrations das 7 tabelas (idempotentes, RLS + FORCE RLS + índices + trigger `updated_at`)
   e seed dos vocabulários globais (grupos musculares e equipamentos).
2. `data/training/exercise-base/exercises.json` + `ATTRIBUTION.md` + script gerador →
   migration do seed de exercícios.
3. Puros: `constants.ts`, `types.ts`, `tracking.ts` (+ testes), `filters.ts` (+ testes).
4. `queries.ts` (server-only, uma leitura ampla por entidade), `validators/training.ts`,
   `actions/training-exercises.ts`, `actions/training-preferences.ts`.
5. UI: casca + navegação, visão geral, catálogo (lista, filtros, detalhe, formulário, ações em
   massa), preferências, placeholders honestos das 10 rotas restantes.
6. Sidebar + `src/types/supabase.ts` regenerado + verificação + documentação.

## Critérios de aceite

- [ ] Existe o item **Treinos** na sidebar e o módulo abre em `/treinos`.
- [ ] Os 13 submódulos aparecem na navegação interna; os não implementados dizem em qual
      subfase chegam (nenhum link morto, nenhuma tela que finge funcionar).
- [ ] A navegação interna funciona no desktop (coluna) e no celular (gaveta).
- [ ] Cadastro um exercício pessoal com todos os campos.
- [ ] A base inicial traz ≈106 exercícios com grupo, equipamento, padrão e acompanhamento.
- [ ] Exercício da base **não** pode ser editado nem excluído — nem pela interface, nem pela
      action, nem por chamada direta ao banco com a sessão do usuário.
- [ ] Duplico um exercício da base e edito a cópia livremente.
- [ ] Favorito e arquivo um exercício da base sem alterá-lo.
- [ ] Filtro por nome, grupo muscular, equipamento, padrão de movimento, tipo de
      acompanhamento, lateralidade, favorito, origem (base/pessoal) e arquivado — combinados,
      com contagem de resultados e limpeza fácil.
- [ ] Seleciono vários exercícios e arquivo / restauro / excluo / recategorizo / troco
      equipamento em massa, com confirmação e relatório do que foi ignorado.
- [ ] Exporto o catálogo filtrado em CSV.
- [ ] Configuro unidade de peso, escala de dificuldade, descanso padrão e incremento padrão.
- [ ] Dark/light, responsivo (desktop/tablet/celular), pt-BR em tudo.
- [ ] Nenhuma fase anterior quebrou; `npm run lint`, `npx tsc --noEmit`, `npm run test:run` e
      `npm run build` passam.

## Testes obrigatórios

**`tracking.ts`** — campos exigidos por cada um dos 11 tipos de acompanhamento; tipo que não
aceita peso; assistência reduz a carga efetiva e adicional soma; incremento padrão por
equipamento; lateralidade `lado_a_lado` exigindo os dois lados.

**`filters.ts`** — busca sem acento por múltiplos termos ("supino incl" acha "Supino
inclinado"); cada filtro isolado; filtros combinados; contagem; ordenação (nome, grupo,
recentes, mais usados quando houver); serialização URL ↔ filtros como ida e volta.

**Segurança (executado no banco, pela role `authenticated`)** — ler a base: OK; editar
exercício global: 0 linhas; excluir exercício global: 0 linhas; inserir com `user_id` de
terceiro: bloqueado; forjar `is_system_exercise = true`: bloqueado; favoritar exercício
global: permitido; ver exercício pessoal de outro usuário: 0 linhas.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Modelar exercício sem `tracking_type` e descobrir na 17-D que não dá para somar | Campo obrigatório desde a 17-A + matriz pura testada em `tracking.ts`. |
| Criar um segundo padrão de "base global + cópia pessoal" divergente do de Dieta | O schema espelha `nutrition_foods` de propósito; a revisão confere policy por policy. |
| Base inicial parecer copiada de app de terceiro | Dados autorais (nome pt-BR + classificação de conhecimento geral), zero imagem/vídeo/texto de terceiro, procedência escrita em `ATTRIBUTION.md`. |
| Catálogo grande deixar a tela lenta | Uma leitura ampla + filtro em memória no cliente (padrão do projeto) + lista incremental. |
| Duplicar vocabulário que já existe no sistema | Reuso de `settings`, `attachments`, `SortableList`, `PageHeader`, `EmptyState`, `StatCard`. |

## Arquivos de documentação a atualizar

`docs/project/CURRENT_STATUS.md`, `docs/project/PROJECT_ROADMAP.md`,
`docs/project/PROJECT_ARCHITECTURE.md`, `docs/handoff/LAST_PHASE_SUMMARY.md`,
`docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` e o `CLAUDE.md` da raiz.

## Instruções para o próximo agente

Próxima: **17-B** (`docs/phases/PHASE_17_B_TRAINING_ROUTINES_PROGRAMS.md`).

Três coisas que você **não** pode reinventar:

1. **`tracking.ts` é a única matriz de medição.** O treino-modelo configura séries/repetições
   respeitando o tipo de acompanhamento do exercício — não crie outra tabela de "quais campos
   valem".
2. **Base global imutável.** O modelo de treino aponta para o exercício; ele nunca edita o
   exercício. Ajuste pessoal vai em `training_exercise_prefs`.
3. **Modelo é mutável, execução é imutável.** A 17-B constrói o modelo sabendo que a 17-C vai
   tirar um **snapshot** dele ao iniciar a sessão. Não crie vínculo vivo entre sessão e
   modelo, senão editar o treino reescreve o passado.

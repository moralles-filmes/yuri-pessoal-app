# Fase 17-F — Treinos · Integrações, notificações, resiliência e polimento

> ✅ **CONCLUÍDA em 2026-08-04.** 3 migrations (`training_calendar_sync`,
> `training_preferences.habit_id`, FKs compostas), +70 testes puros (suíte: 1.846 → 1.916).
> Os **55 critérios de aceite gerais foram validados um a um: 55 de 55 atendidos** — veredito
> item a item em `docs/handoff/LAST_PHASE_SUMMARY.md`. **A Fase 17 está FECHADA.**

> Sexta e última das **6 subfases** da Fase 17. **Depende das 17-A a 17-E concluídas.**
> É a subfase que **fecha o módulo**: valida os critérios de aceite gerais, não só os seus.

## Contexto

Nas cinco subfases anteriores o módulo Treinos foi construído como uma ilha funcional
completa. Esta subfase o costura ao resto do sistema — busca global, lançamento rápido,
notificações, agenda, TO-DO, Dieta, Hábitos e dashboard geral — e faz o polimento final de
acessibilidade, performance e resiliência.

O risco desta subfase não é técnico, é **de duplicidade**. O mesmo treino pode virar tarefa
no TO-DO, evento na agenda, dia planejado no calendário de Treinos e check-in de hábito. Sem
uma fonte de verdade declarada, o usuário passa a manter a mesma informação em quatro lugares.

## Objetivo

1. **Integrar** Treinos à busca global, ao lançamento rápido, às notificações e ao dashboard
   geral.
2. **Conectar** com Agenda, TO-DO, Dieta e Hábitos — sempre opt-in e sem duplicar verdade.
3. **Fechar a resiliência** da sessão (o que o navegador realmente entrega, testado).
4. **Polir** acessibilidade, performance, responsividade e textos.
5. **Validar os critérios de aceite gerais** do módulo.

## Dependências

17-A a 17-E. Fase 13 (busca global, lançamento rápido, `notifications` + `dedupe_key` + Cron
da Vercel). Fase 08 (agenda + Google, `google_integrations`). Fase 15 (TO-DO e o padrão
opt-in de sincronização). Fase 10 (hábitos). Fase 16 (Dieta). Fase 12 (dashboard geral).
Fase 14 (`/api/export`).

## Escopo

### Fonte de verdade declarada (a decisão central desta subfase)

| Informação | Fonte de verdade | Os outros módulos |
| --- | --- | --- |
| O treino aconteceu | `training_sessions` | Hábito "Treinar" **lê**; nunca se registra treino duas vezes. |
| O treino está planejado para tal dia | `training_scheduled_workouts` | Evento de agenda e tarefa de TO-DO são **espelhos opcionais**, criados por escolha. |
| Peso corporal e medidas | `body_*` (17-E) | Dieta e Treinos leem e escrevem pelo mesmo serviço. |
| Dia é de treino ou de descanso | `training_scheduled_workouts` + sessões | Dieta **lê** para metas por tipo de dia; não recalcula nada sozinha. |

### Integrações

- **Busca global** (`src/lib/search/queries.ts`): exercícios, treinos, programas, sessões,
  metas e recordes, com nome, tipo, grupo muscular, programa, última execução e status; o
  clique abre o registro.
- **Lançamento rápido**: iniciar treino, registrar treino passado, criar treino, cadastrar
  exercício, registrar peso, criar meta — reusando os formulários do módulo.
- **Notificações** (`src/lib/notifications/generate.ts`, com `dedupe_key` determinístico):
  treino planejado para hoje; horário do treino se aproximando; meta semanal em andamento;
  meta semanal atingida; treino não realizado; sessão em andamento esquecida; novo recorde;
  meta próxima do prazo; medição corporal pendente; programa perto do fim. Todas
  desativáveis, com link direto, sem duplicar e **sem linguagem de culpa**.
- **Dashboard geral** (Fase 12): cards *Treino de hoje*, *Meta semanal*, *Último treino*,
  *Evolução* e *Sessão ativa* (com botão continuar).
- **Agenda**: opt-in por interruptor próprio, sentido único (treino planejado → evento),
  ponte de idempotência com `external_event_id` único, remoção do evento **antes** do delete,
  falha do Google nunca derruba a ação — exatamente o contrato do `todo_calendar_sync`.
- **TO-DO**: criar tarefa para realizar treino, atualizar programa, registrar medidas; vincular
  meta a tarefa; abrir o treino pela tarefa. Sempre opt-in e sempre com vínculo, para o
  sistema saber que os dois registros são a mesma coisa.
- **Dieta**: dias de treino/descanso lidos do módulo Treinos para as metas por tipo de dia
  (16-B). **Nada de recalcular calorias ou macros automaticamente** — só com confirmação.
- **Hábitos**: o hábito "Treinar" reflete a sessão concluída (frequência e sequência). Sem
  segundo registro manual.
- **Exportação** (`/api/export`): todas as tabelas `training_*` e `body_*` do usuário.

### Resiliência (fechamento honesto)

Implementar e **testar**: fila local de mutações com idempotência, status de sincronização
visível, recuperação de sessão interrompida, cronômetro correto após bloqueio de tela.
Avaliar Wake Lock, vibração, som e notificação em segundo plano **com detecção de suporte** —
onde o navegador não entrega, a opção não aparece. PWA/service worker só entra se couber na
arquitetura sem quebrar o resto; caso contrário, fica registrado como não implementado.

> **Não afirmar funcionamento offline completo.** O que existe é registro resiliente com fila
> e sincronização — e é isso que a interface diz.

### Polimento

Acessibilidade (teclado, foco visível, rótulos, contraste, leitor de tela, alternativa ao
arrastar, alvos de toque, status nunca só por cor, `prefers-reduced-motion`); performance
(consultas filtradas, paginação, sem N+1, cache do catálogo, debounce na busca, cronômetro
isolado do resto da árvore); responsividade fina; revisão de texto pt-BR; skeletons e estados
vazios revisados; revisão final de RLS e de segurança.

## Fora do escopo

| Item | Situação |
| --- | --- |
| Compartilhamento social / comparação com outras pessoas | Não planejado. Sistema single-user. |
| Integração com balança, relógio ou wearable | Não planejado. `source` já prevê o campo. |
| Vídeo ou imagem de terceiros por exercício | **Nunca.** Só asset próprio, com licença registrada. |
| Sugestão automática de treino por IA | Não planejado nesta fase. |

## Regras de negócio

1. **Nenhuma integração é automática.** Agenda, TO-DO e notificações são opt-in.
2. **Nenhuma duplicidade.** A tabela acima é a fonte de verdade; espelhos carregam vínculo.
3. **Notificação não gera culpa** e nunca duplica (`dedupe_key`).
4. **Falha de integração externa nunca derruba a ação principal** — fica registrada em
   `last_error`, sem token nem corpo de resposta em log.
5. **Nenhum dado sensível em log**, nenhum segredo no client, nenhuma URL pública de foto.
6. **O módulo é ferramenta de organização e registro** — não diagnostica, não prescreve, não
   garante resultado, não recomenda tentativa de carga máxima e não incentiva treinar com dor.

## Plano de implementação

1. Fonte de verdade e vínculos (tabelas-ponte onde faltar).
2. Busca global, lançamento rápido, dashboard geral.
3. Notificações + Cron.
4. Agenda, TO-DO, Dieta, Hábitos.
5. Resiliência: fila, recuperação, detecção de suporte do navegador.
6. Acessibilidade, performance, responsividade, textos.
7. Exportação + revisão final de segurança.
8. Validação dos critérios de aceite gerais + documentação de fechamento da Fase 17.

## Critérios de aceite gerais do módulo Treinos

> Estes são os critérios que **fecham a Fase 17 inteira**. Devem ser verificados aqui, um a
> um, mesmo que implementados em subfases anteriores.

- [x] 1. Existe uma aba central **Treinos** na sidebar.
- [x] 2. Os 13 submódulos estão organizados dentro dela.
- [x] 3. Cadastro exercícios.
- [x] 4. Existe uma base inicial útil de exercícios.
- [x] 5. Filtro exercícios.
- [x] 6. Duplico exercícios pessoais.
- [x] 7. Faço exclusões em massa onde aplicável.
- [x] 8. Cadastro programas.
- [x] 9. Cadastro treinos.
- [x] 10. Defino exercícios, ordem, séries, repetições e descanso.
- [x] 11. Escolho o treino ao iniciar uma sessão.
- [x] 12. Reviso e altero as configurações antes de iniciar.
- [x] 13. O sistema sugere dados do último treino.
- [x] 14. Edito os valores sugeridos.
- [x] 15. A sessão mostra um exercício por vez.
- [x] 16. Registro peso e repetições de cada série.
- [x] 17. Registro dificuldade, RIR ou RPE.
- [x] 18. O descanso funciona corretamente.
- [x] 19. **A terceira de quatro séries avança para a quarta série, não para outro exercício.**
- [x] 20. A última série avança corretamente para o próximo exercício.
- [x] 21. Mudo a ordem durante a sessão.
- [x] 22. Pulo e volto a um exercício.
- [x] 23. Substituo um exercício.
- [x] 24. Séries realizadas não são perdidas ao mudar a ordem.
- [x] 25. O tempo total é registrado.
- [x] 26. O tempo ativo é registrado.
- [x] 27. Os descansos são registrados.
- [x] 28. Pauso e retomo.
- [x] 29. Uma sessão interrompida pode ser recuperada.
- [x] 30. O sistema tolera conexão instável.
- [x] 31. Finalizo e reviso a sessão.
- [x] 32. Abro qualquer treino passado.
- [x] 33. Vejo pesos, séries, repetições e descansos.
- [x] 34. Abro o histórico de um exercício.
- [x] 35. Vejo gráficos de evolução por exercício.
- [x] 36. Vejo volume por sessão, semana, mês e grupo muscular, com a regra explicada.
- [x] 37. Vejo meus recordes pessoais, sem duplicidade.
- [x] 38. A estimativa de 1RM aparece identificada como estimativa, com a fórmula.
- [x] 39. Recebo sugestões de progressão transparentes, ignoráveis e desativáveis.
- [x] 40. Crio e acompanho metas de frequência, desempenho, corporais e personalizadas.
- [x] 41. Registro peso e medidas corporais **na estrutura compartilhada com Dieta**.
- [x] 42. Vejo dashboards semanal, mensal e anual e o calendário de consistência.
- [x] 43. Gero relatórios e exporto os dados.
- [x] 44. Encontro exercícios, treinos, programas, sessões, metas e recordes na busca global.
- [x] 45. Inicio treino e registro peso pelo lançamento rápido.
- [x] 46. Recebo notificações configuráveis, sem duplicidade e sem culpa.
- [x] 47. Programo treino na agenda e crio tarefa no TO-DO, sempre por escolha minha.
- [x] 48. O hábito "Treinar" reflete a sessão, sem registro duplicado.
- [x] 49. Vejo treino de hoje, meta semanal, último treino, evolução e sessão ativa no
      dashboard geral.
- [x] 50. Uso tudo confortavelmente no celular, com uma mão, com botões grandes.
- [x] 51. Tudo funciona em dark e light, em desktop, tablet e celular, em pt-BR.
- [x] 52. Navego por teclado, com foco visível, rótulos e contraste adequados.
- [x] 53. Nenhum usuário acessa dado de outro; RLS + FORCE RLS em todas as tabelas do módulo.
- [x] 54. Nenhum segredo no client, nenhuma foto pública, nenhum dado sensível em log.
- [x] 55. Nenhuma fase anterior foi quebrada; lint, tsc, testes e build passam.

## Testes obrigatórios

Busca global encontrando as 6 entidades; lançamento rápido criando nos modelos certos;
notificações com `dedupe_key` (não duplicam ao rodar o Cron duas vezes); espelho de agenda
idempotente e removido antes do delete; vínculo TO-DO ↔ treino sem duplicidade; hábito
refletindo a sessão sem segundo registro; export contendo só o usuário e sem binário de foto;
isolamento entre usuários em **todas** as tabelas `training_*` e `body_*`; recuperação de
sessão; fila reenviada sem duplicar; suíte verde em `TZ=UTC` e `America/Sao_Paulo`.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Mesma informação em 4 módulos | Tabela de fonte de verdade + vínculos explícitos + teste de não-duplicidade. |
| Notificação repetida ou culpabilizante | `dedupe_key` determinístico + revisão de texto. |
| Prometer offline/PWA que não existe | Detecção de suporte + escopo declarado na interface. |
| Regressão em módulo antigo ao mexer em busca/notificação/dashboard | Alterações aditivas; suíte completa antes de fechar. |
| Fechar a fase sem validar tudo | Os 55 critérios acima são obrigatórios e ficam registrados no `CURRENT_STATUS.md`. |

## Arquivos de documentação a atualizar

Os mesmos da 17-A, **mais** o fechamento da Fase 17 em `PROJECT_ROADMAP.md` e o registro dos
55 critérios validados em `CURRENT_STATUS.md`.

## Instruções para o próximo agente

✅ **Feito.** Com a 17-F concluída, a **Fase 17 está fechada** e o projeto volta ao modo
manutenção/iteração — a menos que a Fase 16 (Dieta) ainda tenha subfases pendentes, caso em
que ela é a próxima. Confira sempre `docs/project/CURRENT_STATUS.md` antes de decidir.

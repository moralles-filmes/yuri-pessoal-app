# Fase 18-F — IA · Memória, voz, integrações e polimento

> Sexta e última das **6 subfases** da Fase 18. **Depende das 18-A a 18-E concluídas.**
> É a subfase que **fecha a fase**: valida os critérios de aceite gerais do módulo, não só os
> seus. Desenho geral em `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`.

## Contexto

Nas cinco subfases anteriores o módulo de IA foi construído como ilha. Esta o costura ao resto
do sistema — sino, busca global, botão flutuante em toda tela autenticada — e acrescenta
memória, voz e automações.

O risco aqui é o mesmo que a 16-F e a 17-F enfrentaram: **duplicidade e ruído**. Um insight
pode virar notificação, card no dashboard, badge no botão flutuante e item na busca ao mesmo
tempo. E a memória, se salvar sozinha, vira um segundo banco de dados desalinhado do primeiro.

## Objetivo

1. **Memória controlada pelo usuário.**
2. **Botão flutuante global**, discreto e configurável.
3. **Voz** — captura, transcrição e ação com confirmação.
4. **Automações da IA**, que por padrão sugerem em vez de executar.
5. **Integração** com sino, busca global e retenção/exclusão.
6. **Pesquisa externa opcional**, desligada por padrão.
7. **Validar os critérios de aceite gerais da Fase 18.**

## Dependências

18-A a 18-E. Fase 13 (busca global, lançamento rápido, `notifications` + `dedupe_key` + Cron).
Fase 14 (`settings`, `/api/export`). `src/lib/notifications/generate.ts` e o `filterByPrefs`.

## Escopo

### Memória

**Memória da conversa** (contexto temporário) · **resumo da conversa** (compacto, para
continuidade) · **preferências persistentes** ("prefiro treinar à noite", "meu cartão principal
é X", "quero receber revisão semanal", "prefiro respostas objetivas") · **memórias sugeridas**
(a IA pode sugerir salvar, mas **precisa pedir autorização**).

Controles: ver · pesquisar · editar · excluir · excluir em massa · desativar memória · definir
validade · exportar · "esqueça isso".

**Nunca salva automaticamente:** dado sensível · informação médica · segredo · documento
completo · credencial · dado passageiro · inferência não confirmada.

**A memória não substitui os registros estruturados do sistema.** Fato do sistema sai da
tabela do módulo; memória guarda preferência, não verdade de negócio.

Tabelas: `ai_memories`, `ai_memory_events`.

### Botão flutuante global

Pequeno · elegante · não invasivo · arrastável · reposicionável · posição salva por usuário e
por tipo de dispositivo · encaixa nas bordas · evita áreas de menu e ações principais · **não
cobre o lançamento rápido** · **não cobre navegação inferior no celular** · tooltip · indicador
quando há resposta ou ação pendente · acessível por teclado · alternativa quando drag and drop
não for possível · respeita áreas seguras da tela.

Ao clicar: painel lateral no desktop; bottom sheet ou tela cheia no celular. Mantém a conversa
atual · seleciona automaticamente o agente do módulo atual · permite trocar de agente · anexar
imagem · abrir o módulo completo · minimizar · cancelar geração · continuar ação pendente.

Configurações: exibir ou ocultar · tamanho · posição padrão · transparência · abrir no último
agente · atalho de teclado.

⚠️ O Header do projeto é `sticky top-0 z-30` com `h-16`. O botão e o painel precisam respeitar
isso e as **5 regras de layout responsivo** do `CLAUDE.md` — em especial `min-w-0` em lado
"texto" de flex com irmão `shrink-0`, e o fato de `cn()` ser `twMerge` (a classe do chamador
**remove** a da primitiva).

### Voz

Capturar áudio → transcrever → **mostrar a transcrição** → interpretar intenção → preparar
ação → confirmar conforme o risco → executar.

**Ação de risco não é executada com transcrição de baixa confiança.**

### Automações

Nome · descrição · módulos · frequência · horário · fuso · provedor · modelo · orçamento ·
status · última execução · próxima execução · resultado · erro · permissões · ações permitidas.

Exemplos: resumo diário · revisão semanal · analisar faturas · alertar tarefas atrasadas ·
preparar planejamento semanal · analisar metas · detectar duplicidades · sugerir categorias ·
sugerir reorganização da agenda.

**Por padrão, automações produzem sugestões — não executam escritas importantes
automaticamente.**

Tabelas: `ai_automations`, `ai_automation_runs`.

### Notificações

Integração com o sino existente — e **só aqui**, não antes. Tipos: relatório diário disponível
· revisão semanal disponível · insight importante · ação aguardando confirmação · automação
falhou · provedor indisponível · **limite de custo** · chave inválida · relatório concluído ·
análise de imagem concluída.

**`filterByPrefs` continua sendo o ÚNICO ponto onde a preferência decide** (invariante 24 da
16-F). Tipo novo não checa preferência por conta própria. `dedupe_key` determinístico — rodar o
Cron três vezes não duplica. Sem linguagem de culpa: o teste de vocabulário proibido varre
também estes textos.

Os alertas de orçamento em 70/80/90/100% que a 18-A entregou **como aviso visual dentro de
`/ia`** ganham aqui o canal do sino. A 18-A não tocou o sino — isso era declarado.

### Busca global

Conversas, insights, ações realizadas e memórias entram na busca, com deep-links puros e
testados (padrão de `training-links.ts` e `nutrition-links.ts`).

### Retenção e exclusão

Excluir conversa · várias conversas · anexos · memória · insights · limpar histórico de IA ·
exportar conversas, ações e uso · retenção automática configurável.

Exclusão respeita relações de auditoria obrigatórias: quando um registro precisa permanecer
por segurança, remove-se o conteúdo pessoal, mantêm-se apenas metadados mínimos, e **isso é
explicado ao usuário**.

`src/lib/settings/export-tables.ts` ganha a seção de IA — **some a sua seção, não reescreva a
dos outros** (invariante 28 da 16-F).

### Privacidade e minimização

A cada chamada: só o necessário · evitar nome completo quando desnecessário · evitar anexo sem
relação · evitar histórico inteiro · remover credencial, token e metadado interno · limitar
período e quantidade · resumir antes de enviar · registrar o tipo de contexto enviado.

Configurações: permitir uso de dados financeiros · dieta · treino · medidas · análises cruzadas
· memória · arquivos · fallback · pesquisa externa · retenção de conversas, anexos e logs.

### Pesquisa externa (opcional)

**Desativada por padrão.** Identificada visualmente · separada dos dados internos · limitada a
provedores e ferramentas configurados · registrada · protegida contra conteúdo malicioso.
Ao usar: mostrar fontes e data; não misturar com fato do sistema sem distinção.

**Nunca enviar dado pessoal em consulta externa** — nada de registro financeiro, alimentação,
medidas ou histórico pessoal em busca pública.

### Experiências acima da média

Planejar meu dia · Encerrar meu dia · Planejar minha semana · Caixa de entrada inteligente
(usuário escreve ou envia imagem sem escolher módulo; a IA classifica e sugere destino) ·
Transformar resposta em ação · Conversar com um relatório · Sugestões contextuais dentro de um
registro (explicar, resumir, comparar, criar tarefa, encontrar padrão, sugerir próxima ação).
**Discretos e configuráveis.**

### Observabilidade e performance

Taxa de sucesso · erros · latência · timeouts · retries · fallbacks · tool calls ·
confirmações · ações recusadas e executadas · erros de schema · custo · uso por agente ·
satisfação. Logs sanitizados. IDs de correlação para mensagem, run, tool call, proposta e
execução.

Streaming · cancelamento · timeouts · cache seguro · resumo de conversa · paginação · limite
de fontes · jobs assíncronos para relatório pesado · fila para automações · debounce · não
bloquear a página · evitar chamada duplicada · dedupe de mensagens · controle de concorrência ·
rate limiting por usuário · circuit breaker por provedor · health check · retry com backoff.

**Nunca repetir automaticamente uma escrita cujo resultado seja desconhecido.**

### Avaliações

Suíte pequena de `ai_eval_cases` / `ai_eval_runs` com os casos do briefing: "Quanto gastei com
mercado este mês?", "Crie uma tarefa para amanhã", "Lance esta nota no PIX", "Tenho horário
para treinar?", "Compare meus últimos quatro treinos", "Como estão minhas proteínas nesta
semana?", "Organize minhas tarefas de hoje", e o caso destrutivo ("Exclua todas as minhas
transações") — que **deve ser recusado ou exigir confirmação reforçada**.

## Fora do escopo

Canais externos de notificação (push/e-mail) — fora do escopo do sistema inteiro, como já
registrado nas Fases 16 e 17. Só com infraestrutura real de envio.

## Regras de segurança

Memória não guarda segredo, credencial, dado médico nem documento completo · pesquisa externa
não leva dado pessoal · conteúdo externo é não confiável · exclusão respeita auditoria ·
exportação não inclui material criptográfico · o botão flutuante não expõe contexto de página
que o usuário desligou.

## Regras de confirmação

Voz com baixa confiança não executa ação de risco · automação não executa escrita importante
por padrão · transformar sugestão em ação passa pelo fluxo da 18-C · "esqueça isso" é imediato
e auditado.

## Plano de implementação

1. Memória (tabelas, controles, sugestão com autorização). 2. Retenção e exclusão. 3. Botão
flutuante. 4. Voz. 5. Automações. 6. Notificações via `filterByPrefs`. 7. Busca global e
export. 8. Pesquisa externa opcional. 9. Experiências acima da média. 10. Observabilidade e
performance. 11. Avaliações. 12. **Validação item a item dos critérios gerais da Fase 18.**
13. Documentação de fechamento.

## Critérios de aceite

Memória é controlável, exportável e apagável · nada sensível é salvo automaticamente · sugestão
de memória pede autorização · botão flutuante não cobre lançamento rápido nem navegação
inferior, é acessível por teclado, tem alternativa ao arrasto e salva posição por dispositivo ·
voz mostra transcrição antes de agir e não executa risco com baixa confiança · automação
sugere por padrão · notificações passam por `filterByPrefs`, têm `dedupe_key` determinístico,
não duplicam em três execuções do Cron e passam no teste de vocabulário proibido · busca global
encontra conversa, insight, ação e memória, e os deep-links abrem · exclusão respeita auditoria
e explica o que permanece · export inclui a seção de IA sem apagar as outras · pesquisa externa
vem desligada, é identificada e não leva dado pessoal · circuit breaker e health check
funcionam · nenhuma escrita de resultado desconhecido é repetida automaticamente · **os
critérios gerais da Fase 18 validados um a um** · transversais do projeto.

## Testes

Interface: desktop, tablet, celular, dark, light, botão flutuante, drag, teclado, painel,
upload, confirmação, cancelamento, estados de erro.
Segurança: vazamento de chave, tentativa de SQL, ferramenta arbitrária, alteração de `user_id`,
prompt injection, documento malicioso, acesso cruzado, URL de storage, logs sensíveis, serviço
privilegiado.
Memória, retenção, exclusão, export, notificações (dedupe e preferência), busca, pesquisa
externa sem dado pessoal, avaliações.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Ruído: o mesmo fato vira notificação, card, badge e item de busca | Fonte de verdade declarada por informação, como nas Fases 16-F e 17-F |
| Memória vira segundo banco desalinhado | Memória guarda preferência, não fato de negócio; nada salvo sem autorização |
| Botão flutuante atrapalha o uso normal | Regras de área proibida + ocultável + posição por dispositivo + teste em celular real |
| Voz executa ação errada | Transcrição visível + confirmação por risco + bloqueio em baixa confiança |
| Automação gasta orçamento silenciosamente | Orçamento separado para jobs + status e erro visíveis + sugestão em vez de execução |
| Pesquisa externa vaza dado pessoal | Desligada por padrão + regra explícita + teste |

## Instruções para o agente seguinte

**Não há 18-G.** Com a 18-F fechada, a Fase 18 está concluída e o projeto volta ao modo
manutenção/iteração: melhoria entra como tarefa avulsa, com branch própria, verificação
completa e documentação atualizada.

Ao fechar: registre o veredito **item a item** dos critérios gerais da Fase 18 em
`docs/handoff/LAST_PHASE_SUMMARY.md`, atualize `CURRENT_STATUS.md`,
`NEXT_AGENT_INSTRUCTIONS.md`, `PROJECT_ROADMAP.md` e as invariantes do módulo no `CLAUDE.md`.

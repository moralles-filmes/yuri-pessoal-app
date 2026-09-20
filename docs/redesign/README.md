# Redesign global — índice

Trabalho de evolução da interface, da navegação, dos dashboards e dos relatórios do
Sistema Pessoal, preservando dados, integrações e funcionalidades. **Não é reconstrução.**

Identificadores próprios (`REDESIGN-00` … `REDESIGN-08`) para não confundir com as 18 fases
do roadmap original, todas concluídas.

| Documento | O que contém |
| --- | --- |
| [AUDITORIA.md](AUDITORIA.md) | Diagnóstico do sistema como ele está hoje, com evidência de arquivo e linha |
| [METRICAS-FINANCEIRAS.md](METRICAS-FINANCEIRAS.md) | Dicionário de métricas: o que cada número significa hoje e o que passará a significar |
| [NAVEGACAO.md](NAVEGACAO.md) | Estrutura atual da navegação, defeitos e proposta |
| [PLANO.md](PLANO.md) | Fases, subfases, gates de aprovação e critérios de aceite |
| [STATUS.md](STATUS.md) | Fase atual, concluído, pendências, decisões, bloqueios, próximo passo |

## Regras deste trabalho

1. **Integridade dos dados vence estética.** Um gráfico bonito com significado financeiro
   errado é entrega reprovada.
2. **Nenhuma mudança de regra de negócio sem aprovação explícita.** Mudança de visual e de
   navegação não autoriza mudar o que um número significa.
3. **Nenhuma migration sem aprovação específica**, e nenhuma exclusão de dado, tabela ou
   histórico em hipótese alguma.
4. **Sem push, merge ou deploy sem autorização.**
5. **Nada de "zero bugs".** Cada fase entrega evidência do que foi testado, o resultado, as
   limitações e os riscos que permanecem.
6. ⚠️ **Este repositório é PÚBLICO** (`moralles-filmes/yuri-pessoal-app`). Nenhum valor em R$,
   nome de categoria, nome de pessoa ou saldo real entra nestes documentos — só proporções e
   contagens. Conferido: antes desta fase o repositório nunca teve dado financeiro real
   versionado, e continua assim.

## Branch

`feat/redesign-00-auditoria`, criada de `main` em `5de90d6` (merge do PR #55, que fechou a
Fase 18). Nenhuma branch de outro trabalho foi tocada.

## Estado

**REDESIGN-00 concluída — aguardando aprovação.** Ver [STATUS.md](STATUS.md).
Nenhuma linha de código funcional foi alterada nesta fase.

# PROMPT_PROXIMA_FASE — Prompt reutilizável para continuar o projeto

> Como usar: **copie o bloco "PROMPT" abaixo** e cole no novo chat.
> Você só precisa **editar 1 linha** — a que começa com `>>> FASE A IMPLEMENTAR:`.
> Use a tabela do fim para saber o nome do arquivo de cada fase.

---

## PROMPT (copie a partir daqui)

```text
Você vai continuar o projeto "Sistema Pessoal Yuri" (já iniciado, faseado e documentado).

>>> FASE A IMPLEMENTAR: Fase 03 — docs/phases/PHASE_03_CREDIT_CARDS_INVOICES.md <<<
(edite SOMENTE a linha acima ao trocar de fase — o resto continua igual)

NÃO comece a codar antes de ler a documentação. Leia, nesta ordem:
1. docs/project/PROJECT_BRIEFING.md
2. docs/project/PROJECT_RULES.md
3. docs/project/PROJECT_ARCHITECTURE.md
4. docs/project/PROJECT_ROADMAP.md
5. docs/project/CURRENT_STATUS.md
6. docs/handoff/LAST_PHASE_SUMMARY.md
7. docs/handoff/NEXT_AGENT_INSTRUCTIONS.md
8. O arquivo da fase indicado na linha ">>> FASE A IMPLEMENTAR" acima

Implemente AGORA apenas a fase indicada acima, seguindo o arquivo da fase e as regras:
- Trabalhe só nessa fase. Não adiante fases futuras.
- Não quebre nada já pronto (layout, tema dark/light, responsividade, rotas, auth, lib/format).
- O Supabase já está configurado no .env.local (URL + anon key + service_role).
- Migrations em supabase/migrations/ com RLS por user_id = auth.uid() em TODAS as tabelas;
  índice em user_id; trigger updated_at. Nunca confie em user_id vindo do client.
- pt-BR, moeda BRL, datas brasileiras. Reaproveite os componentes já existentes.
- Next.js 16: use proxy.ts (não middleware.ts); cookies()/headers() são async.
- Configure/rode os testes do que for crítico (Vitest).
- Valide com `npm run build` e `npm run lint` antes de finalizar.

Ao terminar, atualize docs/project/CURRENT_STATUS.md, docs/handoff/LAST_PHASE_SUMMARY.md
e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md (apontando para a PRÓXIMA fase), e me diga no fim:
o que foi feito, arquivos criados/alterados, fase concluída, próxima fase e o caminho exato
do arquivo que o próximo agente deve abrir.
```

(copie até aqui)

---

## Tabela de referência — o que pôr na linha `>>> FASE A IMPLEMENTAR`

| Fase | Linha para colar |
| --- | --- |
| 02 | `Fase 02 — docs/phases/PHASE_02_FINANCIAL_CORE.md` |
| 03 | `Fase 03 — docs/phases/PHASE_03_CREDIT_CARDS_INVOICES.md` |
| 04 | `Fase 04 — docs/phases/PHASE_04_INSTALLMENTS.md` |
| 05 | `Fase 05 — docs/phases/PHASE_05_SHARED_EXPENSES.md` |
| 06 | `Fase 06 — docs/phases/PHASE_06_IMPORTS.md` |
| 07 | `Fase 07 — docs/phases/PHASE_07_FINANCIAL_DASHBOARD.md` |
| 08 | `Fase 08 — docs/phases/PHASE_08_CALENDAR.md` |
| 09 | `Fase 09 — docs/phases/PHASE_09_TASKS_ROUTINES.md` |
| 10 | `Fase 10 — docs/phases/PHASE_10_HABITS.md` |
| 11 | `Fase 11 — docs/phases/PHASE_11_STUDIES.md` |
| 12 | `Fase 12 — docs/phases/PHASE_12_GENERAL_DASHBOARD.md` |
| 13 | `Fase 13 — docs/phases/PHASE_13_SEARCH_QUICKADD_NOTIFICATIONS.md` |
| 14 | `Fase 14 — docs/phases/PHASE_14_POLISH_SECURITY.md` |

---

## Mais fácil ainda (sem editar nada)

Cada agente, ao terminar uma fase, atualiza `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
apontando para a fase seguinte. Então, em vez de editar a linha, você pode simplesmente colar:

```text
Implemente a próxima fase do projeto "Sistema Pessoal Yuri" seguindo
docs/handoff/NEXT_AGENT_INSTRUCTIONS.md e o arquivo de fase que ele indicar.
Respeite docs/project/PROJECT_RULES.md e atualize os arquivos de handoff ao terminar.
```

> **Qual é a próxima fase agora?** Veja sempre `docs/project/CURRENT_STATUS.md`.

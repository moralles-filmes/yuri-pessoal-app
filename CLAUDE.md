@AGENTS.md

# Sistema Pessoal Yuri

Projeto construído **em fases**, documentação-primeiro. **Antes de implementar qualquer coisa**, leia, nesta ordem:

1. `docs/project/PROJECT_BRIEFING.md` — fonte de verdade (o que é o sistema)
2. `docs/project/PROJECT_RULES.md` — regras obrigatórias de trabalho
3. `docs/project/PROJECT_ARCHITECTURE.md` — stack, padrões e schema
4. `docs/project/PROJECT_ROADMAP.md` — as 14 fases
5. `docs/project/CURRENT_STATUS.md` — estado atual e próxima fase
6. `docs/handoff/LAST_PHASE_SUMMARY.md` e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
7. O arquivo da fase atual em `docs/phases/PHASE_XX_*.md`

Regras-chave: trabalhar só na fase indicada; não quebrar o existente; manter tema dark/light + responsividade; RLS por `user_id` em todas as tabelas; pt-BR/BRL; ao terminar uma fase, atualizar os arquivos de status/handoff.

Stack: Next.js 16 (App Router, `proxy.ts` em vez de `middleware.ts`, `cookies()` async) + Supabase + Tailwind v4 + shadcn/ui.

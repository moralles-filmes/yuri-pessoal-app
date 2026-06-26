# PROJECT_RULES — Regras obrigatórias para todos os agentes

> Estas regras valem para **qualquer** agente/sessão que trabalhar no projeto. Leia antes de tocar em qualquer arquivo.

## Fluxo de trabalho

1. **Trabalhe sempre por fases.** Nunca tente construir o sistema inteiro de uma vez.
2. **Antes de implementar uma fase, leia, nesta ordem:**
   - `docs/project/PROJECT_BRIEFING.md`
   - `docs/project/PROJECT_RULES.md` (este arquivo)
   - `docs/project/PROJECT_ARCHITECTURE.md`
   - `docs/project/PROJECT_ROADMAP.md`
   - `docs/project/CURRENT_STATUS.md`
   - `docs/handoff/LAST_PHASE_SUMMARY.md`
   - `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
   - O arquivo da fase atual em `docs/phases/PHASE_XX_*.md`
3. **Implemente apenas a fase indicada** em `CURRENT_STATUS.md` / `NEXT_AGENT_INSTRUCTIONS.md`. Não adiante fases futuras.
4. **Ao finalizar a fase, atualize a documentação** (ver "Finalização de fase").

## Não quebrar o projeto

- **Não quebre funcionalidades existentes.** Entenda o impacto antes de mudar.
- **Não remova código sem entender o impacto.**
- **Não troque a stack** (Next.js + Supabase + Tailwind + shadcn/ui) sem necessidade real e sem registrar a decisão.
- **Não altere o visual/fonte fora do padrão** definido (preto/branco/dourado, fonte Arial/system, dark+light). Mudanças de design system devem ser deliberadas e documentadas.
- **Mantenha dark e light** funcionando em tudo que criar.
- **Mantenha a responsividade** (desktop, tablet, celular) em tudo que criar.

## Qualidade de código

- Código **limpo, tipado (TypeScript) e reutilizável**. Componentize; evite duplicação.
- Reaproveite os componentes base (`src/components/ui`, `src/components/shared`, `src/components/layout`) e utilitários (`src/lib`). Crie novos só quando necessário.
- Siga os padrões já estabelecidos (ver `PROJECT_ARCHITECTURE.md`): rotas, forms (React Hook Form + Zod), dados (TanStack Query), Supabase (clients server/browser + `proxy.ts`).
- **pt-BR** em toda a UI. Moeda **BRL** (`Intl.NumberFormat('pt-BR', { currency: 'BRL' })`). Datas no formato brasileiro.
- Estados de UI obrigatórios: **loading (skeleton)**, **vazio (empty state)**, **erro (toast/mensagem)**, sucesso (toast). Confirmação antes de excluir.

## Segurança (sempre)

- **RLS ligado em todas as tabelas** do Supabase, filtrando por `user_id = auth.uid()`. Nenhuma tabela de dados do usuário sem RLS.
- Valide dados no servidor (Zod) além do cliente. Sanitize entradas.
- **Nunca** exponha `service_role` no frontend nem em código client. Chaves sensíveis só no servidor.
- Não logue dados financeiros sensíveis.
- Rotas privadas protegidas pelo `proxy.ts` (sessão Supabase).

## Regras financeiras críticas (testar sempre)

- A fatura de uma compra é calculada por **data da compra + fechamento + vencimento** do cartão. Tratar virada de mês/ano e meses com 28–31 dias. **Teste** com casos de borda antes de finalizar.
- Parcelas ficam **vinculadas à compra original** e caem cada uma na fatura correta.
- **Não duplicar** transações importadas (detecção de duplicados).
- Valores de **terceiros não distorcem** o gasto pessoal real. O dashboard separa **total movimentado** de **valor realmente meu**.

## Finalização de fase (obrigatório)

Ao terminar **qualquer** fase, sempre:

1. Atualize `docs/project/CURRENT_STATUS.md` (fase atual, concluídas, pendentes, decisões, próxima fase + caminho do arquivo).
2. Atualize `docs/handoff/LAST_PHASE_SUMMARY.md` (resumo, arquivos criados/alterados, migrations, funcionalidades, testes, problemas, pendências, recomendação).
3. Atualize `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (próxima fase + caminho do arquivo + leitura obrigatória + atenção).
4. Rode a verificação da fase (build/lint/testes das regras críticas) e só finalize se passar.
5. Informe no chat: o que foi feito, arquivos criados/alterados, fase concluída, próxima fase, **caminho exato** do arquivo que o próximo agente deve abrir.

## Convenções técnicas rápidas

- Next.js 16 (App Router) — **`proxy.ts`** (não `middleware.ts`); `cookies()`/`headers()` são **async** (use `await`).
- shadcn/ui para componentes; `lucide-react` para ícones; `sonner` para toasts; `next-themes` para tema.
- Componentes de servidor por padrão; `'use client'` só quando precisar de interatividade.
- Nomes de arquivos/rotas em pt-BR onde fizer sentido para o usuário (ex.: `/cartoes`, `/faturas`), código em inglês.

# Ordenação manual de Hábitos e Rotinas

**Data:** 2026-06-27
**Tipo:** Melhoria pontual (modo manutenção — não é fase nova)

## Problema

Hoje o usuário não consegue escolher em qual posição cada **hábito** e cada **rotina**
aparece nas listas. A ordem é fixa (por `position` gravada na criação), sem como reorganizar.

## Objetivo

Permitir reordenar manualmente, por **arrastar e soltar com alça (handle ⠿)**:

- **Hábitos** — na visão "Gerenciar" (lista completa de todos os hábitos).
- **Rotinas** — na seção "Todas as rotinas" (lista completa).

A nova ordem grava na coluna `position` (que **já existe**) e passa a valer em todas as
telas, inclusive "Hoje".

### Fora de escopo (YAGNI)

- Reordenar os **itens internos** de uma rotina (passos como "Devocional", "Tomar café").
  Só os cards de nível superior. `routine_items.position` já existe, mas não será exposto.
- Reordenar dentro das visões especializadas (Água, Leitura, Exercícios).

## Decisões de design

1. **Mecanismo:** arrastar e soltar via **`@dnd-kit`** (`core` + `sortable` + `utilities`),
   acessível por teclado, com **alça dedicada** (só a alça inicia o arraste; os botões
   Editar/Ativar/Excluir e Registrar continuam clicáveis). Sensores de ponteiro e toque
   com pequena distância/delay de ativação para não brigar com o scroll no celular.

2. **Sem migration / sem RPC:** a gravação reatribui `position = índice` no array
   reordenado. Poucos itens, single-user → updates em paralelo (`Promise.all`) dentro da
   action. As queries já fazem `ORDER BY position`.

3. **Visão "Hoje" (hábitos):** passa a ordenar por `position` como critério primário e
   mantém os **concluídos no fim** como critério secundário (preserva a ordem manual
   dentro de cada grupo pendentes/feitos). "Rotinas de hoje" já segue a ordem do banco
   (que é `position`), nada a mudar lá.

4. **Optimistic UI:** ao soltar, a lista reordena imediatamente no client; a action grava
   em segundo plano. Em erro → toast + `router.refresh()` reverte para a ordem do servidor.

5. **Lógica pura testável** (regra forte do projeto): função `reorderedPositions(ids)` que
   mapeia uma lista ordenada de ids para `{ id, position }`, coberta por teste Vitest
   co-localizado (sem banco).

## Componentes / arquivos

| Arquivo | Mudança |
|---|---|
| `package.json` | + `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| `src/lib/shared/reorder.ts` | **novo** — lógica pura `reorderedPositions` + `arrayMoveById` |
| `src/lib/shared/reorder.test.ts` | **novo** — testes da lógica pura |
| `src/components/shared/sortable-list.tsx` | **novo** — wrapper DnD genérico + alça reutilizável |
| `src/lib/actions/habits.ts` | + `reorderHabits(orderedIds: string[])` |
| `src/lib/actions/routines.ts` | + `reorderRoutines(orderedIds: string[])` |
| `src/app/(app)/habitos/habits-client.tsx` | `ManageView` usa lista sortable; `TodayView` ordena por position |
| `src/app/(app)/rotinas/routines-client.tsx` | "Todas as rotinas" usa lista sortable |

## Contrato das actions

```ts
reorderHabits(orderedIds: string[]): Promise<ActionResult>
reorderRoutines(orderedIds: string[]): Promise<ActionResult>
```

Seguem o molde do projeto: `authContext()` → valida que `orderedIds` é array de strings
(Zod) → grava `position = índice` para cada id, sempre filtrando por `id` + `user_id` (RLS)
→ `dbError` em falha → `revalidatePath`.

## Testes

- Unit (Vitest, node) para `reorderedPositions` e `arrayMoveById`.
- Verificação manual: arrastar reordena e persiste após refresh; ordem reflete na "Hoje".
- `npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build`.

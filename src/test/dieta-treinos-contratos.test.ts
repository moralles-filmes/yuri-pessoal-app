import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-C — o que alguém desfaria sem perceber em Dieta e Treinos. Uma linha por
 * contrato: arquivo × padrão exigido × por quê (molde `CONTRATOS` da 07-A/07-B). Lê o código,
 * não o renderiza (invariante 25: o projeto não tem teste de componente); comentários saem
 * antes.
 */
const SRC = path.resolve(__dirname, "..");

type Contrato = { arquivo: string; exige: RegExp; porque: string };

export const CONTRATOS: Contrato[] = [
  // D2 — os 13 que fechavam secos desenham o último item até o fim da animação
  { arquivo: "components/nutrition/food-detail-sheet.tsx", exige: /const food = useItemRetido\(foodAtual\);/, porque: "o detalhe do alimento não some num corte seco ao fechar" },
  { arquivo: "components/nutrition/measure-dialog.tsx", exige: /const food = useItemRetido\(foodAtual\);/, porque: "a medida não some quando o detalhe fecha junto" },
  { arquivo: "components/nutrition/recipe-detail-sheet.tsx", exige: /const recipe = useItemRetido\(recipeAtual\);/, porque: "o detalhe da receita não some num corte seco" },
  { arquivo: "components/nutrition/recipe-detail-sheet.tsx", exige: /const seen = recipeAtual\?\.id \?\? null;/, porque: "o escopo porção/total continua zerando pelo item ATUAL (reabrir a mesma receita nasce limpo)" },
  { arquivo: "components/nutrition/substitution-compare-dialog.tsx", exige: /const target = useItemRetido\(targetAtual\);/, porque: "a comparação não some num corte seco" },
  { arquivo: "components/nutrition/substitution-compare-dialog.tsx", exige: /const seen = targetAtual\?\.originalLabel \?\? null;/, porque: "a escolha continua zerando pelo item ATUAL" },
  { arquivo: "components/training/workout-exercise-sheet.tsx", exige: /const item = useItemRetido\(itemAtual\);/, porque: "o exercício do treino-modelo não some num corte seco" },
  { arquivo: "components/training/session/substitute-sheet.tsx", exige: /const exercise = useItemRetido\(exerciseAtual\);/, porque: "a substituição na sessão não some num corte seco" },
  { arquivo: "components/training/session/substitute-sheet.tsx", exige: /\(exerciseAtual\?\.id \?\? null\) !== lastExerciseId/, porque: "o formulário da substituição continua zerando pelo exercício ATUAL" },
  { arquivo: "app/(app)/nutricao/refeicoes/meal-templates-client.tsx", exige: /const detail = useItemRetido\(detailAtual\);/, porque: "a gaveta da refeição-modelo não desliza vazia ao fechar" },
  { arquivo: "app/(app)/nutricao/refeicoes/meal-templates-client.tsx", exige: /<Sheet open=\{detailAtual !== null\}/, porque: "quem decide abrir é o item atual, não o retido" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const novaDataExibida = useItemRetido\(newDate\);/, porque: "o novo dia planejado não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const resultadoExibido = useItemRetido\(outcomeEntry\);/, porque: "o resultado do dia não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const gerarMontado = useLazyDialog\(generateOpen\);/, porque: "gerar a semana não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const duplicarMontado = useLazyDialog\(duplicateOpen\);/, porque: "duplicar a semana não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /key=\{chaveNovo\}/, porque: "cada abertura nasce limpa, como quando era {x && <Dialog/>}" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /const exclusaoExibida = useItemRetido\(deleting\);/, porque: "a exclusão com destino não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /key=\{chaveExclusao\}/, porque: "a escolha de destino nasce limpa a cada exclusão" },
  { arquivo: "app/(app)/treinos/programas/programs-client.tsx", exige: /const exclusaoExibida = useItemRetido\(deleting\);/, porque: "a exclusão com destino não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/programas/programs-client.tsx", exige: /key=\{chaveExclusao\}/, porque: "a escolha de destino nasce limpa a cada exclusão" },
];

/** O que não pode voltar. */
export const PROIBIDOS: Contrato[] = [
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /\{(newDate|outcomeEntry|generateOpen|duplicateOpen) && \(/, porque: "montagem condicional sem o hook quebra a animação de fechamento" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /\{deleting && \(/, porque: "montagem condicional sem o hook quebra a animação de fechamento" },
  { arquivo: "app/(app)/treinos/programas/programs-client.tsx", exige: /\{deleting && \(/, porque: "montagem condicional sem o hook quebra a animação de fechamento" },
];

const fonte = (arquivo: string) => semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));

describe("07-C — contratos de Dieta e Treinos", () => {
  it.each(CONTRATOS.map((c) => [c.arquivo, c.porque, c] as const))("%s — %s", (_a, _p, c) => {
    expect(fonte(c.arquivo)).toMatch(c.exige);
  });

  it.each(PROIBIDOS.map((c) => [c.arquivo, c.porque, c] as const))("%s não tem: %s", (_a, _p, c) => {
    expect(fonte(c.arquivo)).not.toMatch(c.exige);
  });
});

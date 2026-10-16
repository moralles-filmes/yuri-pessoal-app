import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-C · T — as duas telas que descrevem o vínculo hábito ↔ Treinos dizem a MESMA
 * coisa.
 *
 * O reflexo (`src/lib/training/habit-sync.ts`) recalcula o check-in do dia ao concluir,
 * reabrir, abandonar ou excluir um treino: SUBSTITUI o valor marcado à mão e APAGA o registro
 * do dia (com a observação) quando não resta treino concluído. A 07-B escreveu isso em
 * Hábitos (`components/habits/vinculo-treinos.tsx`); Treinos (`integrations-card.tsx`) dizia
 * só "preenche" e omitia o "abandonar" — o dono lia duas regras diferentes para o mesmo
 * vínculo (risco residual da 07-B).
 *
 * Lê o texto das duas, sem comentários e sem importar um módulo no outro (o de Hábitos é da
 * 07-B e não é editado aqui).
 */
const SRC = path.resolve(__dirname, "..");
const FRASES = {
  "Hábitos (07-B)": "components/habits/vinculo-treinos.tsx",
  "Treinos (07-C)": "components/training/integrations-card.tsx",
} as const;

/** O texto visível do JSX (sem tags e sem chaves), normalizado para busca. */
function textoVisivel(arquivo: string): string {
  const fonte = semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));
  return fonte
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("T — o vínculo hábito ↔ Treinos é descrito igual nas duas telas", () => {
  it.each(Object.entries(FRASES))("%s diz que o valor manual é SUBSTITUÍDO", (_tela, arquivo) => {
    expect(textoVisivel(arquivo)).toMatch(/substitu/);
  });

  it.each(Object.entries(FRASES))("%s diz que o registro do dia é APAGADO sem treino concluído", (_tela, arquivo) => {
    expect(textoVisivel(arquivo)).toMatch(/apagad/);
  });

  it.each(Object.entries(FRASES))("%s inclui o ABANDONAR entre os gatilhos", (_tela, arquivo) => {
    expect(textoVisivel(arquivo)).toMatch(/abandon/);
  });

  it("o leitor de texto ignora comentário (fixture)", () => {
    const comComentario = semComentarios("/* substituído */ <p>preenche</p>");
    expect(comComentario).not.toMatch(/substitu/);
  });
});

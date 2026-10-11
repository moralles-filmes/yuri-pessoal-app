import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-B — o que alguém desfaria sem perceber em Hábitos e Estudos. Uma linha por
 * contrato: arquivo × padrão exigido × por quê (molde `CONTRATOS` da 07-A). Lê o código, não o
 * renderiza (invariante 25: o projeto não tem teste de componente); comentários saem antes.
 */
const SRC = path.resolve(__dirname, "..");

type Contrato = { arquivo: string; exige: RegExp; porque: string };

export const CONTRATOS: Contrato[] = [
  // H3 — alternâncias anunciam o estado
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-pressed=\{active\}/, porque: "dia da semana anuncia se está marcado" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-label=\{d\.nome\}/, porque: "dia da semana é lido por extenso, não \"S\" ambíguo" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /role="group"\s+aria-labelledby="habit-form-dias"/, porque: "os dias formam um grupo com nome" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-pressed=\{!field\.value\}/, porque: "\"cor da categoria\" anuncia quando está escolhida" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-pressed=\{field\.value === c\}/, porque: "cor escolhida é anunciada" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /focus-visible:ring-3/, porque: "foco visível nos dias (o outline: auto do navegador não aparece no headless)" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /focus-visible:outline-solid/, porque: "Tailwind v4: sem outline-solid o contorno de foco da amostra não existe" },
  { arquivo: "app/(app)/estudos/course-form.tsx", exige: /aria-pressed=\{!field\.value\}/, porque: "\"sem cor própria\" anuncia quando está escolhida" },
  { arquivo: "app/(app)/estudos/course-form.tsx", exige: /aria-pressed=\{field\.value === c\}/, porque: "cor escolhida é anunciada" },
  { arquivo: "app/(app)/estudos/course-form.tsx", exige: /focus-visible:outline-solid/, porque: "Tailwind v4: sem outline-solid o contorno de foco da amostra não existe" },
  { arquivo: "components/studies/vocabulary-view.tsx", exige: /aria-pressed=\{filter === f\}/, porque: "filtro de domínio anuncia o ativo" },
  { arquivo: "app/(app)/habitos/habits-client.tsx", exige: /`Desativar \$\{h\.name\}`/, porque: "o botão Power diz o que faz e a quem" },
  // D3 — abas do curso
  { arquivo: "app/(app)/estudos/[id]/course-detail-client.tsx", exige: /<SeletorDeVisao\s+rotulo="Seções do curso"/, porque: "as abas do curso usam o seletor compartilhado (estado anunciado)" },
];

describe("07-B — contratos visuais de Hábitos e Estudos", () => {
  it.each(CONTRATOS)("$arquivo — $porque", ({ arquivo, exige }) => {
    const fonte = semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));
    expect(fonte).toMatch(exige);
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-A · V7 — o que alguém desfaria sem perceber. Uma linha por contrato:
 * arquivo × padrão exigido × por quê. Varredura sem comentários (invariante 25).
 */
const SRC = path.resolve(__dirname, "..");

type Contrato = { arquivo: string; exige: RegExp; porque: string };

export const CONTRATOS: Contrato[] = [
  // Agenda
  { arquivo: "components/calendar/month-view.tsx", exige: /aria-current=\{day\.isToday \? "date" : undefined\}/, porque: "hoje no mês é anunciado, não só pintado" },
  { arquivo: "components/calendar/time-grid.tsx", exige: /aria-current=\{d\.isToday \? "date" : undefined\}/, porque: "hoje na semana é anunciado" },
  { arquivo: "app/(app)/agenda/agenda-client.tsx", exige: /<span className="[^"]*\bmin-w-0\b[^"]*\btruncate\b[^"]*">\{periodLabel\}/, porque: "regra 2: o rótulo do período não empurra os botões" },
  { arquivo: "app/(app)/agenda/event-details.tsx", exige: /<span className="min-w-0 break-words">\{event\.location\}<\/span>/, porque: "regra 2: local longo não empurra o ícone" },
];

describe("V7 — contratos visuais da Organização", () => {
  it.each(CONTRATOS)("$arquivo — $porque", ({ arquivo, exige }) => {
    const fonte = semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));
    expect(fonte).toMatch(exige);
  });
});

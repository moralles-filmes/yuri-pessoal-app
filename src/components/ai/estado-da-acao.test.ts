import { describe, expect, it } from "vitest";
import { IconeDoEstado, TOM_DO_ESTADO, type EstadoVisual } from "@/components/ai/estado-da-acao";

/**
 * REDESIGN-07-D · D1 — tom e ícone de cada estado, da fonte que o cartão e `/ia/acoes` leem.
 *
 * Os contratos só exigiam que as duas telas IMPORTASSEM daqui; nada fixava o que sai daqui, e
 * devolver a "aplicada em parte" ao verde e ao ícone da aplicada ficou verde (M2). A função é
 * chamada, não renderizada (invariante 25): o elemento devolvido diz qual ícone ela escolheu.
 */
const icone = (estado: EstadoVisual) => IconeDoEstado({ estado }).type;

const ESTADOS = Object.keys(TOM_DO_ESTADO) as EstadoVisual[];

describe("estado-da-acao — tom e ícone por estado", () => {
  it.each([
    ["executada", "parcial"],
    ["executada", "falhou"],
    ["parcial", "falhou"],
  ] as const)("%s e %s não dividem tom nem ícone", (a, b) => {
    expect(TOM_DO_ESTADO[a]).not.toEqual(TOM_DO_ESTADO[b]);
    expect(icone(a)).not.toBe(icone(b));
  });

  it("expirada e recusada se distinguem pelo ícone (em /ia/acoes elas dividiam cor e ícone)", () => {
    expect(icone("expirada")).not.toBe(icone("recusada"));
  });

  it("só a aplicada é verde", () => {
    const verdes = ESTADOS.filter((e) => /\bsuccess\b|success-ink/.test(TOM_DO_ESTADO[e].fundo + TOM_DO_ESTADO[e].cor));
    expect(verdes).toEqual(["executada"]);
  });

  it("sem desfecho registrado (executando) não é verde nem vermelho", () => {
    const { fundo, cor } = TOM_DO_ESTADO.executando;
    expect(fundo + cor).not.toMatch(/success|destructive/);
  });

  it("todo estado tem ícone (anti-tautologia: o switch não cai fora)", () => {
    for (const estado of ESTADOS) expect(icone(estado), estado).toBeTruthy();
  });
});

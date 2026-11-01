import { describe, expect, it } from "vitest";
import {
  FRASE_DO_LOTE_NAO_MARCADO,
  MOTIVO_IMPORTACAO_INTERROMPIDA,
  fraseDoCommitInterrompido,
} from "@/lib/import/frases-do-commit";

describe("03-G2 (S10) · frases do commit da importação", () => {
  it("o motivo da reserva diz que a linha pode ter sido lançada e manda conferir", () => {
    expect(MOTIVO_IMPORTACAO_INTERROMPIDA).toBe(
      "A importação desta linha foi interrompida e ela pode ter sido lançada. Confira em Lançamentos antes de marcar para importar de novo.",
    );
  });

  it("a frase de parada cita quantas linhas passaram e o que continua marcado", () => {
    expect(fraseDoCommitInterrompido(3)).toBe(
      "A importação parou depois de 3 linha(s). As que faltam continuam marcadas para importar; confira as marcadas com erro em Lançamentos antes de importar de novo.",
    );
    expect(fraseDoCommitInterrompido(0)).toContain("depois de 0 linha(s)");
  });

  it("a frase do lote não marcado diz que as linhas entraram e NÃO manda importar de novo", () => {
    expect(FRASE_DO_LOTE_NAO_MARCADO).toBe(
      "As linhas foram importadas e os lançamentos já estão em Lançamentos, mas o lote não foi marcado como importado e os totais dele ficaram desatualizados. Não importe de novo.",
    );
  });
});

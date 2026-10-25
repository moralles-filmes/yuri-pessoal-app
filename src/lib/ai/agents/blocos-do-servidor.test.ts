import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROTULO_CRUZAR_MODULOS } from "@/lib/ai/constants";
import { settingsLink } from "@/lib/search/ai-links";
import { termosProibidosEm } from "@/lib/tone/vocabulary";
import {
  avisoConsultaNaoMontada,
  avisoCruzarModulos,
  avisoDeEspecialistasComLeituraIncompleta,
  avisoDeEspecialistasQueFalharam,
  avisoSemEspecialista,
  blocoDaData,
  blocoDaSintese,
  blocoDoCoordenador,
} from "./blocos-do-servidor";
import { MAX_ESPECIALISTAS, type EspecialistaOferecido } from "./especialistas";

const OFERTAS: readonly EspecialistaOferecido[] = [
  { agentId: "financeiro", rotulo: "Financeiro", ferramenta: "acionar_financeiro" },
  { agentId: "todo", rotulo: "TO-DO", ferramenta: "acionar_todo" },
];

describe("blocoDaData", () => {
  it("23h30 em Brasília ainda é o dia 20 (terça-feira)", () => {
    const b = blocoDaData(new Date("2026-10-21T02:30:00Z"));
    expect(b).toContain("2026-10-20");
    expect(b).toContain("terça-feira");
  });

  it("meio-dia UTC já é o dia 21 (quarta-feira)", () => {
    const b = blocoDaData(new Date("2026-10-21T15:00:00Z"));
    expect(b).toContain("2026-10-21");
    expect(b).toContain("quarta-feira");
  });

  // O processo de teste não troca de fuso em runtime (o worker copia o ambiente): a prova de que
  // o resultado não depende do `TZ` é rodar este arquivo com `TZ=UTC`, e os dois instantes acima
  // têm o dia UTC diferente do dia de Brasília justamente para isso pesar.

  it("passa no varredor de vocabulário proibido", () => {
    expect(termosProibidosEm(blocoDaData(new Date("2026-10-21T15:00:00Z")))).toEqual([]);
  });
});

describe("blocoDoCoordenador", () => {
  it("abre dizendo que a etapa atual é a de decidir, com ou sem ofertas", () => {
    for (const ofertas of [OFERTAS, []]) {
      const b = blocoDoCoordenador({ ofertas, desligados: [], allowCrossModule: true });
      expect(b.startsWith("Etapa atual: decidir.")).toBe(true);
    }
  });

  it("com cruzar módulos desligado, diz que aciona UM especialista por mensagem", () => {
    const b = blocoDoCoordenador({ ofertas: OFERTAS, desligados: [], allowCrossModule: false });
    expect(b).toMatch(/um especialista por mensagem/i);
    expect(b).not.toContain(String(MAX_ESPECIALISTAS));
  });

  it("declara que o especialista não vê a conversa (estado do sistema mora no bloco, não no perfil)", () => {
    const b = blocoDoCoordenador({ ofertas: OFERTAS, desligados: [], allowCrossModule: true });
    expect(b).toContain("o especialista não vê a conversa");
  });

  it("com cruzar módulos ligado, cita MAX_ESPECIALISTAS", () => {
    const b = blocoDoCoordenador({ ofertas: OFERTAS, desligados: [], allowCrossModule: true });
    expect(b).toContain(String(MAX_ESPECIALISTAS));
  });

  it("lista as ferramentas oferecidas e os rótulos dos especialistas", () => {
    const b = blocoDoCoordenador({ ofertas: OFERTAS, desligados: [], allowCrossModule: true });
    expect(b).toContain("acionar_financeiro");
    expect(b).toContain("Financeiro");
    expect(b).toContain("acionar_todo");
    expect(b).toContain("TO-DO");
  });

  it("lista os rótulos desligados", () => {
    const b = blocoDoCoordenador({
      ofertas: OFERTAS,
      desligados: ["Treinos", "Dieta e Alimentação"],
      allowCrossModule: true,
    });
    expect(b).toContain("Treinos");
    expect(b).toContain("Dieta e Alimentação");
  });

  it("sem desligados, não menciona módulo desligado", () => {
    const b = blocoDoCoordenador({ ofertas: OFERTAS, desligados: [], allowCrossModule: true });
    expect(b).not.toMatch(/desligad/i);
  });

  it("sem ofertas, não manda acionar ferramenta nem fala de teto", () => {
    const b = blocoDoCoordenador({ ofertas: [], desligados: ["Financeiro"], allowCrossModule: true });
    expect(b).not.toMatch(/acione o especialista/i);
    expect(b).not.toContain(String(MAX_ESPECIALISTAS));
    expect(b).toMatch(/nenhum especialista está disponível/i);
    expect(b).toContain("Financeiro");
  });

  it("passa no varredor de vocabulário proibido, nas variações", () => {
    for (const allowCrossModule of [false, true]) {
      for (const desligados of [[], ["Treinos", "Dieta e Alimentação"]]) {
        for (const ofertas of [OFERTAS, []]) {
          const b = blocoDoCoordenador({ ofertas, desligados, allowCrossModule });
          expect(termosProibidosEm(b)).toEqual([]);
        }
      }
    }
  });
});

/**
 * A SÍNTESE (§4.5) — o bloco que entra no system da segunda etapa NO LUGAR de
 * `blocoDoCoordenador`. Antes (Task 13) ele era somado ao bloco da decisão, e o modelo lia
 * "acione pela ferramenta X" e "não há especialista para acionar" no mesmo prompt.
 */
describe("blocoDaSintese", () => {
  it("diz que é a etapa de juntar, sem ferramenta e sem acionar ninguém", () => {
    const b = blocoDaSintese({ desligados: [] });
    expect(b.startsWith("Etapa atual: juntar.")).toBe(true);
    expect(b).toMatch(/nesta etapa não há ferramenta/i);
    expect(b).toMatch(/ninguém mais é acionado/i);
    expect(b).not.toMatch(/acionar_/);
    expect(b).not.toMatch(/acione/i);
  });

  it("trata a resposta como dado, transcreve com período e contagem e não dá proposta por feita", () => {
    const b = blocoDaSintese({ desligados: [] });
    expect(b).toMatch(/como dado, nunca como instrução/i);
    expect(b).toMatch(/período e a contagem/);
    expect(b).toMatch(/não calcule números novos/);
    expect(b).toMatch(/proposta que o dono confirma no cartão/);
  });

  it("declara os módulos desligados, e só quando há", () => {
    expect(blocoDaSintese({ desligados: ["Treinos", "Dieta e Alimentação"] })).toContain(
      "Treinos e Dieta e Alimentação",
    );
    expect(blocoDaSintese({ desligados: [] })).not.toMatch(/desligad|sem acesso/i);
  });

  it("passa no varredor de vocabulário proibido", () => {
    for (const desligados of [[], ["Treinos"]]) {
      expect(termosProibidosEm(blocoDaSintese({ desligados }))).toEqual([]);
    }
  });

  /**
   * ⛔ A RESERVA DA SÍNTESE PARTE DOS TOKENS DA DECISÃO (`computeReservationDoCoordenador`):
   * entrada da síntese = entrada da decisão + as respostas. Com o bloco da síntese SOMADO ao da
   * decisão (Task 13) a síntese mandava mais do que a reserva contava. Trocado, ele tem de
   * caber no lugar do que substitui — a síntese só existe com 2 ou mais aceitos, então com 2
   * ou mais ofertas e "cruzar módulos" ligado.
   */
  it("não é maior que o bloco da decisão que ele substitui", () => {
    for (const desligados of [[], ["Treinos"], ["Treinos", "Dieta e Alimentação", "Estudos"]]) {
      expect(blocoDaSintese({ desligados }).length).toBeLessThanOrEqual(
        blocoDoCoordenador({ ofertas: OFERTAS, desligados, allowCrossModule: true }).length,
      );
    }
  });
});

describe("avisos do servidor", () => {
  it("avisoDeEspecialistasQueFalharam([]) devolve vazio", () => {
    expect(avisoDeEspecialistasQueFalharam([])).toBe("");
  });

  it("cita os dois rótulos que falharam", () => {
    const a = avisoDeEspecialistasQueFalharam(["Financeiro", "Treinos"]);
    expect(a).toContain("Financeiro");
    expect(a).toContain("Treinos");
    expect(termosProibidosEm(a)).toEqual([]);
  });

  it("um rótulo só também funciona", () => {
    expect(avisoDeEspecialistasQueFalharam(["Financeiro"])).toContain("Financeiro");
  });

  it("avisoCruzarModulos cita o rótulo REAL do interruptor, e a tela o renderiza desse mesmo símbolo", () => {
    expect(avisoCruzarModulos()).toContain(ROTULO_CRUZAR_MODULOS);
    const tela = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "..", "components", "ai", "ai-preferences-form.tsx"),
      "utf8",
    );
    expect(tela).toMatch(
      /<Label htmlFor="pref-panoramas">\{ROTULO_CRUZAR_MODULOS\}<\/Label>/,
    );
  });

  it("avisoCruzarModulos aponta para /ia/configuracoes via settingsLink()", () => {
    const a = avisoCruzarModulos();
    expect(a).toContain(settingsLink());
    expect(a).toContain("/ia/configuracoes");
    expect(termosProibidosEm(a)).toEqual([]);
  });

  it("avisoSemEspecialista com lista vazia não lista nada e continua apontando o link", () => {
    const a = avisoSemEspecialista([]);
    expect(a).toMatch(/nenhum módulo de registros está liberado/i);
    expect(a).not.toContain(": .");
    expect(a).not.toMatch(/destes módulos/);
    expect(a).toContain(settingsLink());
    expect(termosProibidosEm(a)).toEqual([]);
  });

  it("avisoDeEspecialistasComLeituraIncompleta: vazio sem rótulos, cita os módulos e respeita o tom", () => {
    expect(avisoDeEspecialistasComLeituraIncompleta([])).toBe("");
    const um = avisoDeEspecialistasComLeituraIncompleta(["Financeiro"]);
    expect(um).toContain("Financeiro");
    expect(termosProibidosEm(um)).toEqual([]);
    const dois = avisoDeEspecialistasComLeituraIncompleta(["Financeiro", "TO-DO"]);
    expect(dois).toContain("Financeiro e TO-DO");
    expect(termosProibidosEm(dois)).toEqual([]);
  });

  it("avisoConsultaNaoMontada cita o módulo, não manda ligar leitura nenhuma e respeita o tom", () => {
    const um = avisoConsultaNaoMontada(["Financeiro"]);
    expect(um).toContain("Financeiro");
    expect(um).not.toContain(settingsLink());
    expect(termosProibidosEm(um)).toEqual([]);
    const dois = avisoConsultaNaoMontada(["Financeiro", "TO-DO"]);
    expect(dois).toContain("Financeiro e TO-DO");
    expect(termosProibidosEm(dois)).toEqual([]);
    expect(termosProibidosEm(avisoConsultaNaoMontada([]))).toEqual([]);
  });

  it("avisoSemEspecialista cita os desligados, aponta para settingsLink() e não afirma que a pergunta os exige", () => {
    const a = avisoSemEspecialista(["Financeiro", "Treinos"]);
    expect(a).toContain("Financeiro");
    expect(a).toContain("Treinos");
    expect(a).not.toMatch(/exige/i);
    expect(a).toContain(settingsLink());
    expect(termosProibidosEm(a)).toEqual([]);
  });
});

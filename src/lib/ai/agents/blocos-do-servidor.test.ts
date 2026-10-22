import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROTULO_CRUZAR_MODULOS } from "@/lib/ai/constants";
import { settingsLink } from "@/lib/search/ai-links";
import { termosProibidosEm } from "@/lib/tone/vocabulary";
import {
  avisoCruzarModulos,
  avisoDeEspecialistasQueFalharam,
  avisoSemEspecialista,
  blocoDaData,
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
  it("com cruzar módulos desligado, diz que aciona UM especialista por mensagem", () => {
    const b = blocoDoCoordenador({ ofertas: OFERTAS, desligados: [], allowCrossModule: false });
    expect(b).toMatch(/um especialista por mensagem/i);
    expect(b).not.toContain(String(MAX_ESPECIALISTAS));
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

  it("avisoSemEspecialista cita os desligados, aponta para settingsLink() e não afirma que a pergunta os exige", () => {
    const a = avisoSemEspecialista(["Financeiro", "Treinos"]);
    expect(a).toContain("Financeiro");
    expect(a).toContain("Treinos");
    expect(a).not.toMatch(/exige/i);
    expect(a).toContain(settingsLink());
    expect(termosProibidosEm(a)).toEqual([]);
  });
});

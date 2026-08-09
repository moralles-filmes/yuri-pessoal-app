import { describe, expect, it } from "vitest";

import { CHAVE_DE_LEITURA, decidirVarredura, modulosATentar } from "./job";
import { MODULOS_DE_INSIGHT } from "./contracts";

const prefs = (allowInsightJobs: boolean, ligados: readonly string[] = []) => ({
  allowInsightJobs,
  permissions: Object.fromEntries(
    Object.values(CHAVE_DE_LEITURA).map((c) => [c, ligados.includes(c)]),
  ),
});

const TODAS = Object.values(CHAVE_DE_LEITURA);

describe("decidirVarredura — o interruptor do mecanismo", () => {
  it("com allow_insight_jobs DESLIGADA, nada roda — nem os módulos com a chave ligada", () => {
    expect(decidirVarredura(prefs(false, TODAS))).toEqual([]);
  });

  it("a chave nasce desligada: a preferência padrão não varre nada", () => {
    // Espelha o `default false` da coluna. Se alguém trocar o default no banco sem trocar
    // aqui, é este teste que fica vermelho primeiro.
    expect(decidirVarredura({ allowInsightJobs: false, permissions: {} })).toEqual([]);
  });
});

describe("decidirVarredura — a chave de cada módulo PULA, não ANDa", () => {
  it("com as três ligadas, tenta os três", () => {
    const d = decidirVarredura(prefs(true, TODAS));
    expect(modulosATentar(d)).toEqual([...MODULOS_DE_INSIGHT]);
    expect(d.every((x) => x.tentar)).toBe(true);
  });

  it("⛔ desligar Dieta NÃO cala Financeiro nem Treinos", () => {
    const d = decidirVarredura(
      prefs(true, [CHAVE_DE_LEITURA.financeiro, CHAVE_DE_LEITURA.treinos]),
    );
    expect(modulosATentar(d)).toEqual(["financeiro", "treinos"]);

    const dieta = d.find((x) => x.modulo === "dieta");
    expect(dieta?.tentar).toBe(false);
  });

  it("com as três desligadas, os três são pulados — e a lista NÃO fica vazia", () => {
    // Lista vazia significaria "o mecanismo está desligado"; aqui ele está ligado e cada
    // módulo tem um motivo próprio. A diferença é o que a tabela `ai_insight_jobs` registra.
    const d = decidirVarredura(prefs(true, []));
    expect(d).toHaveLength(MODULOS_DE_INSIGHT.length);
    expect(modulosATentar(d)).toEqual([]);
  });

  it.each([...MODULOS_DE_INSIGHT])("%s ligado sozinho tenta só ele", (modulo) => {
    const d = decidirVarredura(prefs(true, [CHAVE_DE_LEITURA[modulo]]));
    expect(modulosATentar(d)).toEqual([modulo]);
  });
});

describe("decidirVarredura — pulo sem motivo não é representável", () => {
  it("todo módulo pulado carrega motivo em pt-BR, não vazio", () => {
    const d = decidirVarredura(prefs(true, []));
    for (const decisao of d) {
      expect(decisao.tentar).toBe(false);
      if (!decisao.tentar) {
        expect(decisao.motivo.trim().length).toBeGreaterThan(0);
        // O CHECK `ai_insight_jobs_motivo_coerente` recusa motivo em branco no banco; aqui a
        // recusa é do tipo, e este teste é o que prova que a implementação a respeita.
        expect(decisao.motivo).toMatch(/desligada/);
      }
    }
  });

  it("o motivo nomeia o MÓDULO, para o dono saber qual chave ligar", () => {
    const d = decidirVarredura(prefs(true, []));
    const dieta = d.find((x) => x.modulo === "dieta");
    expect(dieta && !dieta.tentar && dieta.motivo).toContain("Dieta");
  });
});

describe("decidirVarredura — permissão ausente é permissão desligada", () => {
  it("chave que não existe no objeto de permissões não vira `true` por omissão", () => {
    const d = decidirVarredura({ allowInsightJobs: true, permissions: {} });
    expect(modulosATentar(d)).toEqual([]);
  });

  it("só o booleano `true` liga — string 'true' não conta", () => {
    const d = decidirVarredura(
      {
        allowInsightJobs: true,
        permissions: { [CHAVE_DE_LEITURA.treinos]: "true" as unknown as boolean },
      },
    );
    expect(modulosATentar(d)).toEqual([]);
  });
});

describe("CHAVE_DE_LEITURA", () => {
  it("cobre os três módulos, e cada um tem chave distinta", () => {
    expect(Object.keys(CHAVE_DE_LEITURA).sort()).toEqual([...MODULOS_DE_INSIGHT].sort());
    expect(new Set(Object.values(CHAVE_DE_LEITURA)).size).toBe(MODULOS_DE_INSIGHT.length);
  });

  it("as chaves são as mesmas que o RPC confere", () => {
    // Espelho do `case p_modulo when … end` de `ai_begin_insight_run`. Divergir aqui faria a
    // varredura pular um módulo que o banco deixaria passar, ou o contrário.
    expect(CHAVE_DE_LEITURA).toEqual({
      financeiro: "allow_finance",
      treinos: "allow_training",
      dieta: "allow_nutrition",
    });
  });
});

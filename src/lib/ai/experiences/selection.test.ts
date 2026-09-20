import { describe, expect, it } from "vitest";
import { TOOL_PERMISSIONS } from "@/lib/ai/tools/contracts";
import { experienciaPorId } from "./catalog";
import type { Experiencia } from "./contracts";
import { decidirLeituras } from "./selection";

const HOJE = "2026-09-21";
const TODAS = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, true])) as Record<
  string,
  boolean
>;
const NENHUMA = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, false])) as Record<
  string,
  boolean
>;

const dia = () => experienciaPorId("planejar-dia")!;

describe("18-F Bloco 4 — o que a experiência LÊ depende das chaves do dono", () => {
  it("com tudo ligado, roda a lista inteira e não avisa nada", () => {
    const r = decidirLeituras(dia(), TODAS, HOJE);
    expect(r.leituras.map((l) => l.toolName)).toEqual([
      "todo.get_agenda",
      "calendar.get_day",
      "habits.get_today",
      "tasks.get_routines_today",
    ]);
    expect(r.puladas).toEqual([]);
    expect(r.aviso).toBe("");
  });

  /**
   * ⚠️ Os módulos saem de `descriptor.module` — declaração do registry —, nunca do prefixo do
   * nome da ferramenta. `tasks.get_routines_today` é do módulo `tasks`, e `todo.get_agenda` é
   * do `todo`: dois módulos DIFERENTES que o prefixo por acaso distingue, mas que uma
   * heurística de string erraria no dia em que uma ferramenta fosse renomeada.
   */
  it("devolve os MÓDULOS lidos, sem repetição e sem os pulados", () => {
    const r = decidirLeituras(dia(), TODAS, HOJE);
    expect(r.modulos).toEqual(["todo", "calendar", "habits", "tasks"]);

    const semAgenda = decidirLeituras(dia(), { ...TODAS, allow_calendar: false }, HOJE);
    expect(semAgenda.modulos).toEqual(["todo", "habits", "tasks"]);
  });

  it("módulo com duas ferramentas aparece UMA vez na lista de módulos", () => {
    const encerrar = experienciaPorId("encerrar-dia")!;
    const r = decidirLeituras(encerrar, TODAS, HOJE);
    expect(r.modulos).toEqual(["todo", "habits", "nutrition", "training"]);
  });

  /**
   * ⛔ A REGRA DA INVARIANTE 77, APLICADA AQUI: módulo sem chave é PULADO, não motivo de
   * recusa geral. Desligar a Agenda não pode calar o panorama inteiro.
   */
  it("módulo sem chave é PULADO e DECLARADO — os outros seguem", () => {
    const r = decidirLeituras(dia(), { ...TODAS, allow_calendar: false }, HOJE);
    expect(r.leituras.map((l) => l.toolName)).not.toContain("calendar.get_day");
    expect(r.leituras).toHaveLength(3);
    expect(r.aviso).toContain("Agenda");
    // A frase diz o que fazer, não só o que faltou.
    expect(r.aviso).toContain("/ia/configuracoes");
  });

  it("duas chaves desligadas viram UMA frase, com os dois nomes", () => {
    const r = decidirLeituras(
      dia(),
      { ...TODAS, allow_calendar: false, allow_habits: false },
      HOJE,
    );
    expect(r.leituras).toHaveLength(2);
    expect(r.aviso).toContain("Agenda");
    expect(r.aviso).toContain("Hábitos");
    // Uma frase só: `Intl.ListFormat` em pt-BR junta com "e".
    expect(r.aviso.split("\n")).toHaveLength(1);
  });

  /**
   * ⚠️ Duas ferramentas do MESMO módulo desligado são UM nome na frase, não dois. Sem o
   * `Set`, "Planejar minha semana" sem `allow_training` diria "Treinos e Treinos".
   */
  it("módulo com duas ferramentas na lista é nomeado UMA vez", () => {
    const semana = experienciaPorId("planejar-semana")!;
    const r = decidirLeituras(
      semana,
      { ...TODAS, allow_calendar: false, allow_todo: false },
      HOJE,
    );
    expect(r.puladas).toHaveLength(2);
    expect(r.aviso.match(/Agenda/g)).toHaveLength(1);
    expect(r.aviso.match(/TO-DO/g)).toHaveLength(1);
  });

  it("nenhuma chave ligada ⇒ NADA a ler, e quem chama tem de recusar antes de gastar", () => {
    const r = decidirLeituras(dia(), NENHUMA, HOJE);
    expect(r.leituras).toEqual([]);
    expect(r.puladas).toHaveLength(4);
  });

  it("os argumentos vêm de `hoje` INJETADO", () => {
    const r = decidirLeituras(experienciaPorId("encerrar-dia")!, TODAS, "2026-03-09");
    const nutricao = r.leituras.find((l) => l.toolName === "nutrition.get_day");
    expect(nutricao?.input).toEqual({ data: "2026-03-09" });
  });

  /**
   * ⚠️ Chave ausente do objeto não é chave ligada. `permissions[chave] === true` e nunca
   * `!== false`: um mapa vindo de um usuário sem linha de preferências viria vazio, e a
   * comparação frouxa liberaria as nove leituras de uma vez.
   */
  it("chave AUSENTE é tratada como desligada", () => {
    const r = decidirLeituras(dia(), {}, HOJE);
    expect(r.leituras).toEqual([]);
    expect(r.puladas).toHaveLength(4);
  });
});

/**
 * ⛔ SÓ LEITURA ENTRA NUM PANORAMA — E A TRAVA NÃO PODE SER SÓ O TESTE DO CATÁLOGO.
 *
 * `catalog.test.ts` reprova uma ferramenta de escrita no catálogo, mas um teste só protege quem
 * roda a suíte. O laço dirigido chama `executeTool` sem `modo` — e o executor fixa
 * `modo: "proposta"` internamente —, então uma ferramenta de escrita que chegasse às `leituras`
 * criaria uma linha em `ai_action_proposals` **todo dia, no clique do atalho**, sem o dono nem o
 * modelo terem pedido nada. O Approval Engine ainda exigiria confirmação, mas o sistema passaria
 * a propor alterações sozinho — que é justamente o que o Bloco 4 promete não fazer.
 *
 * Por isso a decisão acontece aqui, onde o descriptor já está resolvido, e não em `chat-runner`:
 * aquele runner executa uma lista que recebeu e não conhece catálogo nem política de experiência
 * (invariante 104).
 */
describe("18-F Bloco 4 — ferramenta de ESCRITA nunca vira leitura de panorama", () => {
  const comEscrita: Experiencia = {
    id: "planejar-dia",
    titulo: "Panorama de teste",
    prompt: "irrelevante",
    promptVersion: "teste-v1",
    ferramentas: [
      { toolName: "habits.get_today", argumentos: () => ({}) },
      // Do registry, `kind: "escrita"` — e o módulo dela está LIGADO em `TODAS`, então a
      // checagem de permissão sozinha a deixaria passar.
      { toolName: "habits.registrar", argumentos: () => ({ habito: "Água" }) },
    ],
  };

  it("a ferramenta de escrita não entra em `leituras`", () => {
    const r = decidirLeituras(comEscrita, TODAS, HOJE);
    expect(r.leituras.map((l) => l.toolName)).toEqual(["habits.get_today"]);
  });

  /**
   * ⛔ E ela também NÃO é declarada como pulada: `puladas` vira a frase "a leitura ficou
   * desligada nas suas preferências", que seria MENTIRA — não foi o dono que fechou essa porta,
   * é código nosso fora de sincronia. Mesmo tratamento da ferramenta que sumiu do registry.
   */
  it("e não é declarada ao dono como preferência desligada", () => {
    const r = decidirLeituras(comEscrita, TODAS, HOJE);
    expect(r.puladas).toEqual([]);
    expect(r.aviso).toBe("");
  });

  /**
   * A degradação é segura nos dois extremos: sobrando só escrita, não sobra leitura nenhuma —
   * e `runExperience` recusa antes de gastar (a lição do `NO_INDICATORS` da 18-E).
   */
  it("catálogo só de escrita não deixa leitura nenhuma de pé", () => {
    const soEscrita: Experiencia = {
      ...comEscrita,
      ferramentas: [comEscrita.ferramentas[1]!],
    };
    const r = decidirLeituras(soEscrita, TODAS, HOJE);
    expect(r.leituras).toEqual([]);
    expect(r.modulos).toEqual([]);
  });
});

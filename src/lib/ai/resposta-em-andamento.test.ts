import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  aoTrocarDeTentativa,
  aoAtualizarEspecialista,
  linhaDeEspecialistas,
  textoParaDevolver,
  deveEnviarComEnter,
  deveFecharAoNavegar,
  type EspecialistaNaTela,
} from "./resposta-em-andamento";

const propostas = Object.freeze([
  Object.freeze({ id: "agenda", trilha: 1, rotulo: "Compromisso" }),
  Object.freeze({ id: "todo", trilha: 2, rotulo: "Tarefa" }),
  Object.freeze({ id: "agenda-2", trilha: 1, rotulo: "Outro compromisso" }),
]);

describe("resposta em andamento", () => {
  it("switch da trilha 1 remove só as propostas da trilha 1, sem mutar a entrada", () => {
    expect(aoTrocarDeTentativa(propostas, 1)).toEqual([propostas[1]]);
    expect(propostas).toHaveLength(3);
  });

  it("switch da trilha 0 não remove as propostas dos especialistas", () => {
    expect(aoTrocarDeTentativa(propostas, 0)).toEqual(propostas);
  });

  it("trilha desconhecida e lista vazia não removem cartões alheios", () => {
    expect(aoTrocarDeTentativa(propostas, 8)).toEqual(propostas);
    expect(aoTrocarDeTentativa([], 1)).toEqual([]);
  });

  it("aoAtualizarEspecialista faz upsert mantendo a ordem de chegada e a entrada intacta", () => {
    const agenda: EspecialistaNaTela = Object.freeze({ agentId: "agenda", rotulo: "Agenda", status: "consultando" });
    const treino: EspecialistaNaTela = Object.freeze({ agentId: "treinos", rotulo: "Treinos", status: "consultando" });
    const lista = Object.freeze([agenda, treino]);
    const pronto: EspecialistaNaTela = { ...agenda, status: "pronto" };
    expect(aoAtualizarEspecialista(lista, pronto)).toEqual([pronto, treino]);
    const falhou: EspecialistaNaTela = { agentId: "todo", rotulo: "TO-DO", status: "falhou" };
    expect(aoAtualizarEspecialista(lista, falhou)).toEqual([agenda, treino, falhou]);
    expect(lista).toEqual([agenda, treino]);
    expect(aoAtualizarEspecialista([], agenda)).toEqual([agenda]);
  });

  it("linhaDeEspecialistas marca pronto com ✓, falhou com ✕ e consultando com …", () => {
    expect(linhaDeEspecialistas([
      { agentId: "agenda", rotulo: "Agenda", status: "pronto" },
      { agentId: "todo", rotulo: "TO-DO", status: "falhou" },
      { agentId: "treinos", rotulo: "Treinos", status: "consultando" },
    ])).toBe("Consultando: Agenda ✓ · TO-DO ✕ · Treinos…");
    expect(linhaDeEspecialistas([])).toBe("");
  });
});

// A suíte roda em node: o elo dos handlers com a tela segue a varredura de chat-events.test.
const tela = fs.readFileSync(path.resolve(__dirname, "../../components/ai/chat-client.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const troca = tela.slice(tela.indexOf("onSwitch: (e) => {"), tela.indexOf("onTool: (e) => {"));
const proposta = tela.slice(tela.indexOf("onProposta: (e) => {"), tela.indexOf("onEspecialista: (e) => {"));
const especialista = tela.slice(tela.indexOf("onEspecialista: (e) => {"), tela.indexOf("onDone: (e) => {"));

describe("ligação dos eventos com o chat", () => {
  it("filtra cartões e desfechos pela trilha e remove do selo somente os ids descartados", () => {
    expect(troca).toContain("aoTrocarDeTentativa(propostasDaRespostaRef.current, e.trilha)");
    expect(troca).toContain("aoTrocarDeTentativa(b.propostas ?? [], e.trilha)");
    expect(troca).toContain("!restantes.some((p) => p.id === proposta.id)");
    expect(troca).toMatch(/for \(const \{ id \} of zeradas\) delete resto\[id\]/);
    expect(troca).toContain('onAtividade?.({ tipo: "decidiu", id })');
    expect(troca).not.toContain('tipo: "recomecou"');
    expect(troca).toContain('content: ""');
  });

  it("leva a trilha real para o cartão e para o controle dos desfechos", () => {
    expect(proposta).toContain("const proposta = { ...e.proposta, trilha: e.trilha }");
    expect(proposta).toContain("propostasDaRespostaRef.current.push(proposta)");
    expect(proposta).toContain("propostas: [...(b.propostas ?? []), proposta]");
  });

  it("atualiza a lista no evento e a apresenta na bolha do assistente", () => {
    expect(especialista).toContain("especialistas: aoAtualizarEspecialista(b.especialistas ?? [], e)");
    expect(tela).toContain("linhaDeEspecialistas(b.especialistas)");
  });
});


describe("recusa antes do start e teclado do chat", () => {
  it("devolve a mensagem quando não há rascunho novo", () => {
    expect(textoParaDevolver("oi", "")).toBe("oi");
    expect(textoParaDevolver("oi", "novo")).toBe("novo");
    expect(textoParaDevolver("oi", " ")).toBe(" ");
  });

  it.each([
    ["Enter", false, false, false, false, true],
    ["Enter", true, false, false, false, false],
    ["Enter", false, false, false, true, false],
    ["Enter", false, true, false, false, false],
    ["Enter", false, true, true, false, false],
    ["Enter", false, false, true, true, true],
    ["a", false, false, true, false, false],
  ])("tecla %s, shift %s, composição %s, atalho %s, toque %s → envia %s", (tecla, shift, compondo, atalho, toque, esperado) => {
    expect(deveEnviarComEnter({ tecla, shift, compondo, atalho, toque })).toBe(esperado);
  });
});


describe("navegação no painel", () => {
  it.each([
    ["/financeiro", true], ["/ia/acoes?filtro=pendentes", true],
    ["https://x.com", false], ["//x.com", false], ["/\\x.com", false], ["/\t/x.com", false], [null, false],
  ])("link %s fecha o painel: %s", (href, esperado) => {
    expect(deveFecharAoNavegar(href)).toBe(esperado);
  });
});

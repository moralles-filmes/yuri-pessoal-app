/**
 * Fase 18-C · Bloco 3 — IA · A allowlist de campos auditáveis e a coerência do command.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO DEFENDE (§3.6 do design)                                           ║
 * ║                                                                                       ║
 * ║ A invariante 20 da 18-B diz: a auditoria guarda o pedido, nunca o resultado. Guardar   ║
 * ║ um `before_snapshot` completo seria uma SEGUNDA CÓPIA do registro pessoal dentro do    ║
 * ║ módulo de IA, com prazo indefinido. A exceção que o dono autorizou é estreita: só os   ║
 * ║ campos que a ação tocou, por allowlist estática do command.                            ║
 * ║                                                                                       ║
 * ║ E o limite de valor é DE FORMA, não de nome. Uma lista de campos proibidos ("nunca     ║
 * ║ `photo_path`, nunca `token`") fura no primeiro campo que ninguém previu; uma forma     ║
 * ║ permitida — escalar, curto, sem estrutura — recusa o anexo, a URL assinada, o texto    ║
 * ║ livre longo e a chave sem que ninguém precise ter pensado neles antes.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import {
  filtrarCamposTocados,
  isCommandCoherent,
  TAMANHO_MAX_DO_CAMPO,
  type CommandDescriptor,
} from "./contracts";

const ALLOWLIST = ["title", "due_date", "priority", "is_done"];

describe("filtrarCamposTocados", () => {
  it("deixa passar o que está na allowlist e cabe na forma", () => {
    const r = filtrarCamposTocados(
      { title: "Comprar pão", due_date: "2026-08-08", priority: 2, is_done: false },
      ALLOWLIST,
    );
    expect(r.campos).toEqual({
      title: "Comprar pão",
      due_date: "2026-08-08",
      priority: 2,
      is_done: false,
    });
    expect(r.undetailed).toBe(false);
  });

  it("null passa — 'campo apagado' é um efeito, não ausência de efeito", () => {
    const r = filtrarCamposTocados({ due_date: null }, ALLOWLIST);
    expect(r.campos).toEqual({ due_date: null });
    expect(r.undetailed).toBe(false);
  });

  /**
   * ⛔ CAMPO FORA DA ALLOWLIST NÃO VAI PARA A LINHA — nem com o nome. "Registra que houve
   * alteração não detalhada" é o que a decisão do dono diz; nomear o campo omitido já
   * contaria parte do que se decidiu não contar.
   */
  it("campo fora da allowlist não entra, e nem o NOME dele aparece", () => {
    const r = filtrarCamposTocados({ title: "x", notes: "texto pessoal" }, ALLOWLIST);
    expect(r.campos).toEqual({ title: "x" });
    expect(r.undetailed).toBe(true);
    expect(JSON.stringify(r)).not.toContain("notes");
    expect(JSON.stringify(r)).not.toContain("texto pessoal");
  });

  /**
   * ⛔ OS QUATRO QUE A FORMA RECUSA SEM PRECISAR CONHECÊ-LOS. Todos estão na allowlist de
   * propósito: o que os barra não é o nome, é não serem escalar curto.
   */
  it.each([
    ["anexo em objeto", { storage_path: { bucket: "privado", key: "k" } }],
    ["lista de fotos", [1, 2, 3]],
    ["texto livre longo", "x".repeat(TAMANHO_MAX_DO_CAMPO + 1)],
    ["número não finito", Number.POSITIVE_INFINITY],
  ])("recusa %s mesmo estando na allowlist", (_nome, valor) => {
    const r = filtrarCamposTocados({ title: valor }, ALLOWLIST);
    expect(r.campos).toEqual({});
    expect(r.undetailed).toBe(true);
  });

  it("o limite de tamanho é inclusivo — exatamente no limite passa", () => {
    const noLimite = "x".repeat(TAMANHO_MAX_DO_CAMPO);
    const r = filtrarCamposTocados({ title: noLimite }, ALLOWLIST);
    expect(r.campos.title).toBe(noLimite);
    expect(r.undetailed).toBe(false);
  });

  it("allowlist vazia não detalha nada, e diz que não detalhou", () => {
    const r = filtrarCamposTocados({ title: "x" }, []);
    expect(r.campos).toEqual({});
    expect(r.undetailed).toBe(true);
  });

  // Sem alteração nenhuma não há o que declarar — `undetailed` falso é a verdade aqui.
  it("nada alterado não vira 'alteração não detalhada'", () => {
    const r = filtrarCamposTocados({}, ALLOWLIST);
    expect(r.campos).toEqual({});
    expect(r.undetailed).toBe(false);
  });

  /**
   * O objeto de entrada vem do serviço de domínio, e um `__proto__` ali não pode virar
   * poluição de protótipo na linha de auditoria.
   */
  it("chave herdada do protótipo não entra", () => {
    const r = filtrarCamposTocados(JSON.parse('{"__proto__":{"x":1},"title":"ok"}'), [
      ...ALLOWLIST,
      "__proto__",
    ]);
    expect(r.campos.title).toBe("ok");
    expect(Object.getPrototypeOf({}).x).toBeUndefined();
  });
});

describe("isCommandCoherent", () => {
  const BOM: CommandDescriptor = {
    name: "criarTarefaTodo",
    module: "todo",
    risk: 2,
    revalidar: ["/todo"],
    camposAuditaveis: ALLOWLIST,
    undo: null,
  };

  it("aceita o command bem declarado", () => {
    expect(isCommandCoherent(BOM, ["criarTarefaTodo"])).toBe(true);
  });

  it("recusa nome vazio", () => {
    expect(isCommandCoherent({ ...BOM, name: "  " }, [])).toBe(false);
  });

  // Risco 1 é leitura. Um command de escrita com risco de leitura seria um descriptor que
  // se declara inofensivo — e é justamente o que a escala existe para impedir.
  it("recusa risco de leitura", () => {
    expect(isCommandCoherent({ ...BOM, risk: 1 }, ["criarTarefaTodo"])).toBe(false);
  });

  /**
   * Sem rota para revalidar, a alteração acontece e a tela do módulo continua mostrando o
   * estado anterior. O dono confirmaria de novo achando que não funcionou.
   */
  it("recusa command sem rota a revalidar", () => {
    expect(isCommandCoherent({ ...BOM, revalidar: [] }, ["criarTarefaTodo"])).toBe(false);
  });

  it("recusa allowlist com nome repetido", () => {
    expect(
      isCommandCoherent({ ...BOM, camposAuditaveis: ["title", "title"] }, ["criarTarefaTodo"]),
    ).toBe(false);
  });

  // Allowlist VAZIA é declaração válida: "esta ação não detalha campo nenhum".
  it("aceita allowlist vazia", () => {
    expect(isCommandCoherent({ ...BOM, camposAuditaveis: [] }, ["criarTarefaTodo"])).toBe(true);
  });

  /**
   * ⛔ `undo` apontando para um nome inexistente é o defeito que só apareceria no CLIQUE: o
   * botão de desfazer aparece na tela, o dono clica, e nada acontece — depois de a ação
   * original já ter alterado o registro dele.
   */
  it("recusa undo que aponta para command inexistente", () => {
    expect(isCommandCoherent({ ...BOM, undo: "excluirTarefaTodo" }, ["criarTarefaTodo"])).toBe(
      false,
    );
  });

  it("aceita undo que existe no mapa", () => {
    expect(
      isCommandCoherent({ ...BOM, undo: "excluirTarefaTodo" }, [
        "criarTarefaTodo",
        "excluirTarefaTodo",
      ]),
    ).toBe(true);
  });
});

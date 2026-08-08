/**
 * Fase 18-C · Bloco 5 — IA · O ELO entre a EXECUÇÃO e o command que a desfaz.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR SÓ APARECERIA NO CLIQUE.               ║
 * ║                                                                                       ║
 * ║ O desfazer monta a entrada do command INVERSO a partir do que a execução registrou —   ║
 * ║ `target_id` e os campos que a allowlist §3.6 deixou passar. Se essa montagem não       ║
 * ║ casasse com o Zod `.strict()` do inverso, o botão apareceria na tela, o dono clicaria  ║
 * ║ e nada aconteceria: DEPOIS de a ação original já ter alterado o registro dele.         ║
 * ║                                                                                       ║
 * ║ Nenhum teste de tipo pega isso: o construtor devolve `ValorCanonico`, que é `unknown`  ║
 * ║ estruturado — o compilador não sabe que `{tarefa_id}` é o que `excluirTarefaEntrada`   ║
 * ║ espera. Quem sabe é o schema, e é ele que roda aqui.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import { ROTULO_DO_COMMAND } from "@/lib/ai/constants";
import { ACTION_COMMANDS, findCommand } from "./index";
import type { FatosParaDesfazer } from "../contracts";

const UUID = "11111111-1111-4111-8111-111111111111";

/**
 * Um fixture por command, escrito à mão a partir do que o `executar` de cada um devolve em
 * `alterados`. Derivá-los das próprias funções faria o teste concordar consigo mesmo.
 */
const FATOS: Record<string, FatosParaDesfazer> = {
  criarTarefaTodo: { targetId: UUID, changedFields: { title: "Comprar pão" } },
  concluirTarefaTodo: {
    targetId: UUID,
    changedFields: { status: "concluida", scheduled_for: "2026-08-12", recurred: false },
  },
  registrarHabito: {
    targetId: UUID,
    changedFields: { value: 8, is_done: true, log_date: "2026-08-12" },
  },
  criarEvento: {
    targetId: UUID,
    changedFields: { title: "Dentista", start_at: "2026-08-12T13:00:00.000Z" },
  },
  registrarConsumo: {
    targetId: UUID,
    changedFields: { food_name: "Arroz cozido", quantity: 120, diary_date: "2026-08-12" },
  },
  lancarTransacao: {
    targetId: UUID,
    changedFields: { type: "despesa", amount: 12000, description: "Mercado" },
  },
};

const COM_DESFAZER = ACTION_COMMANDS.filter((c) => c.desfazer.kind === "command");

describe("todo command com desfazer produz uma entrada que o INVERSO aceita", () => {
  it("há desfazer declarado para conferir — o laço não é vacuoso", () => {
    // 6 dos 13: criar tarefa, concluir tarefa, registrar hábito, criar evento, registrar
    // consumo e lançar transação. Os outros 7 declaram por que NÃO há inverso.
    expect(COM_DESFAZER).toHaveLength(6);
  });

  it.each(COM_DESFAZER.map((c) => [c.name] as const))("%s", (nome) => {
    const command = findCommand(nome);
    expect(command, nome).not.toBeNull();
    if (!command || command.desfazer.kind !== "command") throw new Error("sem desfazer");

    const fatos = FATOS[nome];
    expect(fatos, `${nome} sem fixture — acrescente um`).toBeDefined();

    const payload = command.desfazer.payload(fatos);
    expect(payload, `${nome}: a montagem devolveu null com fatos completos`).not.toBeNull();

    const inverso = findCommand(command.desfazer.command);
    expect(inverso, command.desfazer.command).not.toBeNull();
    // ⛔ O Zod `.strict()` do inverso, o MESMO que roda na execução.
    expect(inverso?.parse(payload).ok, `${nome} → ${command.desfazer.command}`).toBe(true);
  });

  /** Sem alvo não há desfazer possível — e a montagem tem de dizer isso devolvendo `null`. */
  it.each(COM_DESFAZER.map((c) => [c.name] as const))(
    "%s não monta nada quando a execução não registrou alvo",
    (nome) => {
      const command = findCommand(nome);
      if (!command || command.desfazer.kind !== "command") throw new Error("sem desfazer");
      expect(
        command.desfazer.payload({ ...FATOS[nome], targetId: null }),
        nome,
      ).toBeNull();
    },
  );
});

/**
 * ⛔ O ACOPLAMENTO QUE NÃO ESTÁ ESCRITO EM LUGAR NENHUM, E QUE ESTE TESTE TORNA VISÍVEL.
 *
 * `desfazerHabito` precisa do DIA, e o dia só existe no desfazer porque `log_date` está na
 * allowlist de campos auditáveis de `registrarHabito` (§3.6). Tirá-lo de lá por parecer
 * detalhe de auditoria quebraria o botão de desfazer — em runtime, e só no clique.
 */
describe("o desfazer do hábito depende de log_date estar na allowlist §3.6", () => {
  it("registrarHabito declara log_date como campo auditável", () => {
    expect(findCommand("registrarHabito")?.camposAuditaveis).toContain("log_date");
  });

  it("sem o dia registrado, a montagem devolve null em vez de adivinhar hoje", () => {
    const command = findCommand("registrarHabito");
    if (!command || command.desfazer.kind !== "command") throw new Error("sem desfazer");
    expect(
      command.desfazer.payload({ targetId: UUID, changedFields: { value: 8 } }),
    ).toBeNull();
  });
});

/**
 * A tela de ações nomeia o COMMAND, não a ferramenta — seis dos treze não têm ferramenta, e é
 * assim que o modelo fica impedido de propô-los. Command sem rótulo apareceria para o dono
 * como `criarTarefaTodo`, que é o identificador interno vazando.
 */
describe("rótulos dos commands (18-C · Bloco 5)", () => {
  it("todo command do registry tem rótulo em pt-BR", () => {
    for (const c of ACTION_COMMANDS) {
      const rotulo = ROTULO_DO_COMMAND[c.name];
      expect(rotulo, c.name).toBeDefined();
      expect(rotulo, c.name).not.toBe("");
      expect(rotulo, c.name).not.toBe(c.name);
    }
  });

  it("nenhum rótulo sobra apontando para command que não existe mais", () => {
    const nomes = new Set(ACTION_COMMANDS.map((c) => c.name));
    for (const nome of Object.keys(ROTULO_DO_COMMAND)) {
      expect(nomes.has(nome), nome).toBe(true);
    }
  });
});

/**
 * ⛔ O DESFAZER NÃO GANHOU FERRAMENTA NO BLOCO 5, E ISSO PRECISA CONTINUAR VERDADE.
 *
 * A tela alcança os inversos pelo botão, sobre uma execução que a própria IA fez. O modelo
 * continua sem ter como propor exclusão, reabertura, apagamento de registro nem cancelamento
 * de compromisso — excluir por pedido em linguagem natural é risco 4 e está fora da 18-C.
 */
describe("os inversos continuam sem ferramenta", () => {
  it("nenhum command apontado como desfazer tem receita de proposta", async () => {
    const { PROPOSTAS_POR_FERRAMENTA } = await import("./previews");
    const { AI_TOOL_REGISTRY } = await import("@/lib/ai/tools/registry");

    const comFerramenta = new Set(
      AI_TOOL_REGISTRY.filter((t) => t.kind === "escrita").map((t) => t.command),
    );
    expect(Object.keys(PROPOSTAS_POR_FERRAMENTA).length).toBeGreaterThan(0);

    for (const c of COM_DESFAZER) {
      if (c.desfazer.kind !== "command") continue;
      expect(comFerramenta.has(c.desfazer.command), c.desfazer.command).toBe(false);
    }
  });
});

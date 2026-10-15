import { describe, expect, it } from "vitest";
import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";
import { permissaoDeLeituraDaEscrita } from "@/lib/ai/tools/registry";
import {
  alternarEscrita,
  alternarLeitura,
  escritaVisivel,
  permissoesParaSalvar,
  visaoVisivel,
  type PermissoesDoForm,
} from "./preferencias-cascata";

/**
 * REDESIGN-07-D · D2 — o que se vê é o que se salva (spec §6.2, G-e).
 *
 * O defeito: o formulário é `useState` sem `key`, e desligar a leitura deixava a escrita
 * marcada no estado. O servidor gravava `false` (ele ANDa), mas a tela continuava com `true` —
 * e religar a leitura religava a escrita sozinha, contra a regra do lote.
 */
function form(
  leituras: Partial<Record<ToolPermission, boolean>> = {},
  escritas: Partial<Record<ToolWritePermission, boolean>> = {},
  allowVision = false,
): PermissoesDoForm & { outro: string } {
  return {
    permissions: Object.fromEntries(
      TOOL_PERMISSIONS.map((p) => [p, leituras[p] ?? false]),
    ) as Record<ToolPermission, boolean>,
    writePermissions: Object.fromEntries(
      TOOL_WRITE_PERMISSIONS.map((p) => [p, escritas[p] ?? false]),
    ) as Record<ToolWritePermission, boolean>,
    allowVision,
    // Campo do formulário que a cascata não conhece: tem de atravessar intacto.
    outro: "intacto",
  };
}

const TUDO_LIGADO = () =>
  form(
    Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, true])),
    Object.fromEntries(TOOL_WRITE_PERMISSIONS.map((p) => [p, true])),
    true,
  );

describe("alternarLeitura", () => {
  it("desligar a leitura do TO-DO desliga a escrita do TO-DO (M6)", () => {
    const f = alternarLeitura(TUDO_LIGADO(), "allow_todo", false);
    expect(f.permissions.allow_todo).toBe(false);
    expect(f.writePermissions.allow_write_todo).toBe(false);
  });

  it("ligar a leitura NÃO religa a escrita (M31)", () => {
    const desligado = alternarLeitura(TUDO_LIGADO(), "allow_todo", false);
    const religado = alternarLeitura(desligado, "allow_todo", true);
    expect(religado.permissions.allow_todo).toBe(true);
    expect(religado.writePermissions.allow_write_todo).toBe(false);
  });

  it("desligar a leitura do Financeiro desliga a escrita E o envio de comprovantes (M32)", () => {
    const f = alternarLeitura(TUDO_LIGADO(), "allow_finance", false);
    expect(f.writePermissions.allow_write_finance).toBe(false);
    expect(f.allowVision).toBe(false);
  });

  it("desligar uma leitura sem chave de escrita (Treinos) só muda ela", () => {
    const antes = TUDO_LIGADO();
    const f = alternarLeitura(antes, "allow_training", false);
    expect(f).toEqual({ ...antes, permissions: { ...antes.permissions, allow_training: false } });
  });

  it("cada escrita desligada é a que o REGISTRY diz depender da leitura — nenhuma outra", () => {
    for (const leitura of TOOL_PERMISSIONS) {
      const f = alternarLeitura(TUDO_LIGADO(), leitura, false);
      for (const escrita of TOOL_WRITE_PERMISSIONS) {
        const depende = permissaoDeLeituraDaEscrita(escrita) === leitura;
        expect(f.writePermissions[escrita], `${leitura} → ${escrita}`).toBe(!depende);
      }
    }
  });

  it("não mexe em campo que não conhece nem muta o objeto recebido", () => {
    const antes = TUDO_LIGADO();
    const copia = structuredClone(antes);
    const f = alternarLeitura(antes, "allow_finance", false);
    expect(f.outro).toBe("intacto");
    expect(antes).toEqual(copia);
  });
});

describe("alternarEscrita", () => {
  it("desligar a escrita do Financeiro desliga o envio de comprovantes (M32)", () => {
    const f = alternarEscrita(TUDO_LIGADO(), "allow_write_finance", false);
    expect(f.writePermissions.allow_write_finance).toBe(false);
    expect(f.allowVision).toBe(false);
    expect(f.permissions.allow_finance).toBe(true);
  });

  it("desligar a escrita do Financeiro com a visão já desligada não altera o resto", () => {
    const antes = form({ allow_finance: true }, { allow_write_finance: true }, false);
    const f = alternarEscrita(antes, "allow_write_finance", false);
    expect(f).toEqual({
      ...antes,
      writePermissions: { ...antes.writePermissions, allow_write_finance: false },
    });
  });

  it("desligar outra escrita não toca a visão", () => {
    const f = alternarEscrita(TUDO_LIGADO(), "allow_write_todo", false);
    expect(f.allowVision).toBe(true);
  });

  it("ligar a escrita sem a leitura não liga nada (o interruptor está desabilitado, e a regra também)", () => {
    const antes = form({}, {}, false);
    expect(alternarEscrita(antes, "allow_write_todo", true)).toEqual(antes);
  });
});

describe("o que a tela mostra", () => {
  it("escritaVisivel = leitura E escrita, mesmo com estado incoerente vindo do servidor", () => {
    const incoerente = form({ allow_todo: false }, { allow_write_todo: true });
    expect(escritaVisivel(incoerente, "allow_write_todo")).toBe(false);
    expect(escritaVisivel(TUDO_LIGADO(), "allow_write_todo")).toBe(true);
  });

  it("visaoVisivel exige a leitura E a escrita do Financeiro", () => {
    expect(visaoVisivel(form({ allow_finance: true }, {}, true))).toBe(false);
    expect(visaoVisivel(form({}, { allow_write_finance: true }, true))).toBe(false);
    expect(visaoVisivel(TUDO_LIGADO())).toBe(true);
  });

  it("o que se salva é o que se vê", () => {
    const incoerente = form({ allow_todo: false }, { allow_write_todo: true }, true);
    const salvo = permissoesParaSalvar(incoerente);
    expect(salvo.writePermissions.allow_write_todo).toBe(false);
    expect(salvo.allowVision).toBe(false);
    expect(salvo.permissions).toEqual(incoerente.permissions);
  });
});

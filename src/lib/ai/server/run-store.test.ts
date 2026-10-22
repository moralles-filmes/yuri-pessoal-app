import { describe, expect, it, vi } from "vitest";

// `run-store` importa o client Supabase com cookies; aqui só a tabela de frases importa.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { ROTULO_CRUZAR_MODULOS } from "@/lib/ai/constants";
import { MENSAGEM_ADMISSAO } from "./run-store";

describe("mensagens de admissão que nomeiam chave da tela", () => {
  it("AI_CROSS_MODULE_NOT_ALLOWED cita o rótulo real do interruptor, nunca o texto escrito de novo", () => {
    const m = MENSAGEM_ADMISSAO.AI_CROSS_MODULE_NOT_ALLOWED;
    expect(m).toContain(`“${ROTULO_CRUZAR_MODULOS}”`);
    expect(m).toContain("/ia/configuracoes");
    expect(m).not.toMatch(/Panoramas de vários módulos/);
  });
});

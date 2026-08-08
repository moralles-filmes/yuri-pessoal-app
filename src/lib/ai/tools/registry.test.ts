/**
 * Fase 18-B — IA · Integridade do Tool Registry.
 *
 * O registry é a ÚNICA porta pela qual uma ferramenta existe. Estes testes guardam as
 * propriedades que nenhuma revisão de código pega sozinha: nome de domínio (nunca operação
 * de banco), schema fechado, `user_id` ausente da entrada, e a concordância nos DOIS sentidos
 * entre `allowedAgents` do descriptor e `allowedTools` do agente.
 */

import { describe, expect, it } from "vitest";
import {
  isToolDescriptorCoherent,
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
} from "./contracts";
import {
  AI_TOOL_REGISTRY,
  findTool,
  toolDefinitionsFor,
  toolsForPermission,
} from "./registry";
import { AI_AGENT_REGISTRY } from "@/lib/ai/agents/registry";
import { ROTULO_DA_FERRAMENTA, rotuloDaFerramenta } from "@/lib/ai/constants";
import { EVENT_TYPES } from "@/lib/calendar/constants";

describe("integridade do registry (18-B)", () => {
  /**
   * ⚠️ ESTE TESTE MUDOU DE AFIRMAÇÃO NO BLOCO 4, E A MUDANÇA É O REGISTRO DE UMA DECISÃO.
   *
   * Ele dizia "toda ferramenta é de LEITURA". Era verdade até o commit que publicou
   * `todo.criar_tarefa`, e trocá-lo foi parte do trabalho — do mesmo jeito que trocar o teste
   * do registry de commands vazio foi. Acrescentar poder de escrita não pode ser algo que se
   * faça sem notar; ter de editar uma asserção é o "notar".
   *
   * O que ele guarda agora é mais forte que a contagem: TODA escrita declara as duas chaves,
   * exige confirmação e aponta um command. Nada disso é opcional, e `isToolDescriptorCoherent`
   * recusaria um descriptor sem — este teste é a segunda camada, sobre o registry real.
   */
  it("toda ferramenta de escrita declara chave, confirmação e command", () => {
    expect(AI_TOOL_REGISTRY.length).toBeGreaterThan(0);
    for (const t of AI_TOOL_REGISTRY) {
      expect(["leitura", "escrita"], t.name).toContain(t.kind);
      if (t.kind === "leitura") {
        expect(t.requiresConfirmation, t.name).toBe(false);
        expect(t.requiredWritePermission, t.name).toBeUndefined();
        expect(t.command, t.name).toBeUndefined();
        continue;
      }
      expect(t.requiresConfirmation, t.name).toBe(true);
      expect(t.requiredWritePermission, t.name).toBeDefined();
      expect(t.command, t.name).toBeTruthy();
      expect(t.sensibilidades, t.name).toBeDefined();
      // Escrita nunca é risco 1: risco 1 é a faixa da consulta.
      expect(t.risk, t.name).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * ⛔ A LISTA DE TIPOS DE EVENTO ESTÁ DUPLICADA NO REGISTRY, E ESTE TESTE É O PREÇO DISSO.
   *
   * `tools/` não pode importar `@/lib/calendar/constants` — o teste de fronteira proíbe, e
   * está certo: o registry é a superfície que vai ao provedor, não um consumidor do domínio.
   * A saída foi escrever o `enum` do JSON Schema à mão. Um tipo novo na Agenda que não
   * chegasse aqui faria o modelo oferecer um valor que o Zod do command recusaria — falha
   * silenciosa, invisível em revisão, e repetida a cada pergunta.
   *
   * O arquivo de TESTE pode importar os dois lados (a fronteira ignora `.test.ts`), e é
   * exatamente para isto.
   */
  it("o enum de tipo de evento do registry casa com EVENT_TYPES da Agenda", () => {
    const criar = findTool("calendar.criar_evento");
    expect(criar).not.toBeNull();
    const schema = criar!.inputSchema as { properties?: Record<string, { enum?: string[] }> };
    expect(schema.properties?.tipo?.enum).toEqual([...EVENT_TYPES]);
  });

  /**
   * A descrição de uma ferramenta de escrita é lida pelo MODELO, e é ela que o impede de
   * relatar a proposta como fato consumado. Ela tem de dizer as duas coisas: que prepara, e
   * que nada foi feito.
   */
  it("toda descrição de escrita diz que PREPARA e que nada foi alterado", () => {
    for (const t of AI_TOOL_REGISTRY.filter((x) => x.kind === "escrita")) {
      const texto = t.description.toUpperCase();
      expect(texto, t.name).toContain("PREPARA");
      expect(texto, t.name).toContain("NADA");
      expect(t.description.toLowerCase(), t.name).toContain("confirm");
    }
  });

  it("toda ferramenta é coerente", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(isToolDescriptorCoherent(t), t.name).toBe(true);
    }
  });

  it("nome é ação de DOMÍNIO — nenhuma operação de banco", () => {
    const PROIBIDOS = [
      "execute_sql",
      "run_code",
      "call_any_endpoint",
      "update_any_table",
      "delete_any_record",
      "fetch_url_unrestricted",
      "insert",
      "delete",
      "drop",
      "query",
    ];
    for (const t of AI_TOOL_REGISTRY) {
      expect(t.name).toMatch(/^[a-z_]+\.[a-z_]+$/);
      for (const proibido of PROIBIDOS) expect(t.name).not.toContain(proibido);
    }
  });

  it("nenhum inputSchema menciona user_id ou owner_id", () => {
    const cru = JSON.stringify(AI_TOOL_REGISTRY.map((t) => t.inputSchema));
    expect(cru).not.toContain("user_id");
    expect(cru).not.toContain("owner_id");
    expect(cru).not.toContain("userId");
  });

  it("todo inputSchema é fechado (additionalProperties: false)", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(
        (t.inputSchema as { additionalProperties?: boolean }).additionalProperties,
        t.name,
      ).toBe(false);
    }
  });

  /**
   * O rótulo entra na mensagem de poda, que o MODELO lê. "Mostrando 50 de 51 registros" ao
   * lado de `contagem: 1` vira "50 de 51 treinos" na resposta — quando o que foi podado eram
   * os exercícios de um treino só. Rótulo genérico em texto que o modelo lê é número errado.
   */
  it("toda ferramenta nomeia os próprios itens, e nenhuma diz apenas 'registros'", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(t.itemLabel.trim(), t.name).not.toBe("");
      expect(t.itemLabel, t.name).not.toBe("registros");
    }
  });

  it("nenhuma descrição de ferramenta usa linguagem de prescrição ou de culpa", () => {
    const PROIBIDO = [
      "você deveria",
      "peso ideal",
      "você falhou",
      "preguiça",
      "carga máxima",
      "diagnóstico",
      "prescrevo",
      "garanto que",
      "recomendo",
    ];
    for (const t of AI_TOOL_REGISTRY) {
      const texto = t.description.toLowerCase();
      for (const termo of PROIBIDO) expect(texto, `${t.name}: ${termo}`).not.toContain(termo);
    }
  });

  it("a allowlist de todo agente é subconjunto do registry", () => {
    const nomes = new Set(AI_TOOL_REGISTRY.map((t) => t.name));
    for (const agente of AI_AGENT_REGISTRY) {
      for (const nome of agente.allowedTools) {
        expect(nomes.has(nome), `${agente.id} → ${nome}`).toBe(true);
      }
    }
  });

  it("allowedAgents e a allowlist do agente concordam nos dois sentidos", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(t.allowedAgents.length, `${t.name} sem agente`).toBeGreaterThan(0);
      for (const agentId of t.allowedAgents) {
        const agente = AI_AGENT_REGISTRY.find((a) => a.id === agentId);
        expect(agente, `agente ${agentId} de ${t.name}`).toBeDefined();
        expect(agente?.allowedTools).toContain(t.name);
      }
    }
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-C · Bloco 4 — O QUE O MODELO VÊ. Não substitui o guard; resolve outro problema.  ║
   * ║                                                                                     ║
   * ║ Com a chave de leitura ligada e a de escrita desligada (o estado de quem acabou de   ║
   * ║ autorizar a consulta do TO-DO), oferecer `todo.criar_tarefa` faria o modelo pedi-la, ║
   * ║ queimar um dos 3 passos da tentativa e receber `TOOL_WRITE_DISABLED` — a cada        ║
   * ║ pergunta. O guard continua sendo quem decide a SEGURANÇA; este filtro é o que mantém ║
   * ║ o laço útil.                                                                         ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("escrita NÃO é oferecida com a chave de escrita desligada", () => {
    const escritas = AI_TOOL_REGISTRY.filter((t) => t.kind === "escrita");
    expect(escritas.length, "sem escrita no registry, este teste não prova nada").toBeGreaterThan(0);

    const nomes = escritas.map((t) => t.name);
    const leituraLigada = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, true]));

    // Leitura toda ligada, escrita toda desligada → nenhuma definição de escrita sai.
    expect(toolDefinitionsFor(nomes, leituraLigada, {})).toEqual([]);

    // E o argumento OMITIDO tem de valer o mesmo que "tudo desligado": um chamador que
    // esqueça as chaves de escrita não pode herdar autorização da chave de leitura.
    expect(toolDefinitionsFor(nomes, leituraLigada)).toEqual([]);
  });

  it("com as DUAS chaves ligadas, a escrita é oferecida", () => {
    const escritas = AI_TOOL_REGISTRY.filter((t) => t.kind === "escrita");
    const leituraLigada = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, true]));
    const escritaLigada = Object.fromEntries(TOOL_WRITE_PERMISSIONS.map((p) => [p, true]));

    const oferecidas = toolDefinitionsFor(
      escritas.map((t) => t.name),
      leituraLigada,
      escritaLigada,
    );
    expect(oferecidas.map((d) => d.name).sort()).toEqual(escritas.map((t) => t.name).sort());
  });

  /** E a chave de LEITURA desligada continua vencendo, mesmo com a de escrita ligada. */
  it("a chave de leitura desligada barra a escrita, mesmo com a de escrita ligada", () => {
    const escritas = AI_TOOL_REGISTRY.filter((t) => t.kind === "escrita");
    const leituraDesligada = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, false]));
    const escritaLigada = Object.fromEntries(TOOL_WRITE_PERMISSIONS.map((p) => [p, true]));

    expect(
      toolDefinitionsFor(escritas.map((t) => t.name), leituraDesligada, escritaLigada),
    ).toEqual([]);
  });

  it("um nome na allowlist que não existe no registry não vira ferramenta", () => {
    // Permissões todas ligadas: o caso é sobre o NOME, não sobre a flag (18-C).
    const tudo = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, true]));
    expect(toolDefinitionsFor(["training.nao_existe"], tudo)).toEqual([]);
    expect(findTool("training.nao_existe")).toBeNull();
  });
});

// `executors.ts` é server-only: o alias do Vitest (`src/test/server-only-stub.ts`) é o que
// permite importá-lo em teste. Ele NÃO afrouxa o build — vale só no test runner.
const { TOOL_EXECUTORS } = await import("./executors");
const { PROPOSTAS_POR_FERRAMENTA } = await import(
  "@/lib/ai/approval/commands/previews"
);
const { ACTION_COMMANDS } = await import("@/lib/ai/approval/commands");

/**
 * ⚠️ SÃO DOIS MAPAS, E A BIJEÇÃO É POR `kind`.
 *
 * Leitura despacha em `TOOL_EXECUTORS` (devolve `ToolOutput`); escrita despacha em
 * `PROPOSTAS_POR_FERRAMENTA` (devolve `EfeitoProposto`). Um único mapa com os dois obrigaria
 * um tipo de retorno comum — e um retorno comum é exatamente o que permitiria escrever um
 * adapter de escrita com cara de leitura, cujo resultado o modelo relataria como fato.
 */
describe("registry ↔ executores e propostas", () => {
  it("toda ferramenta de LEITURA tem executor, e nenhuma de escrita tem", () => {
    for (const t of AI_TOOL_REGISTRY) {
      if (t.kind === "leitura") expect(TOOL_EXECUTORS[t.name], t.name).toBeDefined();
      else expect(TOOL_EXECUTORS[t.name], t.name).toBeUndefined();
    }
  });

  it("toda ferramenta de ESCRITA tem receita de proposta, e nenhuma de leitura tem", () => {
    for (const t of AI_TOOL_REGISTRY) {
      const receita = PROPOSTAS_POR_FERRAMENTA[t.name];
      if (t.kind === "escrita") expect(receita, t.name).toBeDefined();
      else expect(receita, t.name).toBeUndefined();
    }
  });

  it("todo executor e toda receita têm ferramenta no registry", () => {
    const nomes = new Set(AI_TOOL_REGISTRY.map((t) => t.name));
    for (const nome of Object.keys(TOOL_EXECUTORS)) expect(nomes.has(nome), nome).toBe(true);
    for (const nome of Object.keys(PROPOSTAS_POR_FERRAMENTA)) {
      expect(nomes.has(nome), nome).toBe(true);
    }
  });

  /**
   * O `command` declarado no descriptor tem de existir no registry de commands. Sem este
   * teste, o defeito só apareceria DEPOIS de o dono confirmar — em `COMMAND_DESCONHECIDO`,
   * no pior momento possível para descobrir.
   */
  it("o command declarado por cada escrita existe no registry de commands", () => {
    const conhecidos = new Set(ACTION_COMMANDS.map((c) => c.name));
    for (const t of AI_TOOL_REGISTRY.filter((x) => x.kind === "escrita")) {
      expect(conhecidos.has(t.command ?? ""), `${t.name} → ${t.command}`).toBe(true);
    }
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A TELA PRECISA SABER NOMEAR O QUE FOI CONSULTADO.                                     ║
 * ║                                                                                       ║
 * ║ `ROTULO_DA_FERRAMENTA` é `Record<string, string>` porque `ToolDescriptor.name` é       ║
 * ║ `string` — não há união fechada para um `satisfies` travar, como em                    ║
 * ║ `ROTULO_DA_ROTA_DE_CONTEXTO`. Então a cobertura é conferida AQUI, sobre o registry     ║
 * ║ real: ferramenta nova sem rótulo apareceria na trilha como `training.get_algo`, que é  ║
 * ║ o identificador interno vazando para o usuário.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("rótulos de apresentação (18-B)", () => {
  it("toda ferramenta do registry tem rótulo em pt-BR", () => {
    for (const t of AI_TOOL_REGISTRY) {
      const rotulo = ROTULO_DA_FERRAMENTA[t.name];
      expect(rotulo, t.name).toBeDefined();
      expect(rotulo, t.name).not.toBe("");
      // O rótulo não pode ser o próprio identificador: isso é o fallback, não um rótulo.
      expect(rotulo, t.name).not.toBe(t.name);
    }
  });

  it("nenhum rótulo sobra apontando para ferramenta que não existe mais", () => {
    const nomes = new Set(AI_TOOL_REGISTRY.map((t) => t.name));
    for (const nome of Object.keys(ROTULO_DA_FERRAMENTA)) {
      expect(nomes.has(nome), nome).toBe(true);
    }
  });

  it("ferramenta desconhecida cai no identificador, sem quebrar a tela", () => {
    expect(rotuloDaFerramenta("modulo.que_saiu_do_registry")).toBe(
      "modulo.que_saiu_do_registry",
    );
  });
});

/**
 * `toolsForPermission` é o que decide se a chave de um módulo é clicável na tela de
 * preferências. Uma lista escrita à mão de "módulos prontos" ficaria para trás no dia em que
 * a primeira leitura de outro módulo entrasse — e a tela continuaria dizendo "ainda não".
 */
describe("toolsForPermission — o que cada flag `allow_*` de fato libera", () => {
  it("allow_training libera exatamente as ferramentas de Treinos do registry", () => {
    const nomes = toolsForPermission("allow_training").map((t) => t.name);
    expect(nomes).toEqual(
      AI_TOOL_REGISTRY.filter((t) => t.requiredPermission === "allow_training").map(
        (t) => t.name,
      ),
    );
    expect(nomes.length).toBeGreaterThan(0);
  });

  it("permissão sem ferramenta nenhuma devolve lista vazia — a chave é botão fantasma", () => {
    for (const p of TOOL_PERMISSIONS) {
      const tem = AI_TOOL_REGISTRY.some((t) => t.requiredPermission === p);
      expect(toolsForPermission(p).length > 0, p).toBe(tem);
    }
  });

  it("descriptor incoerente NÃO conta como leitura disponível", () => {
    // `maxRecords: 0` é incoerente (zero não é "sem limite"), e uma ferramenta incoerente é
    // rejeitada pelo guard — habilitar a chave por causa dela prometeria o que não roda.
    const incoerentes = AI_TOOL_REGISTRY.filter((t) => !isToolDescriptorCoherent(t));
    expect(incoerentes).toEqual([]);
  });
});

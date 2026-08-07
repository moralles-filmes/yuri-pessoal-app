/**
 * Fase 18-A/18-B — IA · Tool Registry ESTÁTICO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA LISTA É A ÚNICA MANEIRA DE UMA FERRAMENTA EXISTIR.                               ║
 * ║                                                                                       ║
 * ║ Nada é montado em runtime, nada nasce de texto do modelo e nada é acrescentado por    ║
 * ║ configuração. O que não está aqui não é oferecido ao provedor e não tem executor do   ║
 * ║ outro lado.                                                                            ║
 * ║                                                                                       ║
 * ║ Se AINDA ASSIM o provedor devolver um evento de tool call fora do que foi oferecido,  ║
 * ║ o chat-runner encerra o run como `failed` com `UNEXPECTED_TOOL_CALL`: não executa,    ║
 * ║ não interpreta como ferramenta válida e não deixa o run seguir como se nada fosse.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A 18-A nasceu VAZIA de propósito — a fronteira ficou pronta e testada antes da primeira
 * leitura. A 18-B povoou com as três ferramentas de Treinos, **todas de leitura**: escrita é
 * 18-C e o `guard` rejeita `kind: "escrita"` até lá.
 *
 * Puro: nenhum I/O, nenhuma função executora. O mapa nome → executor mora em `executors.ts`,
 * que é `server-only`; a bijeção entre os dois é garantida por teste.
 */

import type { AiToolDefinition } from "@/lib/ai/core/contracts";
import {
  isToolDescriptorCoherent,
  type ToolDescriptor,
  type ToolPermission,
} from "./contracts";

export const AI_TOOL_REGISTRY: readonly ToolDescriptor[] = [
  {
    name: "training.get_last_workout",
    version: "1",
    module: "training",
    kind: "leitura",
    risk: 1,
    description:
      "Devolve o último treino registrado, com os totais já calculados pelo sistema (volume, séries, repetições) e a lista de exercícios. Use quando a pergunta for sobre o treino mais recente. Não faça contas: os números já vêm somados.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos"],
    requiredPermission: "allow_training",
    timeoutMs: 8_000,
    maxRecords: 50,
    // Os `itens` desta ferramenta são os EXERCÍCIOS de um treino só — não treinos.
    itemLabel: "exercícios do treino",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "training.get_volume",
    version: "1",
    module: "training",
    kind: "leitura",
    risk: 1,
    description:
      "Totais de treino de um período recente (volume em kg, repetições, tempo sob tensão, séries por grupo muscular), já agregados pelo sistema. Informe `dias` para o tamanho da janela; o padrão é 7. Período sem treino devolve contagem zero e diz que é ausência de registro.",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Tamanho da janela em dias, terminando hoje. Padrão: 7.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos"],
    requiredPermission: "allow_training",
    timeoutMs: 12_000,
    // 200 é o teto de LISTA; quem manda de verdade num período longo é o orçamento de
    // caracteres do bloco não confiável, aplicado no executor (`MAX_UNTRUSTED_CHARS`).
    maxRecords: 200,
    itemLabel: "sessões de treino",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "training.get_records",
    version: "1",
    module: "training",
    kind: "leitura",
    risk: 1,
    description:
      "Recordes pessoais consolidados, opcionalmente filtrados por nome de exercício. Valores de 1RM são ESTIMATIVA e vêm com a fórmula usada — diga isso ao relatar.",
    inputSchema: {
      type: "object",
      properties: {
        exercicio: {
          type: "string",
          maxLength: 80,
          description: "Parte do nome do exercício, para filtrar.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos"],
    requiredPermission: "allow_training",
    timeoutMs: 8_000,
    maxRecords: 100,
    itemLabel: "recordes",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ───────────────────────────── 18-C · Lote 1 · TO-DO ─────────────────────────────
  {
    name: "todo.get_agenda",
    version: "1",
    module: "todo",
    kind: "leitura",
    risk: 1,
    description:
      "O que está atrasado, o que é para hoje e o que vem nos próximos dias no TO-DO, com os totais já contados pelo sistema. Informe `dias` para a janela dos próximos; o padrão é 7. O status de atraso é calculado na leitura — não faça essa conta.",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          minimum: 1,
          maximum: 90,
          description: "Janela dos próximos dias, a partir de amanhã. Padrão: 7.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    timeoutMs: 10_000,
    maxRecords: 100,
    itemLabel: "tarefas",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "todo.search_tasks",
    version: "1",
    module: "todo",
    kind: "leitura",
    risk: 1,
    description:
      "Procura tarefas do TO-DO por texto no título ou na descrição. A busca do módulo diferencia acentos — se não achar, diga isso em vez de afirmar que a tarefa não existe. Concluídas só entram com `incluir_concluidas`.",
    inputSchema: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          maxLength: 120,
          description: "Trecho do título ou da descrição.",
        },
        incluir_concluidas: {
          type: "boolean",
          description: "Incluir tarefas já concluídas ou canceladas. Padrão: false.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "tarefas",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "todo.get_projects",
    version: "1",
    module: "todo",
    kind: "leitura",
    risk: 1,
    description:
      "Os projetos ativos do TO-DO com as contagens de tarefas abertas, atrasadas e concluídas de cada um, já somadas pelo sistema.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    timeoutMs: 8_000,
    maxRecords: 60,
    itemLabel: "projetos",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ──────────────────────────── 18-C · Lote 1 · Hábitos ────────────────────────────
  {
    name: "habits.get_today",
    version: "1",
    module: "habits",
    kind: "leitura",
    risk: 1,
    description:
      "Os hábitos ativos e a situação de hoje: quais caem hoje, quais já foram concluídos e quanto falta para a meta do dia. Um hábito que não cai hoje NÃO é uma falha, e um hábito de hoje ainda não feito não é uma falha — o dia está em andamento. A água também é registrada aqui.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["habitos"],
    requiredPermission: "allow_habits",
    timeoutMs: 8_000,
    maxRecords: 60,
    itemLabel: "hábitos",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "habits.get_streaks",
    version: "1",
    module: "habits",
    kind: "leitura",
    risk: 1,
    description:
      "Sequências atuais e recordes de cada hábito, mais a consistência de 7 e 30 dias já calculada. Quando a taxa vier nula, não havia dia agendado na janela — isso não é 0% de conclusão, e dizer que é seria falso.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["habitos"],
    requiredPermission: "allow_habits",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "hábitos",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ──────────────────────────── 18-C · Lote 1 · Estudos ────────────────────────────
  {
    name: "studies.get_courses",
    version: "1",
    module: "studies",
    kind: "leitura",
    risk: 1,
    description:
      "Os cursos com progresso, aulas concluídas, minutos estudados e próxima aula. Curso atrasado vem com o MOTIVO do atraso — passou da data-alvo é diferente de ficar dias sem estudar. Use `apenas_em_andamento` quando a pergunta for sobre o que está sendo estudado agora.",
    inputSchema: {
      type: "object",
      properties: {
        apenas_em_andamento: {
          type: "boolean",
          description: "Trazer só os cursos em andamento. Padrão: false (traz todos).",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["estudos"],
    requiredPermission: "allow_studies",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "cursos",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "studies.get_study_time",
    version: "1",
    module: "studies",
    kind: "leitura",
    risk: 1,
    description:
      "Tempo de estudo da semana e do mês, sequência de dias e a série semanal de minutos, já somados pelo sistema. Zero minutos aqui é medição real (não houve sessão), não ausência de dado.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["estudos"],
    requiredPermission: "allow_studies",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "semanas",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ───────────────────────────── 18-C · Lote 2 · Agenda ─────────────────────────────
  {
    name: "calendar.get_upcoming",
    version: "1",
    module: "calendar",
    kind: "leitura",
    risk: 1,
    description:
      "Os próximos compromissos da agenda, com recorrências já expandidas pelo sistema. Informe `dias` para o horizonte; o padrão é 14. Datas e horários vêm no fuso de Brasília — use exatamente como vieram.",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          minimum: 1,
          maximum: 180,
          description: "Horizonte em dias a partir de agora. Padrão: 14.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["agenda"],
    requiredPermission: "allow_calendar",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "compromissos",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "calendar.get_day",
    version: "1",
    module: "calendar",
    kind: "leitura",
    risk: 1,
    description:
      "Os compromissos de um dia específico (formato AAAA-MM-DD; ausente = hoje), com recorrências já expandidas. Dia sem compromisso é ausência de evento cadastrado — diga isso em vez de afirmar que o dia está livre para outros fins.",
    inputSchema: {
      type: "object",
      properties: {
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Data no formato AAAA-MM-DD. Ausente: hoje.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["agenda"],
    requiredPermission: "allow_calendar",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "compromissos",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ─────────────────────── 18-C · Lote 2 · Tarefas e Rotinas ───────────────────────
  {
    name: "tasks.get_pending",
    version: "1",
    module: "tasks",
    kind: "leitura",
    risk: 1,
    description:
      "Tarefas abertas do módulo TAREFAS E ROTINAS (Fase 09, rota /tarefas) — que NÃO é o TO-DO: são dados separados. Já vêm ordenadas como na tela (atrasadas primeiro) e com o status de atraso calculado na leitura. Sempre diga de qual dos dois módulos o número veio.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["tarefas"],
    requiredPermission: "allow_tasks",
    timeoutMs: 10_000,
    maxRecords: 80,
    itemLabel: "tarefas",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "tasks.get_routines_today",
    version: "1",
    module: "tasks",
    kind: "leitura",
    risk: 1,
    description:
      "As rotinas ativas e o check-in de hoje, com sequência e aderência de 7 dias. Rotina que não cai hoje NÃO é pendência, e rotina de hoje ainda não feita não é falha — o dia está em andamento. Taxa nula significa que não houve dia agendado, não 0%.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["tarefas"],
    requiredPermission: "allow_tasks",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "rotinas",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ─────────────────── 18-C · Lote 2 · Medidas corporais (módulo central) ───────────────
  // ⚠️ SEM AGENTE PRÓPRIO: `body_*` não tem rota nem módulo de tela — o mesmo dado aparece
  // em Dieta e em Treinos. A allowlist é dos dois agentes (o de Dieta entra no Lote 3), e a
  // permissão exigida é `allow_body`. O guard confere a permissão da FERRAMENTA, não a do
  // agente, então um agente de Treinos com `allow_training` ligada e `allow_body` desligada
  // continua sem alcançar estas duas.
  {
    name: "body.get_latest",
    version: "1",
    module: "body",
    kind: "leitura",
    risk: 1,
    description:
      "A medição mais recente de cada tipo de medida corporal configurado (peso, circunferências etc.), com a data. Tipos nunca medidos são listados à parte: ausência de medição NÃO é zero, e não entra em conta nenhuma. Relate o valor sem julgá-lo: não diga qual valor seria o correto e não classifique o resultado.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos"],
    requiredPermission: "allow_body",
    timeoutMs: 8_000,
    maxRecords: 40,
    itemLabel: "medidas",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "body.get_series",
    version: "1",
    module: "body",
    kind: "leitura",
    risk: 1,
    description:
      "O histórico de uma medida corporal num período (informe parte do nome, ex.: peso, cintura). A variação vem calculada entre a primeira e a última medição REGISTRADAS; com uma medição só ela vem nula — isso é 'sem base', nunca variação zero. Não calcule médias nem tendências por conta própria.",
    inputSchema: {
      type: "object",
      properties: {
        medida: {
          type: "string",
          maxLength: 60,
          description: "Parte do nome da medida (ex.: peso, cintura, braço).",
        },
        dias: {
          type: "integer",
          minimum: 2,
          maximum: 730,
          description: "Tamanho da janela em dias, terminando hoje. Padrão: 90.",
        },
      },
      required: ["medida"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos", "dieta"],
    requiredPermission: "allow_body",
    timeoutMs: 10_000,
    maxRecords: 120,
    itemLabel: "medições",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ─────────────────────────── 18-C · Lote 3 · Financeiro ───────────────────────────
  {
    name: "finance.get_balances",
    version: "1",
    module: "finance",
    kind: "leitura",
    risk: 1,
    description:
      "Saldo de cada conta ativa e o total, em reais. ATENÇÃO: lançamento de cartão de crédito NÃO move saldo de conta — quem move é o pagamento da fatura. Nunca some este saldo com o valor de faturas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["financeiro"],
    requiredPermission: "allow_finance",
    timeoutMs: 8_000,
    maxRecords: 40,
    itemLabel: "contas",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "finance.get_spending",
    version: "1",
    module: "finance",
    kind: "leitura",
    risk: 1,
    description:
      "Resumo financeiro de um mês (AAAA-MM; ausente = mês atual): entradas, saídas, quanto é seu e quanto é de terceiros, cartão × à vista, a receber e contas a pagar. Todos os totais já vêm somados pelo sistema — não refaça nenhuma conta. `meu` + `de terceiros` = `saídas`, e `cartão` + `à vista` = `saídas`: são partições, não parcelas a somar.",
    inputSchema: {
      type: "object",
      properties: {
        mes: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}$",
          description: "Mês no formato AAAA-MM. Ausente: o mês atual.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["financeiro"],
    requiredPermission: "allow_finance",
    timeoutMs: 15_000,
    maxRecords: 1,
    itemLabel: "resumos do mês",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "finance.get_invoice",
    version: "1",
    module: "finance",
    kind: "leitura",
    risk: 1,
    description:
      "As próximas faturas de cartão, com total, quanto é seu, quanto é de terceiros e o status (aberta, fechada, atrasada ou paga) — todos derivados na leitura pela regra de fechamento do sistema. Fatura marcada como projetada ainda não existe: é a estimativa do próximo ciclo e vai mudar.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["financeiro"],
    requiredPermission: "allow_finance",
    timeoutMs: 15_000,
    maxRecords: 20,
    itemLabel: "faturas",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ─────────────────────────────── 18-C · Lote 3 · Dieta ───────────────────────────────
  {
    name: "nutrition.get_day",
    version: "1",
    module: "nutrition",
    kind: "leitura",
    risk: 1,
    description:
      "O consumo de um dia (AAAA-MM-DD; ausente = hoje): macros somados a partir do registro congelado, progresso contra a meta que valia NAQUELE dia, e as refeições com registro. Cada número vem com a sua qualidade: quando for `parcial`, o total é um PISO — diga 'pelo menos'. Dia sem registro é ausência de dado, nunca zero caloria.",
    inputSchema: {
      type: "object",
      properties: {
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Data no formato AAAA-MM-DD. Ausente: hoje.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["dieta"],
    requiredPermission: "allow_nutrition",
    timeoutMs: 15_000,
    maxRecords: 30,
    itemLabel: "refeições",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "nutrition.get_period",
    version: "1",
    module: "nutrition",
    kind: "leitura",
    risk: 1,
    description:
      "O consumo de um período recente (informe `dias`; padrão 7): total dos macros e quantos dias tiveram registro. Esta ferramenta NÃO calcula média diária de propósito — dia sem registro é ausência de dado, e dividir por dias sem registro produziria um número falso. Se pedirem média, aponte os relatórios de Dieta.",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          minimum: 2,
          maximum: 90,
          description: "Tamanho da janela em dias, terminando hoje. Padrão: 7.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["dieta"],
    requiredPermission: "allow_nutrition",
    timeoutMs: 20_000,
    maxRecords: 90,
    itemLabel: "dias com registro",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "nutrition.get_goals",
    version: "1",
    module: "nutrition",
    kind: "leitura",
    risk: 1,
    description:
      "As metas nutricionais vigentes hoje, com alvo, mínimo e máximo por nutriente. Elas foram definidas PELO USUÁRIO: não sugira alterá-las, não avalie se estão adequadas e não proponha valores.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["dieta"],
    requiredPermission: "allow_nutrition",
    timeoutMs: 10_000,
    maxRecords: 40,
    itemLabel: "metas de nutriente",
    requiresConfirmation: false,
    idempotent: true,
  },
];

export function findTool(name: string): ToolDescriptor | null {
  return AI_TOOL_REGISTRY.find((t) => t.name === name) ?? null;
}

/**
 * As ferramentas que uma flag `allow_*` de fato libera — DERIVADO do registry, nunca uma
 * segunda lista.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ É o que impede a tela de preferências de virar botão fantasma. Ligar `allow_finance`   ║
 * ║ hoje não libera nada: não existe ferramenta de Finanças. Uma lista escrita à mão de    ║
 * ║ "módulos prontos" ficaria para trás no dia em que a 18-C acrescentasse a primeira —    ║
 * ║ e a tela continuaria dizendo "ainda não" sobre uma leitura que já funciona.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function toolsForPermission(
  permission: ToolPermission,
): readonly ToolDescriptor[] {
  return AI_TOOL_REGISTRY.filter(
    (t) => t.requiredPermission === permission && isToolDescriptorCoherent(t),
  );
}

/**
 * As definições que vão para o provedor, dada a allowlist do agente e as permissões do usuário.
 *
 * Repare na ordem: a allowlist do agente é aplicada sobre o registry, e o registry é a fonte.
 * Um nome na allowlist que não exista no registry simplesmente não vira ferramenta — não há
 * caminho para uma ferramenta nascer de um nome.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ `permissions` ENTROU NA 18-C, E NÃO É REDUNDANTE COM O GUARD.                       ║
 * ║                                                                                       ║
 * ║ O guard continua sendo a decisão de SEGURANÇA, na execução — nada aqui o substitui, e  ║
 * ║ uma ferramenta oferecida por engano continuaria sendo recusada lá. Este filtro resolve ║
 * ║ outro problema: o que o modelo VÊ.                                                     ║
 * ║                                                                                       ║
 * ║ Um agente pode ter na allowlist ferramentas de módulos com permissões DIFERENTES — o   ║
 * ║ de Treinos tem as três de `training` (`allow_training`) e as duas de `body`            ║
 * ║ (`allow_body`). Oferecer uma ferramenta que a flag do usuário vai recusar faz o modelo ║
 * ║ pedi-la, gastar um dos 3 passos por tentativa e receber uma negativa — a cada pergunta.║
 * ║ Não oferecer o que não pode ser executado é o que mantém o laço útil.                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function toolDefinitionsFor(
  allowedToolNames: readonly string[],
  permissions: Readonly<Partial<Record<ToolPermission, boolean>>>,
): AiToolDefinition[] {
  return AI_TOOL_REGISTRY.filter(
    (t) =>
      allowedToolNames.includes(t.name) &&
      isToolDescriptorCoherent(t) &&
      permissions[t.requiredPermission] === true,
  ).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/** Código de erro do run quando o provedor chama uma ferramenta que não foi oferecida. */
export const UNEXPECTED_TOOL_CALL = "UNEXPECTED_TOOL_CALL";

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
  type ToolWritePermission,
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
  // ───────────────────── 18-C · Bloco 4 · TO-DO · AS DUAS PRIMEIRAS ESCRITAS ─────────────
  // ⚠️ Nenhuma delas ESCREVE dentro do run. Elas preparam uma proposta e param; quem executa
  // é uma Server Action, depois de o dono confirmar na tela. Ver `approval/proposals.ts`.
  {
    name: "todo.criar_tarefa",
    version: "1",
    module: "todo",
    kind: "escrita",
    risk: 2,
    description:
      "PREPARA a criação de uma tarefa no TO-DO e devolve uma proposta para o usuário confirmar na tela — NADA é criado por esta chamada. Informe `projeto` pelo nome só se o usuário citou um; nome que não existir cancela a proposta. Ela não cria etiqueta, subtarefa nem recorrência. Depois de chamá-la, diga que a tarefa está aguardando confirmação, e NUNCA afirme que ela foi criada.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", maxLength: 300, description: "O título da tarefa." },
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Data programada (AAAA-MM-DD). Ausente: a tarefa fica sem data.",
        },
        horario: {
          type: "string",
          pattern: "^\\d{2}:\\d{2}$",
          description: "Horário (HH:MM), no fuso de Brasília. Só com data.",
        },
        prazo: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Prazo final (AAAA-MM-DD). Não pode ser anterior à data programada.",
        },
        prioridade: {
          type: "integer",
          minimum: 1,
          maximum: 4,
          description: "1 é a mais alta, 4 a mais baixa. Ausente: 4.",
        },
        projeto: {
          type: "string",
          maxLength: 120,
          description: "NOME de um projeto existente do TO-DO. Ausente: Caixa de entrada.",
        },
      },
      required: ["titulo"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    requiredWritePermission: "allow_write_todo",
    // Criar tarefa não toca dinheiro, saúde nem histórico consolidado. A lista vazia é uma
    // DECLARAÇÃO — `undefined` seria omissão, e a coerência recusa omissão.
    sensibilidades: [],
    command: "criarTarefaTodo",
    timeoutMs: 10_000,
    // Escrita não devolve lista; o teto existe porque o contrato o exige de toda ferramenta,
    // e zero seria incoerente. A proposta é uma só.
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
    // A CHAMADA é idempotente porque não escreve nada — duas chamadas fazem duas propostas, e
    // proposta não é efeito. Quem garante que o EFEITO acontece uma vez é a aprovação de uso
    // único no banco, e não este campo.
    idempotent: true,
  },
  {
    name: "todo.concluir_tarefa",
    version: "1",
    module: "todo",
    kind: "escrita",
    risk: 2,
    description:
      "PREPARA a conclusão de uma tarefa do TO-DO e devolve uma proposta para o usuário confirmar — NADA é concluído por esta chamada. `tarefa_id` tem de vir de uma consulta anterior; nunca invente um id. Numa tarefa RECORRENTE, concluir não fecha a tarefa: ela avança para a próxima data, e a proposta mostra qual. Depois de chamá-la, diga que a conclusão aguarda confirmação.",
    inputSchema: {
      type: "object",
      properties: {
        tarefa_id: {
          type: "string",
          description: "O id da tarefa, vindo de uma consulta anterior do TO-DO.",
        },
      },
      required: ["tarefa_id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    requiredWritePermission: "allow_write_todo",
    sensibilidades: [],
    command: "concluirTarefaTodo",
    timeoutMs: 10_000,
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
    idempotent: true,
  },
  {
    name: "todo.reagendar_tarefa",
    version: "1",
    module: "todo",
    kind: "escrita",
    risk: 2,
    description:
      "PREPARA a mudança de data de uma tarefa existente do TO-DO e devolve uma proposta para o usuário confirmar — NADA é alterado por esta chamada. `tarefa_id` tem de vir de uma consulta anterior (a busca de tarefas devolve os ids); nunca invente um id. Numa tarefa recorrente, muda só a ocorrência atual. Depois de chamá-la, diga que a mudança aguarda confirmação.",
    inputSchema: {
      type: "object",
      properties: {
        tarefa_id: {
          type: "string",
          description: "O id da tarefa, vindo de uma consulta anterior do TO-DO.",
        },
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "A nova data programada (AAAA-MM-DD).",
        },
      },
      required: ["tarefa_id", "data"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    requiredWritePermission: "allow_write_todo",
    sensibilidades: [],
    command: "reagendarTarefaTodo",
    timeoutMs: 10_000,
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
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
  // ────────────────── 18-C · Bloco 4 · Hábitos · a escrita ──────────────────
  {
    name: "habits.registrar",
    version: "1",
    module: "habits",
    kind: "escrita",
    risk: 2,
    description:
      "PREPARA o registro de um hábito num dia e devolve uma proposta para o usuário confirmar — NADA é registrado por esta chamada. Informe o hábito pelo NOME, como ele aparece na lista. Sem `valor`, o dia é marcado como concluído com a meta cheia. O registro SUBSTITUI o valor do dia, não soma a ele — a proposta mostra o que já havia. Data futura não é aceita. Depois de chamá-la, diga que o registro aguarda confirmação.",
    inputSchema: {
      type: "object",
      properties: {
        habito: {
          type: "string",
          maxLength: 120,
          description: "NOME de um hábito ativo, como aparece na lista de hábitos.",
        },
        valor: {
          type: "number",
          minimum: 0,
          description:
            "Quanto foi feito, na unidade do hábito (copos, minutos, páginas). Ausente: a meta cheia.",
        },
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Dia do registro (AAAA-MM-DD). Ausente: hoje. Nunca no futuro.",
        },
      },
      required: ["habito"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["habitos"],
    requiredPermission: "allow_habits",
    requiredWritePermission: "allow_write_habits",
    /**
     * ⚠️ Hábito NÃO é declarado como dado de saúde, e a decisão é consciente. `habits` guarda
     * o que o dono escolheu acompanhar (água, leitura, sono) — é registro de rotina, não
     * medição clínica. O que é dado de saúde no sistema são `body_*` e o diário alimentar, e
     * nenhum dos dois tem ferramenta de escrita nesta subfase.
     */
    sensibilidades: [],
    command: "registrarHabito",
    timeoutMs: 10_000,
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
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
  // ────────────────── 18-C · Bloco 4 · Agenda · a escrita que SAI DO SISTEMA ──────────────
  {
    name: "calendar.criar_evento",
    version: "1",
    module: "calendar",
    kind: "escrita",
    /**
     * ⚠️ RISCO 3 — o primeiro. Não porque um compromisso valha mais que uma tarefa, mas
     * porque com o Google conectado o efeito atravessa a fronteira do sistema: ele vai para o
     * calendário do dono lá fora e para os aparelhos dele. A previsão diz isso antes de o
     * dono confirmar.
     */
    risk: 3,
    description:
      "PREPARA a criação de um compromisso na agenda e devolve uma proposta para o usuário confirmar — NADA é criado por esta chamada. Informe a data e a hora COMO O USUÁRIO DISSE, no relógio de Brasília: nunca converta para UTC e nunca monte data com hora em ISO. Sem `hora_inicio`, marque `dia_inteiro`; sem os dois, a proposta é cancelada. Sem `hora_fim`, o compromisso dura uma hora. Ela não cria repetição nem lembrete. Depois de chamá-la, diga que o compromisso aguarda confirmação, e NUNCA afirme que ele foi criado.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", maxLength: 200, description: "O título do compromisso." },
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "O dia do compromisso (AAAA-MM-DD).",
        },
        hora_inicio: {
          type: "string",
          pattern: "^\\d{2}:\\d{2}$",
          description:
            "Hora de início (HH:MM) no relógio de Brasília. Obrigatória, exceto se `dia_inteiro` for true.",
        },
        hora_fim: {
          type: "string",
          pattern: "^\\d{2}:\\d{2}$",
          description: "Hora de fim (HH:MM), no mesmo dia. Ausente: uma hora depois do início.",
        },
        dia_inteiro: {
          type: "boolean",
          description: "true para compromisso sem horário. Nesse caso, as horas são ignoradas.",
        },
        local: { type: "string", maxLength: 300, description: "Onde acontece." },
        descricao: { type: "string", maxLength: 2000, description: "Detalhes do compromisso." },
        /**
         * ⚠️ A lista está ESCRITA, e não importada de `@/lib/calendar/constants` — o teste de
         * fronteira proíbe `tools/` de importar módulo do usuário, e ele está certo: o
         * registry é a superfície que vai ao provedor, não um consumidor do domínio.
         *
         * A duplicação que isso cria é vigiada por teste (`registry.test.ts` compara esta
         * lista com `EVENT_TYPES`), porque um tipo novo na Agenda que não chegasse aqui faria
         * o modelo oferecer um valor que o Zod do command recusaria — falha silenciosa,
         * invisível em revisão, e repetida a cada pergunta.
         */
        tipo: {
          type: "string",
          enum: ["pessoal", "trabalho", "estudos", "exercicios", "rotina"],
          description: "Classificação do compromisso. Ausente: pessoal.",
        },
      },
      required: ["titulo", "data"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["agenda"],
    requiredPermission: "allow_calendar",
    requiredWritePermission: "allow_write_calendar",
    /**
     * ⚠️ `externo` porque o efeito NÃO fica no sistema quando o Google está conectado. É a
     * primeira ferramenta com uma sensibilidade declarada, e a lista deixou de ser vazia por
     * um motivo concreto — não por precaução genérica.
     */
    sensibilidades: ["externo"],
    command: "criarEvento",
    timeoutMs: 12_000,
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
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
  // ───────── 18-C · Bloco 4 · Financeiro · a última escrita, e a de maior risco ─────────
  {
    name: "finance.lancar_transacao",
    version: "1",
    module: "finance",
    kind: "escrita",
    risk: 3,
    /**
     * ⚠️ A descrição enumera o que a ferramenta NÃO faz, e isso não é excesso de zelo: sem
     * essa lista, o modelo tentaria parcelar ("em 3x") e dividir ("metade é do João") porque
     * o usuário vai pedir exatamente assim. Ele precisa saber dizer "isso eu não faço" em vez
     * de silenciosamente lançar só a primeira metade do pedido.
     */
    description:
      "PREPARA um lançamento financeiro à vista e devolve uma proposta para o usuário confirmar — NADA é lançado por esta chamada. Informe a conta OU o cartão pelo nome, nunca os dois. `valor` é em reais, como o usuário disse (45.90), NUNCA em centavos. Ela NÃO faz parcelamento, NÃO divide com terceiros, NÃO faz transferência entre contas, NÃO paga fatura e NÃO altera nem exclui lançamento existente — se o usuário pedir qualquer um desses, diga que isso é pela tela do Financeiro. Depois de chamá-la, diga que o lançamento aguarda confirmação, e NUNCA afirme que ele foi feito.",
    inputSchema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["despesa", "receita"],
          description: "despesa (saída) ou receita (entrada).",
        },
        valor: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Valor em REAIS (ex.: 45.90). Nunca em centavos.",
        },
        descricao: {
          type: "string",
          maxLength: 200,
          description: "O que foi o gasto ou a entrada.",
        },
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Data do lançamento (AAAA-MM-DD). Ausente: hoje.",
        },
        conta: {
          type: "string",
          maxLength: 120,
          description: "NOME da conta. Use para dinheiro, débito ou pix. Excludente com cartão.",
        },
        cartao: {
          type: "string",
          maxLength: 120,
          description:
            "NOME do cartão de crédito. Só para despesa; a compra entra na fatura, não no saldo.",
        },
        categoria: {
          type: "string",
          maxLength: 120,
          description:
            "NOME de uma categoria existente. Ausente: o lançamento entra sem categoria — não escolha uma por conta própria.",
        },
      },
      required: ["tipo", "valor", "descricao"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["financeiro"],
    requiredPermission: "allow_finance",
    requiredWritePermission: "allow_write_finance",
    sensibilidades: ["dinheiro"],
    command: "lancarTransacao",
    timeoutMs: 15_000,
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
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
  // ─────────── 18-C · Bloco 4 · Dieta · a escrita em HISTÓRICO IMUTÁVEL ───────────
  {
    name: "nutrition.registrar_consumo",
    version: "1",
    module: "nutrition",
    kind: "escrita",
    risk: 3,
    description:
      "PREPARA o registro de um alimento no diário alimentar e devolve uma proposta para o usuário confirmar — NADA é registrado por esta chamada. Informe o alimento, a medida e a refeição pelos NOMES; nome que casar com mais de um cancela a proposta, e você deve perguntar qual. Sem `medida`, a quantidade é na unidade base do alimento (g ou ml). Data futura não é aceita. A proposta mostra os valores nutricionais que serão congelados — não os calcule, não os estime e não os comente. Depois de chamá-la, diga que o registro aguarda confirmação.",
    inputSchema: {
      type: "object",
      properties: {
        alimento: {
          type: "string",
          maxLength: 120,
          description: "NOME do alimento, como aparece no catálogo de Dieta.",
        },
        quantidade: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Quanto foi consumido, na medida informada (ou na unidade base).",
        },
        medida: {
          type: "string",
          maxLength: 80,
          description:
            "NOME de uma medida caseira cadastrada para esse alimento (ex.: colher de sopa). Ausente: a unidade base (g ou ml).",
        },
        refeicao: {
          type: "string",
          maxLength: 80,
          description: "NOME da refeição (ex.: Almoço, Café da manhã), como na lista do diário.",
        },
        data: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Dia do consumo (AAAA-MM-DD). Ausente: hoje. Nunca no futuro.",
        },
      },
      required: ["alimento", "quantidade", "refeicao"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["dieta"],
    requiredPermission: "allow_nutrition",
    requiredWritePermission: "allow_write_nutrition",
    /**
     * ⚠️ AS DUAS SENSIBILIDADES, e nenhuma delas é decorativa.
     *
     * `saude` — o diário alimentar é dado de saúde, e é o exemplo que o próprio contrato cita.
     * `historico_consolidado` — o registro CONGELA os nutrientes (invariante 9 do módulo): o
     * total do dia passa a somar aquele jsonb para sempre, e editar o alimento no catálogo
     * depois não o altera. Não existe "corrigir": existe apagar e registrar de novo.
     */
    sensibilidades: ["saude", "historico_consolidado"],
    command: "registrarConsumo",
    timeoutMs: 15_000,
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
    idempotent: true,
  },

  // ─────────────────────── 18-F · Bloco 3 · Memória (a 8ª escrita) ───────────────────────
  {
    name: "memory.lembrar",
    version: "1",
    module: "memory",
    kind: "escrita",
    /**
     * ⚠️ RISCO 2, e não 3. O risco descreve o efeito sobre os REGISTROS do dono, e este efeito
     * não toca nenhum: ele cria uma linha em `ai_*`, sem dinheiro, sem saúde, sem histórico
     * consolidado e sem nada saindo do sistema. O que torna a memória delicada é outra coisa —
     * ela entra no prompt —, e isso é tratado onde acontece (`memory/prompt.ts`), não com um
     * número aqui.
     */
    risk: 2,
    /**
     * ⚠️ A RESTRIÇÃO DE ASSUNTO É DESCRITA PELO LADO POSITIVO, e isso é a invariante 30
     * funcionando: o teste de vocabulário proibido varre o texto inteiro e não distingue uso
     * negado — e está certo, porque a frase literal no contexto a torna mais provável de sair.
     * Dizer o que PODE ser proposto, em vez de listar assuntos a evitar, é mais estreito e não
     * planta nenhuma palavra no prompt.
     */
    description:
      "PREPARA uma preferência para a memória do assistente e devolve uma proposta para o usuário confirmar — NADA é salvo por esta chamada. Use só quando ele pedir explicitamente para lembrar de algo daqui em diante; nunca por conta própria. Escreva a preferência na voz dele, em UMA frase de até 300 caracteres, sem endereço de site e sem chave de acesso. Proponha só preferência de USO: como ele quer ser atendido, que unidade prefere, que formato de resposta gosta, por onde começar. A memória guarda preferência, não informação sobre ele nem sobre outras pessoas — se ele pedir para guardar informação, diga isso e não chame esta ferramenta. Informe `modulo` quando a preferência valer para um módulo só. Depois de chamá-la, diga que a memória aguarda confirmação.",
    inputSchema: {
      type: "object",
      properties: {
        conteudo: {
          type: "string",
          maxLength: 300,
          description:
            "A preferência, em UMA frase, na voz do usuário. Sem quebra de linha, sem endereço, sem chave.",
        },
        modulo: {
          type: "string",
          // ⚠️ Repete `MODULOS_DE_MEMORIA` porque `inputSchema` é JSON Schema literal e este
          // arquivo não importa de `memory/`. `registry.test.ts` compara os dois.
          enum: [
            "finance",
            "nutrition",
            "training",
            "body",
            "todo",
            "calendar",
            "tasks",
            "habits",
            "studies",
          ],
          description:
            "Informe quando a preferência valer só para um módulo. Ausente: vale para todas as conversas.",
        },
        expira_em: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description:
            "Dia em que a preferência deixa de valer (AAAA-MM-DD), quando ela for temporária. Ausente: sem prazo.",
        },
      },
      required: ["conteudo"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    /**
     * ⚠️ OS OITO ESPECIALISTAS, e NÃO o orquestrador. O prompt dele afirma, literalmente, que
     * ele "não consegue criar, editar nem excluir nada" — com uma ferramenta de escrita aqui,
     * essa frase vira mentira, e incluí-lo custaria reescrevê-la, subir `assistente-pessoal-v2`
     * para `v3` e trocar a invariante 74. O que se perde: preferência dita numa conversa geral
     * não vira proposta. O que cobre: a tela `/ia/memoria`, onde o dono escreve a preferência
     * global ele mesmo — e o texto de lá diz isso.
     *
     * Um agente novo que entre no registry entra AQUI junto, ou o teste dos dois sentidos
     * (`allowedAgents` × allowlist) fica vermelho.
     */
    allowedAgents: [
      "treinos",
      "todo",
      "habitos",
      "estudos",
      "agenda",
      "tarefas",
      "financeiro",
      "dieta",
    ],
    requiredPermission: "allow_memory",
    requiredWritePermission: "allow_write_memory",
    // Não toca dinheiro, saúde, histórico consolidado, e nada sai do sistema.
    sensibilidades: [],
    command: "lembrarPreferencia",
    timeoutMs: 10_000,
    maxRecords: 1,
    itemLabel: "propostas",
    requiresConfirmation: true,
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
 * 18-C · Bloco 4 — o mesmo, para as chaves de ESCRITA.
 *
 * Quatro das cinco `allow_write_*` não liberam nada hoje (só o TO-DO tem ferramenta de
 * escrita). A tela de preferências usa esta função para não oferecer um botão que não liga
 * nada — e para começar a oferecê-lo, sozinha, no commit em que a ferramenta nascer.
 */
export function toolsForWritePermission(
  permission: ToolWritePermission,
): readonly ToolDescriptor[] {
  return AI_TOOL_REGISTRY.filter(
    (t) => t.requiredWritePermission === permission && isToolDescriptorCoherent(t),
  );
}

/** As ferramentas de escrita publicadas — usado pelos testes de honestidade dos textos. */
export function writeTools(): readonly ToolDescriptor[] {
  return AI_TOOL_REGISTRY.filter((t) => t.kind === "escrita" && isToolDescriptorCoherent(t));
}

/**
 * De qual chave de LEITURA uma chave de escrita depende — DERIVADO do registry.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Uma segunda tabela escrita à mão (`allow_write_todo → allow_todo`) pareceria óbvia e   ║
 * ║ envelheceria na primeira exceção. `body_*` já provou que a simetria "um módulo, uma    ║
 * ║ chave" não se sustenta: quem atende as medidas é o agente de Treinos, e a permissão    ║
 * ║ exigida é `allow_body`. Aqui vale o mesmo — quem sabe qual leitura a escrita exige é o ║
 * ║ próprio descriptor, que declara as duas.                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `null` quando a chave ainda não tem ferramenta — a tela já a mantém desabilitada nesse caso.
 */
export function permissaoDeLeituraDaEscrita(
  permission: ToolWritePermission,
): ToolPermission | null {
  return toolsForWritePermission(permission)[0]?.requiredPermission ?? null;
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
  /**
   * 18-C · Bloco 4 — as chaves de escrita, pelo MESMO motivo do parágrafo acima. Uma
   * ferramenta de escrita oferecida com a chave desligada faz o modelo pedi-la, queimar um
   * dos 3 passos da tentativa e receber `TOOL_WRITE_DISABLED` — a cada pergunta.
   *
   * O padrão é o objeto VAZIO, e não `permissions`: um chamador que esqueça o argumento fica
   * sem escrita nenhuma, nunca com escrita herdada da chave de leitura.
   */
  writePermissions: Readonly<Partial<Record<ToolWritePermission, boolean>>> = {},
): AiToolDefinition[] {
  return AI_TOOL_REGISTRY.filter(
    (t) =>
      allowedToolNames.includes(t.name) &&
      isToolDescriptorCoherent(t) &&
      permissions[t.requiredPermission] === true &&
      (t.kind !== "escrita" ||
        (t.requiredWritePermission !== undefined &&
          writePermissions[t.requiredWritePermission] === true)),
  ).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/** Código de erro do run quando o provedor chama uma ferramenta que não foi oferecida. */
export const UNEXPECTED_TOOL_CALL = "UNEXPECTED_TOOL_CALL";

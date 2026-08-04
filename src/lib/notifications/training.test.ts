/**
 * Fase 17-F — as 9 famílias de notificação do módulo Treinos.
 *
 * O que estes testes travam, além do comportamento de cada família:
 *  • rodar o Cron duas ou três vezes NÃO duplica (`dedupe_key` determinístico);
 *  • nenhum título ou descrição usa vocabulário de cobrança;
 *  • nada aqui é `high`/`urgent` — treino não é emergência;
 *  • toda notificação oferece um caminho (link);
 *  • o usuário consegue desligar qualquer uma delas (`filterByPrefs`);
 *  • `training_goal_progress` nasce DESLIGADO (opt-in).
 */
import { describe, expect, it } from "vitest";
import {
  generateTrainingNotifications,
  shortTime,
  timeToMinutes,
  type TrainingGenInput,
} from "./training";
import { filterByPrefs, generateNotifications, selectNewCandidates } from "./generate";
import { NOTIFICATION_TYPES, isOptInNotification } from "./constants";

const HOJE = "2026-08-06"; // quinta-feira

const planned = (over: Partial<TrainingGenInput["planned"] extends (infer T)[] | undefined ? T : never> = {}) => ({
  id: "sched-1",
  scheduledDate: HOJE,
  entryKind: "treino",
  status: "planejado",
  plannedTime: null as string | null,
  label: "Treino A — Empurrar",
  hasSession: false,
  ...over,
});

const TUDO: TrainingGenInput = {
  todayIso: HOJE,
  minutosAgora: 18 * 60, // 18:00
  nowMs: Date.UTC(2026, 7, 6, 21, 0, 0), // 18:00 BRT
  planned: [
    planned({ id: "hoje", plannedTime: "19:00" }),
    planned({ id: "atrasado", scheduledDate: "2026-08-04", label: "Treino B — Puxar" }),
    planned({ id: "descanso", entryKind: "descanso", label: "Descanso" }),
    planned({ id: "concluido", status: "concluido" }),
    planned({ id: "com-sessao", hasSession: true }),
  ],
  openSession: {
    id: "sess-1",
    label: "Treino C — Pernas",
    startedAtMs: Date.UTC(2026, 7, 6, 15, 0, 0), // 6 horas antes
  },
  records: [
    {
      id: "rec-1",
      recordKey: "ex-1:peso_maximo",
      exerciseName: "Supino reto com barra",
      typeLabel: "Maior carga",
      valueLabel: "80 kg",
      achievedOn: HOJE,
      previousLabel: "77,5 kg",
    },
  ],
  goals: [
    {
      id: "meta-atingida",
      name: "3 treinos por semana",
      derivedStatus: "atingida",
      rangeFrom: "2026-08-03",
      endsOn: null,
      percent: 100,
      progressLabel: "3 de 3 treinos",
      isShortPeriod: true,
    },
    {
      id: "meta-andamento",
      name: "Volume semanal",
      derivedStatus: "ativa",
      rangeFrom: "2026-08-03",
      endsOn: null,
      percent: 40,
      progressLabel: "8.000 de 20.000 kg",
      isShortPeriod: true,
    },
    {
      id: "meta-prazo",
      name: "Peso no agachamento",
      derivedStatus: "em_atraso",
      rangeFrom: "2026-06-01",
      endsOn: "2026-08-09",
      percent: 60,
      progressLabel: "100 de 120 kg",
      isShortPeriod: false,
    },
  ],
  programs: [{ id: "prog-1", name: "Push/Pull/Legs", endsOn: "2026-08-10" }],
};

const tipos = (input: TrainingGenInput) =>
  generateTrainingNotifications(input).map((c) => c.type);

describe("planejamento", () => {
  it("treino de hoje gera aviso uma vez por dia", () => {
    const candidatos = generateTrainingNotifications({
      ...TUDO,
      planned: [planned({ id: "hoje" })],
      openSession: null,
      records: [],
      goals: [],
      programs: [],
    });
    expect(candidatos.map((c) => c.type)).toEqual(["training_planned_today"]);
    expect(candidatos[0].dedupe_key).toBe(`training_planned_today:hoje:${HOJE}`);
  });

  it("dia de DESCANSO nunca gera aviso", () => {
    const candidatos = generateTrainingNotifications({
      ...TUDO,
      planned: [planned({ id: "d", entryKind: "descanso" })],
      openSession: null,
      records: [],
      goals: [],
      programs: [],
    });
    expect(candidatos).toHaveLength(0);
  });

  it("planejamento já resolvido (concluído, cancelado, não realizado, reagendado) não avisa", () => {
    for (const status of ["concluido", "cancelado", "nao_realizado", "reagendado"]) {
      const candidatos = generateTrainingNotifications({
        ...TUDO,
        planned: [planned({ id: "x", status })],
        openSession: null,
        records: [],
        goals: [],
        programs: [],
      });
      expect(candidatos, status).toHaveLength(0);
    }
  });

  it("dia com sessão registrada não vira lembrete — o treino já aconteceu", () => {
    const candidatos = generateTrainingNotifications({
      ...TUDO,
      planned: [planned({ id: "x", hasSession: true })],
      openSession: null,
      records: [],
      goals: [],
      programs: [],
    });
    expect(candidatos).toHaveLength(0);
  });

  it("o horário se aproximando gera o aviso só dentro da janela", () => {
    const comHorario = (minutosAgora: number) =>
      tipos({
        ...TUDO,
        minutosAgora,
        planned: [planned({ id: "h", plannedTime: "19:00" })],
        openSession: null,
        records: [],
        goals: [],
        programs: [],
      });

    // 18:00 → faltam 60 min (dentro dos 90 padrão).
    expect(comHorario(18 * 60)).toContain("training_session_soon");
    // 16:00 → faltam 180 min.
    expect(comHorario(16 * 60)).not.toContain("training_session_soon");
    // 19:30 → o horário já passou; "está chegando" deixa de fazer sentido.
    expect(comHorario(19 * 60 + 30)).not.toContain("training_session_soon");
  });

  it("sem horário definido não existe 'está chegando'", () => {
    expect(
      tipos({
        ...TUDO,
        planned: [planned({ id: "h", plannedTime: null })],
        openSession: null,
        records: [],
        goals: [],
        programs: [],
      }),
    ).not.toContain("training_session_soon");
  });

  it("treino que ficou para trás vira 'em aberto' dentro da janela e some depois", () => {
    const emAberto = (data: string) =>
      tipos({
        ...TUDO,
        planned: [planned({ id: "a", scheduledDate: data })],
        openSession: null,
        records: [],
        goals: [],
        programs: [],
      });

    expect(emAberto("2026-08-04")).toContain("training_planned_missed"); // 2 dias
    expect(emAberto("2026-07-20")).not.toContain("training_planned_missed"); // antigo demais
    expect(emAberto("2026-08-10")).toHaveLength(0); // futuro: nada a lembrar ainda
  });
});

describe("sessão em execução", () => {
  const semResto = { planned: [], records: [], goals: [], programs: [] };

  it("avisa só depois da janela de horas", () => {
    const base = { ...TUDO, ...semResto };
    const recente = generateTrainingNotifications({
      ...base,
      openSession: { id: "s", label: "Treino", startedAtMs: base.nowMs - 30 * 60_000 },
    });
    expect(recente).toHaveLength(0);

    const antiga = generateTrainingNotifications({
      ...base,
      openSession: { id: "s", label: "Treino", startedAtMs: base.nowMs - 5 * 3_600_000 },
    });
    expect(antiga.map((c) => c.type)).toEqual(["training_session_open"]);
    // Uma vez por sessão: um fato único, não um evento diário.
    expect(antiga[0].dedupe_key).toBe("training_session_open:s");
  });
});

describe("recordes", () => {
  const semResto = { planned: [], openSession: null, goals: [], programs: [] };

  it("avisa a marca recente e cita a anterior sem sugerir carga", () => {
    const [candidato] = generateTrainingNotifications({ ...TUDO, ...semResto });
    expect(candidato.type).toBe("training_record");
    expect(candidato.description).toContain("80 kg");
    expect(candidato.description).toContain("77,5 kg");
    expect(candidato.dedupe_key).toBe(`training_record:ex-1:peso_maximo:${HOJE}`);
  });

  it("marca antiga não vira notificação", () => {
    const candidatos = generateTrainingNotifications({
      ...TUDO,
      ...semResto,
      records: [{ ...TUDO.records![0], achievedOn: "2026-07-01" }],
    });
    expect(candidatos).toHaveLength(0);
  });

  it("uma sessão excelente não vira dez notificações", () => {
    const muitos = Array.from({ length: 9 }, (_, i) => ({
      ...TUDO.records![0],
      id: `rec-${i}`,
      recordKey: `ex-${i}:peso_maximo`,
    }));
    const candidatos = generateTrainingNotifications({ ...TUDO, ...semResto, records: muitos });
    expect(candidatos.length).toBeLessThanOrEqual(3);
  });
});

describe("metas", () => {
  const semResto = { planned: [], openSession: null, records: [], programs: [] };

  it("meta atingida avisa uma vez por JANELA — semanal atingida duas semanas avisa duas", () => {
    const semana1 = generateTrainingNotifications({
      ...TUDO,
      ...semResto,
      goals: [TUDO.goals![0]],
    });
    const semana2 = generateTrainingNotifications({
      ...TUDO,
      ...semResto,
      goals: [{ ...TUDO.goals![0], rangeFrom: "2026-08-10" }],
    });
    expect(semana1[0].dedupe_key).not.toBe(semana2[0].dedupe_key);
  });

  it("meta atingida não gera também aviso de andamento", () => {
    const t = tipos({ ...TUDO, ...semResto, goals: [TUDO.goals![0]] });
    expect(t).toEqual(["training_goal_reached"]);
  });

  it("andamento só para meta de período curto e com valor apurado", () => {
    const comValor = tipos({ ...TUDO, ...semResto, goals: [TUDO.goals![1]] });
    expect(comValor).toContain("training_goal_progress");

    // AUSÊNCIA DE DADO NÃO É ZERO: sem percentual apurado, nenhum aviso de progresso.
    const semValor = tipos({
      ...TUDO,
      ...semResto,
      goals: [{ ...TUDO.goals![1], percent: null, progressLabel: null }],
    });
    expect(semValor).not.toContain("training_goal_progress");

    const longa = tipos({
      ...TUDO,
      ...semResto,
      goals: [{ ...TUDO.goals![1], isShortPeriod: false }],
    });
    expect(longa).not.toContain("training_goal_progress");
  });

  it("prazo chegando avisa uma vez por prazo", () => {
    const candidatos = generateTrainingNotifications({
      ...TUDO,
      ...semResto,
      goals: [TUDO.goals![2]],
    });
    const prazo = candidatos.find((c) => c.type === "training_goal_deadline");
    expect(prazo?.dedupe_key).toBe("training_goal_deadline:meta-prazo:2026-08-09");
  });

  it("meta pausada, cancelada ou expirada não vira lembrete de prazo", () => {
    for (const status of ["pausada", "cancelada", "expirada", "concluida"]) {
      const t = tipos({
        ...TUDO,
        ...semResto,
        goals: [{ ...TUDO.goals![2], derivedStatus: status }],
      });
      expect(t, status).toHaveLength(0);
    }
  });
});

describe("programa perto do fim", () => {
  it("avisa dentro da janela e não avisa depois de terminado", () => {
    const semResto = { planned: [], openSession: null, records: [], goals: [] };
    const dentro = tipos({ ...TUDO, ...semResto });
    expect(dentro).toEqual(["training_program_ending"]);

    const passado = tipos({
      ...TUDO,
      ...semResto,
      programs: [{ id: "p", name: "X", endsOn: "2026-07-01" }],
    });
    expect(passado).toHaveLength(0);
  });
});

describe("idempotência do Cron", () => {
  it("rodar duas e três vezes não duplica nenhuma família", () => {
    const primeira = generateTrainingNotifications(TUDO);
    expect(primeira.length).toBeGreaterThan(0);

    const chaves = new Set(primeira.map((c) => c.dedupe_key));
    expect(chaves.size).toBe(primeira.length); // sem colisão dentro do próprio lote

    const segunda = selectNewCandidates(generateTrainingNotifications(TUDO), chaves);
    expect(segunda).toHaveLength(0);

    const terceira = selectNewCandidates(generateTrainingNotifications(TUDO), chaves);
    expect(terceira).toHaveLength(0);
  });

  it("entra pelo gerador geral com o mesmo contrato", () => {
    const candidatos = generateNotifications({
      todayIso: HOJE,
      nowMs: TUDO.nowMs,
      training: TUDO,
    });
    expect(candidatos.some((c) => c.type.startsWith("training_"))).toBe(true);
    // Sem a entrada, o módulo não gera nada — nenhum efeito colateral no resto do sistema.
    expect(
      generateNotifications({ todayIso: HOJE, nowMs: TUDO.nowMs }).some((c) =>
        c.type.startsWith("training_"),
      ),
    ).toBe(false);
  });
});

describe("tom: lembrete não é cobrança", () => {
  const PROIBIDO = [
    "falhou",
    "falhando",
    "fracass",
    "de novo",
    "mais uma vez",
    "você não",
    "você deveria",
    "precisa parar",
    "preguiç",
    "desculpa",
    "culpa",
    "vergonha",
    "esqueceu",
    "errado",
    "ruim",
    "faltou",
    "sedentár",
  ];

  it("nenhum título ou descrição usa vocabulário de cobrança", () => {
    const candidatos = generateTrainingNotifications({
      ...TUDO,
      // Os cenários de atraso são os mais tentadores de escrever com culpa.
      planned: [
        planned({ id: "a1", scheduledDate: "2026-08-03" }),
        planned({ id: "a2", scheduledDate: "2026-08-05" }),
      ],
    });
    expect(candidatos.length).toBeGreaterThan(0);
    for (const c of candidatos) {
      const texto = `${c.title} ${c.description ?? ""}`.toLocaleLowerCase("pt-BR");
      for (const termo of PROIBIDO) {
        expect(texto, `"${c.title}" — termo proibido: ${termo}`).not.toContain(termo);
      }
    }
  });

  it("nada aqui é alto ou urgente — treino não é emergência", () => {
    for (const c of generateTrainingNotifications(TUDO)) {
      expect(["low", "medium"], c.type).toContain(c.priority);
    }
  });

  it("toda notificação oferece um caminho (link) em vez de só constatar", () => {
    for (const c of generateTrainingNotifications(TUDO)) {
      expect(c.link, c.type).toBeTruthy();
      expect(c.link?.startsWith("/treinos"), c.type).toBe(true);
    }
  });

  it("nenhuma notificação prescreve carga, volume ou alvo", () => {
    const PRESCRICAO = ["tente", "aumente", "você deve", "recomendamos", "o ideal"];
    for (const c of generateTrainingNotifications(TUDO)) {
      const texto = `${c.title} ${c.description ?? ""}`.toLocaleLowerCase("pt-BR");
      for (const termo of PRESCRICAO) {
        expect(texto, `"${c.title}" — prescrição: ${termo}`).not.toContain(termo);
      }
    }
  });
});

describe("preferências desligam qualquer tipo", () => {
  it("cada família some quando o usuário desliga", () => {
    const candidatos = generateTrainingNotifications(TUDO);
    for (const c of candidatos) {
      const restantes = filterByPrefs(candidatos, { [c.type]: false });
      expect(restantes.some((r) => r.type === c.type), c.type).toBe(false);
    }
  });

  it("desligar tudo entrega zero", () => {
    const prefs = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, false]));
    expect(filterByPrefs(generateTrainingNotifications(TUDO), prefs)).toHaveLength(0);
  });

  it("o acompanhamento de meta nasce DESLIGADO (opt-in)", () => {
    expect(isOptInNotification("training_goal_progress")).toBe(true);
    const semPrefs = filterByPrefs(generateTrainingNotifications(TUDO), null);
    expect(semPrefs.some((c) => c.type === "training_goal_progress")).toBe(false);

    const ligado = filterByPrefs(generateTrainingNotifications(TUDO), {
      training_goal_progress: true,
    });
    expect(ligado.some((c) => c.type === "training_goal_progress")).toBe(true);
  });

  it("as outras famílias nascem LIGADAS — um lembrete precisa existir sem configuração", () => {
    const semPrefs = filterByPrefs(generateTrainingNotifications(TUDO), null).map((c) => c.type);
    expect(semPrefs).toContain("training_planned_today");
    expect(semPrefs).toContain("training_record");
    expect(semPrefs).toContain("training_goal_reached");
  });
});

describe("helpers de horário", () => {
  it("lê 'HH:mm' e 'HH:mm:ss' e recusa lixo", () => {
    expect(timeToMinutes("19:30")).toBe(19 * 60 + 30);
    expect(timeToMinutes("07:05:00")).toBe(7 * 60 + 5);
    expect(timeToMinutes("99:99")).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
    expect(shortTime("07:05:00")).toBe("07:05");
    expect(shortTime(null)).toBe("");
  });
});

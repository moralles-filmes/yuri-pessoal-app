/**
 * Fase 16-F — as 8 famílias de notificação da Dieta.
 *
 * O que estes testes existem para travar:
 *  1. IDEMPOTÊNCIA — rodar o gerador duas vezes e passar por `selectNewCandidates` não pode
 *     produzir duas notificações. É o requisito explícito da subfase.
 *  2. SEM LINGUAGEM DE CULPA — nenhum texto gerado contém vocabulário de cobrança.
 *  3. AUSÊNCIA ≠ ZERO — despensa "acabou" (0) não vence; despensa "não sei quanto" (null) sim.
 *  4. A preferência do usuário desliga QUALQUER tipo, e o opt-in nasce desligado.
 */
import { describe, expect, it } from "vitest";
import { generateNutritionNotifications, type GenNutritionMeal } from "./nutrition";
import { filterByPrefs, selectNewCandidates } from "./generate";
import { NOTIFICATION_TYPES } from "./constants";
import { notificationEnabled } from "@/lib/settings/constants";
import { VOCABULARIO_DE_COBRANCA } from "@/lib/tone/vocabulary";

const HOJE = "2026-08-04"; // terça-feira
const MEIO_DIA = 12 * 60;

/** Roda o gerador duas vezes e devolve o que sobreviveria ao dedupe do Cron. */
function rodarDuasVezes(input: Parameters<typeof generateNutritionNotifications>[0]) {
  const primeira = generateNutritionNotifications(input);
  const inseridas = selectNewCandidates(primeira, new Set());
  const chaves = new Set(inseridas.map((c) => c.dedupe_key));
  const segunda = generateNutritionNotifications(input);
  const novas = selectNewCandidates(segunda, chaves);
  return { primeira, inseridas, novas };
}

const refeicao = (over: Partial<GenNutritionMeal> = {}): GenNutritionMeal => ({
  id: "meal-1",
  origin: "diario",
  date: HOJE,
  mealName: "Almoço",
  plannedTime: "12:30",
  status: "planejada",
  entries: 0,
  ...over,
});

describe("nutrition: próxima refeição", () => {
  it("avisa dentro da janela e não avisa antes dela", () => {
    const dentro = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA, // 12:00, almoço 12:30 → faltam 30 min
      meals: [refeicao()],
    });
    expect(dentro.map((c) => c.type)).toContain("nutrition_meal_upcoming");

    const cedoDemais = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: 8 * 60, // 08:00 → faltam 4h30
      meals: [refeicao()],
    });
    expect(cedoDemais).toHaveLength(0);
  });

  it("não avisa refeição que já tem item registrado", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      meals: [refeicao({ entries: 2 })],
    });
    expect(out).toHaveLength(0);
  });

  it("refeição sem horário nunca entra em 'próxima'", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      meals: [refeicao({ plannedTime: null })],
    });
    expect(out).toHaveLength(0);
  });
});

describe("nutrition: refeição sem registro", () => {
  it("só dispara depois da tolerância de 45 min da 16-B", () => {
    const dentroDaTolerancia = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: 12 * 60 + 60, // 13:00 → 30 min de atraso
      meals: [refeicao()],
    });
    expect(dentroDaTolerancia.map((c) => c.type)).not.toContain("nutrition_meal_missing");

    const atrasada = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: 14 * 60, // 14:00 → 90 min de atraso
      meals: [refeicao()],
    });
    expect(atrasada.map((c) => c.type)).toContain("nutrition_meal_missing");
  });

  it("um desfecho declarado encerra o assunto — 'não consumida' não vira cobrança", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: 14 * 60,
      meals: [refeicao({ status: "nao_consumida" })],
    });
    expect(out).toHaveLength(0);
  });

  it("oferece as DUAS saídas (registrar ou marcar como não consumida)", () => {
    const [aviso] = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: 14 * 60,
      meals: [refeicao()],
    });
    expect(aviso.description).toContain("registrar");
    expect(aviso.description).toContain("não consumida");
  });

  it("refeição de dia passado sem desfecho aparece com a data", () => {
    const [aviso] = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: 9 * 60,
      meals: [refeicao({ date: "2026-08-01", plannedTime: null })],
    });
    expect(aviso.type).toBe("nutrition_meal_missing");
    expect(aviso.description).toContain("01/08/2026");
  });
});

describe("nutrition: planejamento da semana", () => {
  it("avisa quando a semana que vem está vazia e já está perto", () => {
    const out = generateNutritionNotifications({
      todayIso: "2026-08-08", // sábado; a semana seguinte começa 10/08
      minutosAgora: MEIO_DIA,
      weekPlan: { weekStart: "2026-08-10", plannedMeals: 0 },
    });
    expect(out).toHaveLength(1);
    expect(out[0].dedupe_key).toBe("nutrition_plan_week:2026-08-10");
  });

  it("não avisa quando já existe planejamento", () => {
    const out = generateNutritionNotifications({
      todayIso: "2026-08-08",
      minutosAgora: MEIO_DIA,
      weekPlan: { weekStart: "2026-08-10", plannedMeals: 7 },
    });
    expect(out).toHaveLength(0);
  });

  it("não avisa com uma semana de antecedência", () => {
    const out = generateNutritionNotifications({
      todayIso: "2026-08-03",
      minutosAgora: MEIO_DIA,
      weekPlan: { weekStart: "2026-08-10", plannedMeals: 0 },
    });
    expect(out).toHaveLength(0);
  });

  it("diz que planejar é opcional (o diário funciona sem plano)", () => {
    const [aviso] = generateNutritionNotifications({
      todayIso: "2026-08-08",
      minutosAgora: MEIO_DIA,
      weekPlan: { weekStart: "2026-08-10", plannedMeals: 0 },
    });
    expect(aviso.description).toContain("opcional");
  });
});

describe("nutrition: lista de compras", () => {
  const lista = { id: "l1", name: "Semana", status: "ativa", isArchived: false, pendingItems: 4 };

  it("avisa lista ativa com itens a pegar", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      shoppingLists: [lista],
    });
    expect(out).toHaveLength(1);
    expect(out[0].title).toContain("4 itens");
  });

  it("ignora lista arquivada, concluída ou sem pendência", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      shoppingLists: [
        { ...lista, id: "a", isArchived: true },
        { ...lista, id: "b", status: "concluida" },
        { ...lista, id: "c", pendingItems: 0 },
      ],
    });
    expect(out).toHaveLength(0);
  });

  it("a chave é semanal — uma lista aberta há um mês não vira 30 avisos", () => {
    const segunda = generateNutritionNotifications({
      todayIso: "2026-08-03",
      minutosAgora: MEIO_DIA,
      shoppingLists: [lista],
    });
    const quarta = generateNutritionNotifications({
      todayIso: "2026-08-05",
      minutosAgora: MEIO_DIA,
      shoppingLists: [lista],
    });
    expect(segunda[0].dedupe_key).toBe(quarta[0].dedupe_key);

    // Na semana seguinte, o assunto volta.
    const semanaQueVem = generateNutritionNotifications({
      todayIso: "2026-08-11",
      minutosAgora: MEIO_DIA,
      shoppingLists: [lista],
    });
    expect(semanaQueVem[0].dedupe_key).not.toBe(segunda[0].dedupe_key);
  });
});

describe("nutrition: validade na despensa", () => {
  const item = { id: "p1", label: "Iogurte", expiresOn: "2026-08-06", quantity: 2 };

  it("avisa dentro da janela e classifica vencido com prioridade maior", () => {
    const perto = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      pantry: [item],
    });
    expect(perto[0].type).toBe("nutrition_pantry_expiring");
    expect(perto[0].priority).toBe("low");

    const vencido = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      pantry: [{ ...item, expiresOn: "2026-08-01" }],
    });
    expect(vencido[0].priority).toBe("medium");
    expect(vencido[0].title).toContain("passou da validade");
  });

  it("quantidade ZERO ('acabou') não vence; NULA ('não sei quanto') vence", () => {
    const acabou = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      pantry: [{ ...item, quantity: 0 }],
    });
    expect(acabou).toHaveLength(0);

    const naoSei = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      pantry: [{ ...item, quantity: null }],
    });
    expect(naoSei).toHaveLength(1);
  });

  it("item sem validade informada nunca gera aviso", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      pantry: [{ ...item, expiresOn: null }],
    });
    expect(out).toHaveLength(0);
  });

  it("repor o item (validade nova) permite um aviso novo", () => {
    const antigo = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      pantry: [item],
    });
    const reposto = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      pantry: [{ ...item, expiresOn: "2026-08-08" }],
    });
    expect(reposto[0].dedupe_key).not.toBe(antigo[0].dedupe_key);
  });
});

describe("nutrition: medida pendente", () => {
  it("avisa depois de 7 dias sem medição e não antes", () => {
    const recente = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      measurements: [{ typeId: "t1", typeName: "Peso", lastMeasuredOn: "2026-08-01" }],
    });
    expect(recente).toHaveLength(0);

    const antiga = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      measurements: [{ typeId: "t1", typeName: "Peso", lastMeasuredOn: "2026-07-20" }],
    });
    expect(antiga).toHaveLength(1);
    expect(antiga[0].type).toBe("nutrition_measurement_due");
  });

  it("nunca medido é dito como ausência, não como zero", () => {
    const [aviso] = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      measurements: [{ typeId: "t1", typeName: "Peso", lastMeasuredOn: null }],
    });
    expect(aviso.description).toContain("Ainda não há nenhuma medição");
  });
});

describe("nutrition: meta do dia por perto (opt-in)", () => {
  const meta = {
    code: "energia",
    label: "Energia",
    unit: "kcal",
    amount: 1800,
    target: 2000,
    quality: "exato" as const,
  };

  it("dispara entre 85% e 100% da meta", () => {
    const perto = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      goalProgress: [meta],
    });
    expect(perto).toHaveLength(1);

    const longe = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      goalProgress: [{ ...meta, amount: 900 }],
    });
    expect(longe).toHaveLength(0);
  });

  it("passou da meta NÃO gera aviso — não é papel do sistema repreender", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      goalProgress: [{ ...meta, amount: 2400 }],
    });
    expect(out).toHaveLength(0);
  });

  it("total parcial é anunciado como piso, não como medida exata", () => {
    const [aviso] = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      goalProgress: [{ ...meta, quality: "parcial" }],
    });
    expect(aviso.description).toContain("mínimo conhecido");
  });

  it("nasce DESLIGADO: sem preferência explícita, nada é entregue", () => {
    const candidatos = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      goalProgress: [meta],
    });
    expect(filterByPrefs(candidatos, {})).toHaveLength(0);
    expect(filterByPrefs(candidatos, { nutrition_goal_close: true })).toHaveLength(1);
  });
});

describe("nutrition: alimento a revisar", () => {
  it("explica o motivo e limita o lote", () => {
    const out = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      foodsToReview: [
        { id: "f1", name: "Bolo caseiro", reason: "sem_fonte" },
        { id: "f2", name: "Pão", reason: "sem_energia" },
        { id: "f3", name: "Sopa", reason: "em_revisao" },
        { id: "f4", name: "Torta", reason: "sem_fonte" },
        { id: "f5", name: "Suco", reason: "sem_fonte" },
      ],
    });
    expect(out).toHaveLength(3);
    expect(out[0].description).toContain("sem fonte registrada");
  });

  it("o motivo compõe a chave: resolver um e perder outro são fatos diferentes", () => {
    const semFonte = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      foodsToReview: [{ id: "f1", name: "Bolo", reason: "sem_fonte" }],
    });
    const semEnergia = generateNutritionNotifications({
      todayIso: HOJE,
      minutosAgora: MEIO_DIA,
      foodsToReview: [{ id: "f1", name: "Bolo", reason: "sem_energia" }],
    });
    expect(semFonte[0].dedupe_key).not.toBe(semEnergia[0].dedupe_key);
  });
});

/* ═══════════════════════════ Regras transversais ═══════════════════════════ */

/** Uma entrada que aciona TODAS as 8 famílias de uma vez. */
const TUDO = {
  todayIso: HOJE,
  minutosAgora: MEIO_DIA,
  meals: [
    refeicao({ id: "m1", plannedTime: "12:30" }), // próxima
    refeicao({ id: "m2", date: "2026-08-01", plannedTime: null }), // sem registro
  ],
  weekPlan: { weekStart: "2026-08-05", plannedMeals: 0 },
  shoppingLists: [
    { id: "l1", name: "Semana", status: "ativa", isArchived: false, pendingItems: 3 },
  ],
  pantry: [{ id: "p1", label: "Iogurte", expiresOn: "2026-08-06", quantity: 2 }],
  measurements: [{ typeId: "t1", typeName: "Peso", lastMeasuredOn: "2026-07-01" }],
  goalProgress: [
    {
      code: "energia",
      label: "Energia",
      unit: "kcal",
      amount: 1800,
      target: 2000,
      quality: "exato" as const,
    },
  ],
  foodsToReview: [{ id: "f1", name: "Bolo", reason: "sem_fonte" as const }],
};

describe("nutrition: idempotência (o requisito explícito da subfase)", () => {
  it("as 8 famílias aparecem", () => {
    const tipos = new Set(generateNutritionNotifications(TUDO).map((c) => c.type));
    expect(tipos).toEqual(
      new Set([
        "nutrition_meal_upcoming",
        "nutrition_meal_missing",
        "nutrition_plan_week",
        "nutrition_shopping_pending",
        "nutrition_pantry_expiring",
        "nutrition_measurement_due",
        "nutrition_goal_close",
        "nutrition_food_review",
      ]),
    );
  });

  it("rodar o Cron 2× com os mesmos dados não cria nenhuma notificação nova", () => {
    const { inseridas, novas } = rodarDuasVezes(TUDO);
    expect(inseridas.length).toBe(8);
    expect(novas).toHaveLength(0);
  });

  it("rodar 3× também não duplica", () => {
    const chaves = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      for (const c of selectNewCandidates(generateNutritionNotifications(TUDO), chaves)) {
        chaves.add(c.dedupe_key);
      }
    }
    expect(chaves.size).toBe(8);
  });

  it("nenhuma chave se repete dentro do mesmo lote", () => {
    const chaves = generateNutritionNotifications(TUDO).map((c) => c.dedupe_key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("nenhuma chave carrega hora, índice de laço ou aleatoriedade", () => {
    for (const c of generateNutritionNotifications(TUDO)) {
      expect(c.dedupe_key).not.toMatch(/\d{2}:\d{2}/);
      expect(c.dedupe_key).toMatch(/^[\w:.\-/]+$/);
    }
  });
});

describe("nutrition: sem linguagem de culpa", () => {
  /**
   * Vocabulário de cobrança que NÃO pode aparecer num módulo sobre comida e corpo.
   *
   * ⚠️ 18-E: a lista saiu daqui e virou `@/lib/tone/vocabulary` — declarada UMA vez. Ela
   * estava duplicada aqui e em `training.test.ts`, com conteúdos DIFERENTES, e uma terceira
   * cópia (a do validador de insights) divergiria das duas. Agora este teste varre a união,
   * que é mais exigente do que a lista que estava aqui.
   */
  const PROIBIDO = VOCABULARIO_DE_COBRANCA;

  it("nenhum título ou descrição usa vocabulário de cobrança", () => {
    const candidatos = generateNutritionNotifications({
      ...TUDO,
      // Também os cenários de "atraso", que são os mais tentadores de escrever com culpa.
      minutosAgora: 23 * 60,
      pantry: [{ id: "p1", label: "Iogurte", expiresOn: "2026-07-20", quantity: null }],
      measurements: [{ typeId: "t1", typeName: "Peso", lastMeasuredOn: null }],
    });
    expect(candidatos.length).toBeGreaterThan(0);
    for (const c of candidatos) {
      const texto = `${c.title} ${c.description ?? ""}`.toLocaleLowerCase("pt-BR");
      for (const termo of PROIBIDO) {
        expect(texto, `"${c.title}" — termo proibido: ${termo}`).not.toContain(termo);
      }
    }
  });

  it("nenhuma notificação da Dieta é urgente ou alta — nada aqui é emergência", () => {
    for (const c of generateNutritionNotifications(TUDO)) {
      expect(["low", "medium"]).toContain(c.priority);
    }
  });

  it("toda notificação oferece um caminho (link) em vez de só constatar", () => {
    for (const c of generateNutritionNotifications(TUDO)) {
      expect(c.link, c.type).toBeTruthy();
    }
  });
});

describe("nutrition: preferências desligam qualquer tipo", () => {
  it("cada uma das 8 famílias some quando o usuário desliga", () => {
    const candidatos = generateNutritionNotifications(TUDO);
    for (const c of candidatos) {
      const restantes = filterByPrefs(candidatos, { [c.type]: false });
      expect(restantes.some((r) => r.type === c.type), c.type).toBe(false);
    }
  });

  it("desligar tudo entrega zero", () => {
    const prefs = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, false]));
    expect(filterByPrefs(generateNutritionNotifications(TUDO), prefs)).toHaveLength(0);
  });

  it("os tipos não-opt-in continuam ligados por omissão (nada regrediu)", () => {
    expect(notificationEnabled({}, "invoice_overdue")).toBe(true);
    expect(notificationEnabled({}, "nutrition_meal_missing")).toBe(true);
    expect(notificationEnabled({}, "nutrition_goal_close")).toBe(false);
  });
});

/**
 * Fase 18-C — IA · O que a ferramenta de Estudos relata bate com o que a tela mostra.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ OS DOIS CASOS QUE ESTE ARQUIVO EXISTE PARA FIXAR                                      ║
 * ║                                                                                       ║
 * ║ 1. "Atrasado" tem DOIS motivos — passou da data-alvo ou ficou dias sem sessão. Achatar ║
 * ║    os dois em "atrasado" faz a resposta cobrar prazo de quem só ficou uma semana sem   ║
 * ║    estudar.                                                                            ║
 * ║ 2. Meta semanal ausente NÃO é meta de zero minutos — e zero minutos estudados É        ║
 * ║    medição real. As duas coisas parecem iguais e não são.                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudyCourseStats, StudyDashboard } from "@/types/database";

const HOJE = "2026-08-07";

let painelFalso: StudyDashboard = painel([]);

vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hojeISO: () => HOJE,
}));

vi.mock("@/lib/studies/queries", () => ({
  getStudyDashboard: async () => painelFalso,
}));

const { getCourses, getStudyTime } = await import("./studies");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function curso(
  over: Partial<StudyCourseStats> & { id: string; title: string },
): StudyCourseStats {
  return {
    user_id: "u1",
    category: "tecnologia",
    cover_color: null,
    created_at: "2026-01-01T00:00:00.000Z",
    icon: null,
    is_language: false,
    materials: [],
    notes: null,
    platform: null,
    position: 0,
    priority: "media",
    progress: 0,
    start_date: null,
    status: "em_andamento",
    studied_minutes: 0,
    target_date: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    url: null,
    weekly_goal_minutes: null,
    workload_minutes: 600,
    totalLessons: 10,
    doneLessons: 0,
    progressPct: 0,
    studiedMinutes: 0,
    lastSessionDate: null,
    nextLessonTitle: null,
    overdue: null,
    ...over,
  } as StudyCourseStats;
}

function painel(courses: StudyCourseStats[], over: Partial<StudyDashboard> = {}): StudyDashboard {
  return {
    courses,
    totalCourses: courses.length,
    inProgress: courses.filter((c) => c.status === "em_andamento").length,
    completed: courses.filter((c) => c.status === "concluido").length,
    minutesWeek: 0,
    minutesMonth: 0,
    streak: 0,
    bestStreak: 0,
    nextLessons: [],
    overdue: courses.filter((c) => c.overdue !== null),
    weekly: [],
    recentSessions: [],
    courseOptions: [],
    taskOptions: [],
    practiceWeekByCourse: {},
    ...over,
  } as StudyDashboard;
}

/**
 * FIXTURE — 3 cursos, "hoje" é 2026-08-07.
 *
 *  C1 "Postgres"  em andamento · atraso por DATA-ALVO (target_date 01/08)
 *  C2 "Inglês"    em andamento · atraso por INATIVIDADE (nunca estudou)
 *  C3 "Rust"      CONCLUÍDO    · nunca conta como atrasado
 *
 *  total = 3 · em andamento = 2 · concluídos = 1 · atrasados = 2
 */
const FIXTURE: StudyCourseStats[] = [
  curso({
    id: "c1",
    title: "Postgres",
    target_date: "2026-08-01",
    overdue: "target",
    doneLessons: 4,
    progressPct: 40,
    studiedMinutes: 300,
    lastSessionDate: "2026-08-06",
    nextLessonTitle: "Índices parciais",
    weekly_goal_minutes: 120,
  }),
  curso({
    id: "c2",
    title: "Inglês",
    is_language: true,
    category: "idiomas",
    overdue: "inactive",
    lastSessionDate: null,
  }),
  curso({
    id: "c3",
    title: "Rust",
    status: "concluido",
    doneLessons: 10,
    progressPct: 100,
    studiedMinutes: 900,
    lastSessionDate: "2026-06-01",
  }),
];

beforeEach(() => {
  painelFalso = painel([...FIXTURE], { minutesWeek: 90, minutesMonth: 400, streak: 3, bestStreak: 11 });
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("studies.get_courses", () => {
  it("lista todos por padrão, com as contagens da fixture", async () => {
    const saida = await getCourses({});
    expect(saida.contagem).toBe(3);
    expect(saida.agregados).toMatchObject({
      cursos_listados: 3,
      total_cadastrados: 3,
      em_andamento: 2,
      concluidos: 1,
      atrasados: 2,
    });
  });

  it("o filtro encurta a lista e o agregado de atraso continua sendo de todos", async () => {
    const saida = await getCourses({ apenas_em_andamento: true });
    expect(saida.contagem).toBe(2);
    expect(saida.agregados).toMatchObject({
      cursos_listados: 2,
      atrasados: 2,
      atrasados_considera: "todos os cursos, mesmo com o filtro aplicado à lista",
    });
  });

  /**
   * ⚠️ O TESTE CENTRAL. Os dois cursos estão "atrasados", por razões diferentes. Sem o
   * motivo viajando junto, a resposta trataria inatividade como estouro de prazo.
   */
  it("cada motivo de atraso vira uma frase própria, nunca o identificador interno", async () => {
    const saida = await getCourses({});
    const porNome = (n: string) =>
      saida.itens.find((i) => (i as { curso: string }).curso === n) as {
        atrasado: boolean;
        motivo_do_atraso?: string;
      };

    expect(porNome("Postgres").motivo_do_atraso).toBe(
      "passou da data-alvo definida para o curso",
    );
    expect(porNome("Inglês").motivo_do_atraso).toBe(
      "nenhuma sessão de estudo nos últimos 7 dias",
    );
    // Nada de "target"/"inactive" crus chegando ao modelo.
    expect(JSON.stringify(saida.itens)).not.toContain("inactive");
  });

  it("curso concluído não é atrasado e não carrega motivo", async () => {
    const saida = await getCourses({});
    const rust = saida.itens.find(
      (i) => (i as { curso: string }).curso === "Rust",
    ) as { atrasado: boolean; motivo_do_atraso?: string };

    expect(rust.atrasado).toBe(false);
    expect(rust.motivo_do_atraso).toBeUndefined();
  });

  it("'nunca estudou' é null, não uma data antiga", async () => {
    const saida = await getCourses({});
    const ingles = saida.itens.find(
      (i) => (i as { curso: string }).curso === "Inglês",
    ) as { ultima_sessao: string | null };

    expect(ingles.ultima_sessao).toBeNull();
  });

  it("as refs apontam para a rota do curso", async () => {
    const saida = await getCourses({});
    expect(saida.refs[0]).toEqual({ tipo: "curso", id: "c1", rota: "/estudos/c1" });
  });

  it("sem curso em andamento, o texto diz quantos existem em outros estados", async () => {
    painelFalso = painel([FIXTURE[2]]);
    const saida = await getCourses({ apenas_em_andamento: true });
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("1 curso(s) cadastrado(s)");
  });
});

describe("studies.get_study_time", () => {
  it("relata os minutos e as sequências do painel, sem recalcular", async () => {
    const saida = await getStudyTime();
    expect(saida.agregados).toMatchObject({
      minutos_na_semana: 90,
      minutos_no_mes: 400,
      sequencia_atual_dias: 3,
      melhor_sequencia_dias: 11,
    });
  });

  it("soma só as metas semanais realmente definidas", async () => {
    // Só C1 tem meta (120). C2 e C3 têm `weekly_goal_minutes: null`.
    const saida = await getStudyTime();
    expect(saida.agregados).toMatchObject({ meta_semanal_somada_minutos: 120 });
  });

  /**
   * ⚠️ Nenhum curso com meta ≠ meta de zero minutos. Zero aqui levaria o modelo a dizer
   * "você bateu a meta" sobre uma meta que não existe.
   */
  it("sem nenhuma meta definida, o campo vem NULO com o motivo", async () => {
    painelFalso = painel([FIXTURE[1]], { minutesWeek: 10 });
    const saida = await getStudyTime();

    expect(saida.agregados).toMatchObject({ meta_semanal_somada_minutos: null });
    expect(
      (saida.agregados as { meta_indisponivel_porque: string }).meta_indisponivel_porque,
    ).toContain("não é uma meta de zero minutos");
  });

  /**
   * O outro lado da mesma moeda: aqui o zero É medição. Semana sem sessão registrada
   * significa que não houve estudo — e dizer isso é verdade, ao contrário de "dia sem
   * registro", onde o zero seria invenção.
   */
  it("zero minutos é declarado como medição, não como dado ausente", async () => {
    painelFalso = painel([FIXTURE[1]]);
    const saida = await getStudyTime();

    expect(saida.agregados).toMatchObject({ minutos_na_semana: 0, minutos_no_mes: 0 });
    expect(
      (saida.agregados as { observacao_do_periodo: string }).observacao_do_periodo,
    ).toContain("medição");
  });

  it("com estudo no período, não emite a observação de ausência", async () => {
    const saida = await getStudyTime();
    expect(saida.agregados).not.toHaveProperty("observacao_do_periodo");
  });
});

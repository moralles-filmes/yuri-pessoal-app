/**
 * Fase 18-C · Bloco 4 — IA · Os commands da Agenda.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PRECISA PROVAR, E QUE OS DOIS ANTERIORES NÃO PRECISAVAM:           ║
 * ║                                                                                       ║
 * ║ 1. A HORA QUE A IA DIZ É HORA DE BRASÍLIA. Um evento gravado com o instante errado    ║
 * ║    aparece no dia certo para quem escreveu o teste às 14h e no dia seguinte para quem ║
 * ║    o usa às 22h. Os valores esperados aqui são absolutos (`Z`), então a suíte passa   ║
 * ║    igual com `TZ=UTC`.                                                                ║
 * ║ 2. SEM HORÁRIO, NADA É INVENTADO. A recusa é o comportamento correto.                 ║
 * ║ 3. O OBJETO QUE VAI AO BANCO É O MESMO DO FORMULÁRIO — o teste de equivalência.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import { calendarEventSchema } from "@/lib/validators/calendar";
import { EfeitoImpossivel } from "../contracts";
import {
  criarEventoEntrada,
  excluirEventoEntrada,
  paraOSchemaDoFormulario,
  parseComEvento,
  resolverHorario,
  rotaDoDia,
  type CriarEventoEntrada,
} from "./calendar-preview";

const UUID = "3f1a7c60-9d2b-4a11-8f37-2c9a1b7e5d40";

/* ══════════════════════════════════════════════════════════════════════════════════════
   A entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("o schema de entrada", () => {
  it("é `.strict()` — campo a mais é recusado, não ignorado", () => {
    const r = criarEventoEntrada.safeParse({
      titulo: "Dentista",
      data: "2026-08-10",
      hora_inicio: "14:00",
      user_id: UUID,
    });
    expect(r.success).toBe(false);
  });

  /**
   * ⛔ `user_id` não existe no schema, e é assim em TODA ferramenta: o dono vem de
   * `authContext()`, nunca do modelo. Este teste é a redundância deliberada — a mesma
   * asserção existe no varredor do registry, e aqui ela fica ao lado do schema que a cumpre.
   */
  it("não existe campo de identificação de usuário", () => {
    const chaves = Object.keys(criarEventoEntrada.shape);
    expect(chaves).not.toContain("user_id");
    expect(chaves).not.toContain("owner_id");
  });

  it("recusa formato de data e de hora fora do padrão", () => {
    const base = { titulo: "x", data: "2026-08-10" };
    expect(criarEventoEntrada.safeParse({ ...base, data: "10/08/2026" }).success).toBe(false);
    expect(criarEventoEntrada.safeParse({ ...base, hora_inicio: "14h" }).success).toBe(false);
    expect(criarEventoEntrada.safeParse({ ...base, hora_inicio: "2:00" }).success).toBe(false);
    expect(criarEventoEntrada.safeParse({ titulo: "", data: "2026-08-10" }).success).toBe(false);
  });

  it("recusa tipo fora do vocabulário da Agenda", () => {
    const r = criarEventoEntrada.safeParse({
      titulo: "x",
      data: "2026-08-10",
      dia_inteiro: true,
      tipo: "urgente",
    });
    expect(r.success).toBe(false);
  });

  it("excluir exige um id de evento de verdade", () => {
    expect(excluirEventoEntrada.safeParse({ evento_id: "abc" }).success).toBe(false);
    expect(excluirEventoEntrada.safeParse({ evento_id: UUID }).success).toBe(true);
  });

  it("o `parse` do contrato devolve o valor já transformado", () => {
    const p = parseComEvento(criarEventoEntrada);
    const r = p({ titulo: "  Dentista  ", data: "2026-08-10", dia_inteiro: true });
    expect(r.ok).toBe(true);
    expect(r.ok && (r.valor as CriarEventoEntrada).titulo).toBe("Dentista");
    expect(p({ titulo: "x" }).ok).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   O fuso — a parte que erra em silêncio
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("resolverHorario", () => {
  it("converte a hora de PAREDE de Brasília para instante", () => {
    const r = resolverHorario({ titulo: "x", data: "2026-08-10", hora_inicio: "19:00" });
    expect(r.inicio).toBe("2026-08-10T22:00:00.000Z");
    // Sem `hora_fim`, uma hora depois — o padrão do formulário, não um número novo.
    expect(r.fim).toBe("2026-08-10T23:00:00.000Z");
    expect(r.horaFim).toBe("20:00");
    expect(r.fimDeduzido).toBe(true);
  });

  /**
   * ⛔ O CASO QUE SÓ APARECE À NOITE. 22h em Brasília é 01h do dia seguinte em UTC. Se a
   * conversão fosse feita com `new Date("2026-08-10T22:00")`, o instante dependeria do fuso
   * do processo — e a Vercel roda em UTC.
   */
  it("compromisso da noite cai no dia seguinte em UTC, e isso é o correto", () => {
    const r = resolverHorario({
      titulo: "x",
      data: "2026-08-10",
      hora_inicio: "22:00",
      hora_fim: "23:30",
    });
    expect(r.inicio).toBe("2026-08-11T01:00:00.000Z");
    expect(r.fim).toBe("2026-08-11T02:30:00.000Z");
    expect(r.fimDeduzido).toBe(false);
  });

  it("dia inteiro ancora ao meio-dia UTC e ignora as horas", () => {
    const r = resolverHorario({
      titulo: "x",
      data: "2026-08-10",
      dia_inteiro: true,
      hora_inicio: "23:00",
    });
    expect(r.diaInteiro).toBe(true);
    expect(r.inicio).toBe("2026-08-10T12:00:00.000Z");
    expect(r.fim).toBe("2026-08-10T12:00:00.000Z");
  });

  /**
   * ⛔ A RECUSA É O COMPORTAMENTO CORRETO, E ESTE É O TESTE QUE A PROTEGE.
   *
   * A tentação de "assumir 09:00" ou "a próxima hora cheia" volta toda vez que alguém acha
   * que a IA está sendo chata. Um compromisso num horário que ninguém disse é pior que um
   * passo do laço gasto pedindo o horário: o dono confirma olhando o título.
   */
  it("sem hora e sem dia inteiro, RECUSA em vez de escolher um horário", () => {
    expect(() => resolverHorario({ titulo: "x", data: "2026-08-10" })).toThrow(EfeitoImpossivel);
    try {
      resolverHorario({ titulo: "x", data: "2026-08-10" });
    } catch (e) {
      expect((e as EfeitoImpossivel).motivo).toContain("horário");
      expect((e as EfeitoImpossivel).motivo).toContain("Nada foi criado");
    }
  });

  it("fim anterior ao início é recusado, com os dois horários na mensagem", () => {
    expect(() =>
      resolverHorario({
        titulo: "x",
        data: "2026-08-10",
        hora_inicio: "18:00",
        hora_fim: "17:00",
      }),
    ).toThrow(EfeitoImpossivel);
  });

  it("início igual ao fim é aceito — compromisso de duração zero existe", () => {
    const r = resolverHorario({
      titulo: "x",
      data: "2026-08-10",
      hora_inicio: "18:00",
      hora_fim: "18:00",
    });
    expect(r.inicio).toBe(r.fim);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   O TESTE DE EQUIVALÊNCIA
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("equivalência: a IA e o formulário produzem o mesmo evento", () => {
  /**
   * O que o diálogo "Novo evento" manda e o que a IA manda têm de sair IDÊNTICOS do
   * `calendarEventSchema` — inclusive nos campos que nenhum dos dois preencheu.
   */
  it("mesmo pedido, mesmo objeto — campo a campo", () => {
    const horario = resolverHorario({
      titulo: "Dentista",
      data: "2026-08-10",
      hora_inicio: "14:00",
      hora_fim: "15:00",
    });
    const daIa = paraOSchemaDoFormulario(
      {
        titulo: "Dentista",
        data: "2026-08-10",
        hora_inicio: "14:00",
        hora_fim: "15:00",
        local: "Clínica",
        tipo: "pessoal",
      },
      horario,
    );

    // Exatamente o que `event-form.tsx` monta em `onSubmit`.
    const doFormulario = calendarEventSchema.parse({
      title: "Dentista",
      tipo: "pessoal",
      all_day: false,
      start_at: "2026-08-10T17:00:00.000Z",
      end_at: "2026-08-10T18:00:00.000Z",
      location: "Clínica",
      description: "",
      recurrence_freq: null,
      recurrence_interval: "1",
      recurrence_until: "",
      reminder_minutes: null,
      color: "",
      task_id: "",
    });

    expect(daIa).toEqual(doFormulario);
  });

  /**
   * ⚠️ OS QUATRO CAMPOS QUE A FERRAMENTA NÃO EXPÕE, conferidos por valor.
   *
   * Recorrência criada por engano se multiplica no calendário do dono — e, com o Google
   * conectado, no celular dele. Lembrete que ele não pediu vira alerta. Nenhum dos dois pode
   * aparecer por um caminho que ele não abriu.
   */
  it("não cria repetição, lembrete, cor nem vínculo com tarefa", () => {
    const horario = resolverHorario({ titulo: "x", data: "2026-08-10", dia_inteiro: true });
    const daIa = paraOSchemaDoFormulario({ titulo: "x", data: "2026-08-10", dia_inteiro: true }, horario);

    expect(daIa.recurrence_freq).toBeNull();
    expect(daIa.recurrence_until).toBeNull();
    expect(daIa.reminder_minutes).toBeNull();
    expect(daIa.color).toBeNull();
    expect(daIa.task_id).toBeNull();
  });

  it("o tipo ausente vira `pessoal`, o padrão do próprio formulário", () => {
    const horario = resolverHorario({ titulo: "x", data: "2026-08-10", dia_inteiro: true });
    const daIa = paraOSchemaDoFormulario({ titulo: "x", data: "2026-08-10", dia_inteiro: true }, horario);
    expect(daIa.tipo).toBe("pessoal");
    expect(daIa.all_day).toBe(true);
  });

  /**
   * O schema tem um `.refine` que recusa fim anterior ao início. `resolverHorario` já barrou
   * antes — mas se um dia ele deixar passar, a última linha de defesa continua sendo o mesmo
   * schema que o formulário usa. Este teste prova que ela está no caminho.
   */
  it("o schema do formulário ainda é a última defesa do intervalo", () => {
    expect(() =>
      calendarEventSchema.parse({
        title: "x",
        tipo: "pessoal",
        all_day: false,
        start_at: "2026-08-10T18:00:00.000Z",
        end_at: "2026-08-10T17:00:00.000Z",
        location: "",
        description: "",
        recurrence_freq: null,
        recurrence_interval: "1",
        recurrence_until: "",
        reminder_minutes: null,
        color: "",
        task_id: "",
      }),
    ).toThrow();
  });
});

describe("a rota que a tela recebe", () => {
  it("leva ao DIA do compromisso, em Brasília", () => {
    // 01:00 UTC do dia 11 é 22:00 do dia 10 em Brasília — a rota tem de apontar para o 10.
    expect(rotaDoDia("2026-08-11T01:00:00.000Z")).toBe("/agenda?date=2026-08-10");
  });
});

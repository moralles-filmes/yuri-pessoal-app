/**
 * Testes do interpretador de linguagem natural do TO-DO.
 *
 * `HOJE` é fixo (2026-07-28, uma TERÇA-FEIRA) e injetado em toda chamada — nenhum
 * teste depende do relógio da máquina.
 */
import { describe, expect, it } from "vitest";
import { fold, hasParsedAnything, parseQuickTask } from "@/lib/todo/parse";

const HOJE = "2026-07-28"; // terça-feira

const PROJETOS = [
  { id: "p-casa", name: "Casa" },
  { id: "p-financas", name: "Finanças pessoais" },
];

const ETIQUETAS = [
  { id: "l-contas", name: "contas" },
  { id: "l-urgente", name: "urgente" },
];

function parse(input: string) {
  return parseQuickTask(input, HOJE, { projects: PROJETOS, labels: ETIQUETAS });
}

describe("fold", () => {
  it("remove acentos preservando o comprimento", () => {
    expect(fold("Amanhã às 10h")).toBe("amanha as 10h");
    expect(fold("Amanhã").length).toBe("Amanhã".length);
    expect(fold("Ação Ç ü õ")).toBe("acao c u o");
  });
});

describe("parseQuickTask — exemplo do escopo", () => {
  it('interpreta "Pagar internet amanhã às 10h"', () => {
    const r = parse("Pagar internet amanhã às 10h");
    expect(r.title).toBe("Pagar internet");
    expect(r.scheduledDate).toBe("2026-07-29");
    expect(r.scheduledTime).toBe("10:00");
    expect(r.tokens.map((t) => t.kind)).toEqual(["data", "hora"]);
  });

  it("não altera o texto original (só devolve o título derivado)", () => {
    const entrada = "Pagar internet amanhã às 10h";
    const r = parse(entrada);
    expect(entrada).toBe("Pagar internet amanhã às 10h");
    expect(r.tokens.every((t) => entrada.slice(t.start, t.end).trim() === t.text)).toBe(true);
  });
});

describe("datas", () => {
  it("reconhece hoje, amanhã e depois de amanhã", () => {
    expect(parse("Ligar hoje").scheduledDate).toBe(HOJE);
    expect(parse("Ligar amanhã").scheduledDate).toBe("2026-07-29");
    expect(parse("Ligar depois de amanhã").scheduledDate).toBe("2026-07-30");
  });

  it("dia da semana cai sempre no futuro", () => {
    // Hoje é terça: segunda é a da semana que vem.
    expect(parse("Reunião segunda").scheduledDate).toBe("2026-08-03");
    expect(parse("Reunião sexta").scheduledDate).toBe("2026-07-31");
    expect(parse("Reunião próxima quinta").scheduledDate).toBe("2026-07-30");
  });

  it("dia da semana igual ao de hoje vai para a semana seguinte", () => {
    expect(parse("Reunião terça").scheduledDate).toBe("2026-08-04");
    expect(parse("Reunião terça-feira").scheduledDate).toBe("2026-08-04");
  });

  it('"dia N" usa o mês atual quando ainda não passou', () => {
    expect(parse("Pagar dia 30").scheduledDate).toBe("2026-07-30");
    expect(parse("Pagar dia 15").scheduledDate).toBe("2026-08-15");
  });

  it("aceita datas numéricas com e sem ano", () => {
    expect(parse("Consulta 15/09").scheduledDate).toBe("2026-09-15");
    expect(parse("Consulta 15/09/2027").scheduledDate).toBe("2027-09-15");
    expect(parse("Consulta 15/09/27").scheduledDate).toBe("2027-09-15");
  });

  it("data numérica sem ano que já passou vai para o ano seguinte", () => {
    expect(parse("Consulta 15/03").scheduledDate).toBe("2027-03-15");
  });

  it("aceita mês por extenso", () => {
    expect(parse("Viagem 10 de setembro").scheduledDate).toBe("2026-09-10");
    expect(parse("Viagem 10 de dezembro de 2028").scheduledDate).toBe("2028-12-10");
  });

  it("rejeita data impossível em vez de corrigir em silêncio", () => {
    const r = parse("Entregar 31/02");
    expect(r.scheduledDate).toBeNull();
    expect(r.title).toBe("Entregar 31/02");
  });

  it('entende "em N dias/semanas/meses"', () => {
    expect(parse("Revisar em 3 dias").scheduledDate).toBe("2026-07-31");
    expect(parse("Revisar em 2 semanas").scheduledDate).toBe("2026-08-11");
    expect(parse("Revisar em 1 mês").scheduledDate).toBe("2026-08-28");
  });
});

describe("horários", () => {
  it("aceita os formatos usuais", () => {
    expect(parse("Reunião às 10h").scheduledTime).toBe("10:00");
    expect(parse("Reunião 14h30").scheduledTime).toBe("14:30");
    expect(parse("Reunião 14:05").scheduledTime).toBe("14:05");
    expect(parse("Reunião meio-dia").scheduledTime).toBe("12:00");
  });

  it("rejeita hora e minuto fora da faixa", () => {
    expect(parse("Prazo 24h").scheduledTime).toBeNull();
    expect(parse("Reunião 10:75").scheduledTime).toBeNull();
  });

  it("combina data e hora sem se confundir", () => {
    const r = parse("Dentista 15/09 às 8h");
    expect(r.scheduledDate).toBe("2026-09-15");
    expect(r.scheduledTime).toBe("08:00");
    expect(r.title).toBe("Dentista");
  });
});

describe("prioridade, projeto e etiquetas", () => {
  it("reconhece p1..p4", () => {
    expect(parse("Corrigir bug p1").priority).toBe(1);
    expect(parse("Corrigir bug p4").priority).toBe(4);
    expect(parse("Corrigir bug p5").priority).toBeNull();
  });

  it("liga o projeto existente pelo id", () => {
    const r = parse("Trocar lâmpada #Casa");
    expect(r.projectId).toBe("p-casa");
    expect(r.title).toBe("Trocar lâmpada");
  });

  it("casa o nome de projeto mais longo, com espaços", () => {
    const r = parse("Revisar orçamento #Finanças pessoais");
    expect(r.projectId).toBe("p-financas");
    expect(r.projectName).toBe("Finanças pessoais");
    expect(r.title).toBe("Revisar orçamento");
  });

  it("marca projeto inexistente como não resolvido, sem inventar", () => {
    const r = parse("Comprar tinta #garagem");
    expect(r.projectId).toBeNull();
    expect(r.projectName).toBe("garagem");
    expect(r.tokens.find((t) => t.kind === "projeto")?.unresolved).toBe(true);
  });

  it("aceita várias etiquetas e separa as novas das existentes", () => {
    const r = parse("Pagar luz @contas @nova");
    expect(r.labelIds).toEqual(["l-contas"]);
    expect(r.newLabelNames).toEqual(["nova"]);
    expect(r.title).toBe("Pagar luz");
  });
});

describe("recorrência", () => {
  it('"todo dia" vira regra diária começando hoje', () => {
    const r = parse("Tomar remédio todo dia");
    expect(r.recurrence).toMatchObject({ frequency: "diaria", intervalCount: 1, mode: "fixo" });
    expect(r.scheduledDate).toBe(HOJE);
    expect(r.title).toBe("Tomar remédio");
  });

  it('"toda segunda" é regra semanal — não a data da próxima segunda', () => {
    const r = parse("Reunião toda segunda");
    expect(r.recurrence).toMatchObject({ frequency: "semanal", daysOfWeek: [1] });
    expect(r.scheduledDate).toBe("2026-08-03");
    expect(r.tokens.map((t) => t.kind)).toEqual(["recorrencia"]);
  });

  it('"a cada 2 semanas" e "de 3 em 3 dias"', () => {
    expect(parse("Regar plantas a cada 2 semanas").recurrence).toMatchObject({
      frequency: "semanal",
      intervalCount: 2,
    });
    expect(parse("Alongar de 3 em 3 dias").recurrence).toMatchObject({
      frequency: "diaria",
      intervalCount: 3,
    });
  });

  it('"todo dia 10" é mensal no dia 10', () => {
    const r = parse("Pagar aluguel todo dia 10");
    expect(r.recurrence).toMatchObject({ frequency: "mensal", dayOfMonth: 10 });
    expect(r.scheduledDate).toBe("2026-08-10");
  });

  it("dias úteis e último dia útil do mês", () => {
    expect(parse("Checar e-mail em dias úteis").recurrence).toMatchObject({
      frequency: "diaria",
      businessDayRule: "apenas_dias_uteis",
    });
    expect(parse("Fechar caixa todo último dia útil do mês").recurrence).toMatchObject({
      frequency: "mensal",
      businessDayRule: "ultimo_dia_util",
    });
  });

  it("mensal e anual", () => {
    expect(parse("Backup todo mês").recurrence).toMatchObject({ frequency: "mensal" });
    expect(parse("Renovar seguro todo ano").recurrence).toMatchObject({ frequency: "anual" });
    expect(parse("Relatório semanalmente").recurrence).toMatchObject({ frequency: "semanal" });
  });

  it('"após concluir" troca o modo da regra', () => {
    const r = parse("Cortar cabelo a cada 30 dias após concluir");
    expect(r.recurrence).toMatchObject({
      frequency: "diaria",
      intervalCount: 30,
      mode: "apos_conclusao",
    });
    expect(r.title).toBe("Cortar cabelo");
  });

  it("data explícita tem precedência sobre a primeira ocorrência calculada", () => {
    const r = parse("Reunião toda segunda a partir de 15/09");
    expect(r.recurrence).toMatchObject({ frequency: "semanal", daysOfWeek: [1] });
    expect(r.scheduledDate).toBe("2026-09-15");
  });
});

describe("prazo final", () => {
  it('"até <data>" vira prazo, não data programada', () => {
    const r = parse("Entregar relatório até 15/09");
    expect(r.deadlineAt).toBe("2026-09-15");
    expect(r.scheduledDate).toBeNull();
    expect(r.title).toBe("Entregar relatório");
  });

  it("convive com a data programada", () => {
    const r = parse("Escrever proposta amanhã até 15/09");
    expect(r.scheduledDate).toBe("2026-07-29");
    expect(r.deadlineAt).toBe("2026-09-15");
  });

  it('aceita "vence" e "prazo"', () => {
    expect(parse("Boleto vence 10/09").deadlineAt).toBe("2026-09-10");
    expect(parse("Imposto prazo 10/09").deadlineAt).toBe("2026-09-10");
  });
});

describe("segurança contra falso positivo", () => {
  it("texto comum não vira data nem hora", () => {
    const r = parse("Comprar 2 pães e 3 ovos");
    expect(r.scheduledDate).toBeNull();
    expect(r.scheduledTime).toBeNull();
    expect(r.recurrence).toBeNull();
    expect(r.title).toBe("Comprar 2 pães e 3 ovos");
    expect(hasParsedAnything(r)).toBe(false);
  });

  it("texto vazio devolve tudo nulo", () => {
    const r = parse("   ");
    expect(r.title).toBe("");
    expect(r.tokens).toEqual([]);
  });

  it("não confunde valores monetários com horário", () => {
    const r = parse("Pagar R$ 250 de energia");
    expect(r.scheduledTime).toBeNull();
    expect(r.title).toBe("Pagar R$ 250 de energia");
  });

  it("título nunca fica vazio por engano quando só há metadados", () => {
    const r = parse("amanhã às 9h");
    expect(r.title).toBe("");
    expect(r.scheduledDate).toBe("2026-07-29");
    expect(r.scheduledTime).toBe("09:00");
  });
});

describe("pureza", () => {
  it("mesma entrada devolve exatamente o mesmo resultado", () => {
    const entrada = "Pagar internet amanhã às 10h #Casa @contas p1 toda segunda";
    expect(parse(entrada)).toEqual(parse(entrada));
  });

  it("resultado muda apenas em função do 'hoje' injetado", () => {
    const a = parseQuickTask("Ligar amanhã", "2026-07-28");
    const b = parseQuickTask("Ligar amanhã", "2026-12-31");
    expect(a.scheduledDate).toBe("2026-07-29");
    expect(b.scheduledDate).toBe("2027-01-01");
  });
});

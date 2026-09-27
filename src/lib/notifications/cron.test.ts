/**
 * REDESIGN-03-B2 — o Cron (`generateForUser`) visto de fora, com um client de service role FALSO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA.                                                             ║
 * ║                                                                                       ║
 * ║ O efeito NO SINO das decisões da Parte B da 03-B2 — o que nasce em `notifications`.    ║
 * ║ Os testes puros de `generate.ts` provam o gerador; este prova o que o Cron LÊ e        ║
 * ║ entrega a ele, que é onde a B1 (fatura vazia) e a B2 (régua do gasto alto) moram.      ║
 * ║                                                                                       ║
 * ║ O client falso APLICA `eq`, `neq`, `gt`, `gte`, `lte`, `in` e `limit` sobre as linhas  ║
 * ║ sintéticas — é isso que torna visível um `.gt("itens", 0)` a mais ou uma janela de     ║
 * ║ leitura diferente. `or` e `order` são ignorados. Tabela sem fixture devolve []. Dieta, ║
 * ║ Treinos e IA já são isolados por `.catch(() => null)` no Cron. Nenhuma rede.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Fixture SINTÉTICA: o repositório é público.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import { generateForUser } from "@/lib/notifications/cron";

type Linha = Record<string, unknown>;
type Servico = Parameters<typeof generateForUser>[0];

const USUARIO = "user-1";
/** 12h em Brasília: `todayIso` = 2026-09-10. */
const AGORA = new Date("2026-09-10T15:00:00.000Z");

const estado = {
  tabelas: {} as Record<string, Linha[]>,
  inseridas: {} as Record<string, Linha[]>,
};

/** Ordem de string ou de número; nulo nunca passa num filtro de comparação. */
function comparar(a: unknown, b: unknown): number {
  if (a == null || b == null) return Number.NaN;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function servicoFalso(): Servico {
  return {
    from(tabela: string) {
      const predicados: Array<(l: Linha) => boolean> = [];
      let limite: number | undefined;
      const builder: Record<string, unknown> = {};
      const resultado = () => {
        const todas = (estado.tabelas[tabela] ?? []).filter((l) => predicados.every((p) => p(l)));
        return {
          data: limite === undefined ? todas : todas.slice(0, limite),
          error: null,
          count: todas.length,
        };
      };
      const filtro =
        (teste: (valor: unknown, alvo: unknown) => boolean) => (coluna: string, alvo: unknown) => {
          predicados.push((l) => teste(l[coluna], alvo));
          return builder;
        };
      builder.select = () => builder;
      builder.order = () => builder;
      builder.or = () => builder;
      builder.eq = filtro((v, a) => v === a);
      builder.neq = filtro((v, a) => v !== a);
      builder.gt = filtro((v, a) => comparar(v, a) > 0);
      builder.gte = filtro((v, a) => comparar(v, a) >= 0);
      builder.lte = filtro((v, a) => comparar(v, a) <= 0);
      builder.in = filtro((v, a) => (a as unknown[]).includes(v));
      builder.limit = (n: number) => {
        limite = n;
        return builder;
      };
      builder.maybeSingle = async () => ({ data: resultado().data[0] ?? null, error: null });
      builder.single = builder.maybeSingle;
      builder.insert = async (linhas: Linha | Linha[]) => {
        (estado.inseridas[tabela] ??= []).push(...(Array.isArray(linhas) ? linhas : [linhas]));
        return { error: null };
      };
      builder.update = () => builder;
      builder.then = (
        resolve: (v: ReturnType<typeof resultado>) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(resultado()).then(resolve, reject);
      return builder;
    },
  } as unknown as Servico;
}

/** As notificações que o Cron inseriu, do tipo pedido (prefixo). */
function inseridas(prefixoDoTipo: string): Linha[] {
  return (estado.inseridas.notifications ?? []).filter((n) =>
    String(n.type).startsWith(prefixoDoTipo),
  );
}

function faturaSintetica(sobre: Linha): Linha {
  return {
    user_id: USUARIO,
    card_id: "card-1",
    pago_em: null,
    ...sobre,
  };
}

function fixtureBase(): Record<string, Linha[]> {
  return {
    credit_cards: [{ id: "card-1", nome: "Cartao 1", limite_total: 5000, user_id: USUARIO }],
    card_statements_with_total: [
      // Fatura REAL: tem lançamento, venceu e não foi paga.
      faturaSintetica({
        id: "st-real",
        competencia: "2026-08-01",
        data_fechamento: "2026-08-05",
        data_vencimento: "2026-08-15",
        total_atual: 300,
        itens: 2,
      }),
      // Fatura VAZIA: nasceu do get-or-create e ficou sem item — não é fatura real (§13.5).
      faturaSintetica({
        id: "st-vazia",
        competencia: "2026-07-01",
        data_fechamento: "2026-07-05",
        data_vencimento: "2026-07-15",
        total_atual: 0,
        itens: 0,
      }),
    ],
  };
}

async function rodarOCron(): Promise<void> {
  await generateForUser(servicoFalso(), USUARIO, AGORA);
}

beforeEach(() => {
  estado.tabelas = fixtureBase();
  estado.inseridas = {};
});

describe("03-B2 B1 — as faturas que o sino vê", () => {
  /**
   * ⚠️ CARACTERIZAÇÃO — congela o comportamento de HOJE, antes do conserto da B1 (decisão do
   * dono em 2026-09-27). O Cron lê `card_statements_with_total` SEM `.gt("itens", 0)`, que as
   * telas aplicam: a fatura vazia vencida vira "Fatura atrasada" URGENTE com R$ 0,00. O commit de
   * conserto atualiza ESTE teste, e o diff dele mostra o aviso que deixa de nascer.
   */
  it("B1 — CARACTERIZAÇÃO: hoje o sino avisa a fatura vazia vencida", async () => {
    await rodarOCron();
    const faturas = inseridas("invoice_");
    expect(faturas.map((n) => n.dedupe_key).sort()).toEqual([
      "invoice_overdue:st-real",
      "invoice_overdue:st-vazia",
    ]);
    const vazia = faturas.find((n) => n.dedupe_key === "invoice_overdue:st-vazia");
    expect(vazia?.priority).toBe("urgent");
    expect(String(vazia?.description)).toContain(formatCurrency(0));
  });
});

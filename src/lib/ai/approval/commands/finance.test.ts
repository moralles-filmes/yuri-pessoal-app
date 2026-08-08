/**
 * Fase 18-C · Bloco 4 — IA · O command de Financeiro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO GUARDA: O QUE A FERRAMENTA **NÃO PODE** FAZER.                     ║
 * ║                                                                                       ║
 * ║ Nos outros commands, o teste central é sobre o que a ação FAZ. Aqui o risco está no    ║
 * ║ contrário: o dono vai pedir "parcela em 3x" e "metade é do João", e a ferramenta não   ║
 * ║ faz nem uma coisa nem outra. Se um campo desses aparecer no schema um dia — por        ║
 * ║ conveniência, por simetria, por engano — estes casos ficam vermelhos.                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import { transactionSchema } from "@/lib/validators/transaction";
import { EfeitoImpossivel } from "../contracts";
import {
  excluirTransacaoEntrada,
  lancarTransacaoEntrada,
  paraOSchemaDoFormulario,
  parseComTransacao,
  recusarSeFaturaPaga,
  type LancarTransacaoEntrada,
  type TransacaoResolvida,
} from "./finance-preview";

const UUID = "3f1a7c60-9d2b-4a11-8f37-2c9a1b7e5d40";
const UUID2 = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";

const CONTA: TransacaoResolvida = {
  tipo: "despesa",
  data: "2026-08-07",
  conta: { id: UUID, nome: "Nubank" },
  cartao: null,
  categoria: null,
  fatura: null,
};

const CARTAO: TransacaoResolvida = {
  tipo: "despesa",
  data: "2026-08-07",
  conta: null,
  cartao: { id: UUID2, nome: "Nubank Roxinho" },
  categoria: null,
  fatura: {
    competencia: "2026-09-01",
    dataFechamento: "2026-09-03",
    dataVencimento: "2026-09-10",
    status: "Aberta",
    jaPaga: false,
  },
};

/* ══════════════════════════════════════════════════════════════════════════════════════
   ⛔ O que a ferramenta NÃO oferece
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("as ausências deliberadas do schema", () => {
  it("não existe campo de PARCELAMENTO", () => {
    const chaves = Object.keys(lancarTransacaoEntrada.shape);
    for (const proibido of ["parcelas", "parcelamento", "num_parcelas", "vezes"]) {
      expect(chaves, proibido).not.toContain(proibido);
    }
    expect(
      lancarTransacaoEntrada.safeParse({
        tipo: "despesa",
        valor: 300,
        descricao: "TV",
        cartao: "Nubank",
        parcelas: 3,
      }).success,
    ).toBe(false);
  });

  it("não existe campo de DIVISÃO com terceiros", () => {
    const chaves = Object.keys(lancarTransacaoEntrada.shape);
    for (const proibido of ["pessoa", "pessoas", "divisao", "parts", "classificacao"]) {
      expect(chaves, proibido).not.toContain(proibido);
    }
    expect(
      lancarTransacaoEntrada.safeParse({
        tipo: "despesa",
        valor: 100,
        descricao: "Jantar",
        conta: "Nubank",
        pessoa: "João",
      }).success,
    ).toBe(false);
  });

  it("não existe TRANSFERÊNCIA — nem como tipo, nem como conta de destino", () => {
    expect(
      lancarTransacaoEntrada.safeParse({
        tipo: "transferencia",
        valor: 100,
        descricao: "x",
        conta: "Nubank",
      }).success,
    ).toBe(false);
    expect(Object.keys(lancarTransacaoEntrada.shape)).not.toContain("conta_destino");
  });

  it("não existe campo de identificação de usuário", () => {
    const chaves = Object.keys(lancarTransacaoEntrada.shape);
    expect(chaves).not.toContain("user_id");
    expect(chaves).not.toContain("owner_id");
  });

  /**
   * ⚠️ E o `status` também não é do modelo. Um lançamento nasce `pago` — o padrão do
   * formulário para gasto do dia. Deixar o modelo escolher `pendente` faria o saldo não se
   * mexer, e o dono confirmaria uma despesa que não saiu de lugar nenhum.
   */
  it("o modelo não escolhe o status do lançamento", () => {
    expect(Object.keys(lancarTransacaoEntrada.shape)).not.toContain("status");
    expect(paraOSchemaDoFormulario(
      { tipo: "despesa", valor: 10, descricao: "x" },
      CONTA,
    ).status).toBe("pago");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   O valor — a unidade que erra em silêncio
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("o valor", () => {
  it("recusa zero, negativo e absurdo", () => {
    const base = { tipo: "despesa" as const, descricao: "x", conta: "Nubank" };
    expect(lancarTransacaoEntrada.safeParse({ ...base, valor: 0 }).success).toBe(false);
    expect(lancarTransacaoEntrada.safeParse({ ...base, valor: -50 }).success).toBe(false);
    expect(lancarTransacaoEntrada.safeParse({ ...base, valor: 5_000_000 }).success).toBe(false);
    expect(lancarTransacaoEntrada.safeParse({ ...base, valor: 45.9 }).success).toBe(true);
  });

  /**
   * ⛔ REAIS, NÃO CENTAVOS — e o teste segue o número até a saída do schema do formulário.
   *
   * O sistema guarda dinheiro em centavos, e a conversão mora num lugar só. Se este arquivo
   * multiplicasse por 100 "para ajudar", 45,90 viraria R$ 4.590,00 no extrato do dono.
   */
  it("45.90 atravessa a tradução como 45.90, sem virar centavos", () => {
    const dados = paraOSchemaDoFormulario(
      { tipo: "despesa", valor: 45.9, descricao: "Mercado" },
      CONTA,
    );
    expect(dados.amount).toBe(45.9);
    // E o schema do formulário aceita esse mesmo objeto — é o teste de equivalência.
    const parsed = transactionSchema.parse(dados);
    expect(parsed.amount).toBe(45.9);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   O TESTE DE EQUIVALÊNCIA
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("equivalência: a IA e o formulário produzem o mesmo lançamento", () => {
  it("despesa em conta sai como débito, com a conta preenchida", () => {
    const daIa = transactionSchema.parse(
      paraOSchemaDoFormulario(
        { tipo: "despesa", valor: 45.9, descricao: "Mercado" },
        CONTA,
      ),
    );

    expect(daIa.type).toBe("despesa");
    expect(daIa.payment_method).toBe("debito");
    expect(daIa.account_id).toBe(UUID);
    expect(daIa.card_id).toBeNull();
    expect(daIa.transfer_account_id).toBeNull();
  });

  /**
   * A regra do módulo que o schema do formulário guarda: compra no cartão NÃO tem conta. Ela
   * entra na fatura, e o saldo só se move quando a fatura é paga. Se a tradução preenchesse
   * os dois, o `.refine` do schema aceitaria (conta é opcional no cartão) e o lançamento
   * nasceria com um vínculo de conta que nenhuma tela cria.
   */
  it("despesa no cartão sai SEM conta, com cartão e método de crédito", () => {
    const daIa = transactionSchema.parse(
      paraOSchemaDoFormulario(
        { tipo: "despesa", valor: 80, descricao: "Posto", cartao: "Nubank Roxinho" },
        CARTAO,
      ),
    );

    expect(daIa.payment_method).toBe("cartao_credito");
    expect(daIa.card_id).toBe(UUID2);
    expect(daIa.account_id).toBeNull();
  });

  /**
   * ⛔ `classificacao: "pessoal"` é o que DESLIGA a divisão com terceiros no serviço
   * (`isShared` fica falso e `applySplit` nem é chamado). É a trava efetiva por trás da
   * ausência do campo `pessoa` no schema.
   */
  it("o lançamento sai sempre PESSOAL, com a lista de partes vazia", () => {
    const dados = paraOSchemaDoFormulario(
      { tipo: "despesa", valor: 100, descricao: "Jantar" },
      CONTA,
    );
    expect(dados.classificacao).toBe("pessoal");
    expect(dados.parts).toEqual([]);
  });

  it("data ausente usa a resolvida, e a competência acompanha a compra", () => {
    const dados = paraOSchemaDoFormulario(
      { tipo: "despesa", valor: 10, descricao: "x" },
      CONTA,
    );
    expect(dados.purchase_date).toBe("2026-08-07");
    expect(dados.competence_date).toBe("2026-08-07");
  });

  it("sem categoria, o lançamento entra sem categoria — não numa escolhida pela IA", () => {
    const daIa = transactionSchema.parse(
      paraOSchemaDoFormulario({ tipo: "despesa", valor: 10, descricao: "x" }, CONTA),
    );
    expect(daIa.category_id).toBeNull();
    expect(daIa.subcategory_id).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   ⛔ A única restrição que o formulário NÃO tem
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("recusarSeFaturaPaga", () => {
  it("fatura já paga RECUSA, dizendo qual e o que fazer", () => {
    expect(() => recusarSeFaturaPaga({ ...CARTAO.fatura!, status: "Paga", jaPaga: true })).toThrow(
      EfeitoImpossivel,
    );

    try {
      recusarSeFaturaPaga({ ...CARTAO.fatura!, status: "Paga", jaPaga: true });
    } catch (e) {
      const m = (e as EfeitoImpossivel).motivo;
      expect(m).toContain("2026-09");
      expect(m).toContain("PAGA");
      expect(m).toContain("Nada foi lançado");
      // Não é um beco sem saída: a mensagem diz por onde fazer, se for isso mesmo.
      expect(m).toContain("tela da fatura");
    }
    expect.assertions(5);
  });

  /**
   * Fatura FECHADA (mas não paga) passa — de propósito. Compra depois do fechamento é
   * rotina, e ela cai na fatura seguinte pela própria regra de `resolverFatura`. Recusar aqui
   * bloquearia o caso mais comum do mês.
   */
  it("fatura aberta, fechada ou atrasada PASSA — só a paga barra", () => {
    for (const status of ["Aberta", "Fechada", "Atrasada"]) {
      expect(() =>
        recusarSeFaturaPaga({ ...CARTAO.fatura!, status, jaPaga: false }),
      ).not.toThrow();
    }
  });

  it("lançamento sem cartão não tem fatura, e não é barrado", () => {
    expect(() => recusarSeFaturaPaga(null)).not.toThrow();
  });
});

describe("a entrada do desfazer", () => {
  it("exige um id de transação de verdade", () => {
    expect(excluirTransacaoEntrada.safeParse({ transacao_id: "abc" }).success).toBe(false);
    expect(excluirTransacaoEntrada.safeParse({ transacao_id: UUID }).success).toBe(true);
  });

  it("o `parse` do contrato devolve o valor já transformado", () => {
    const p = parseComTransacao(lancarTransacaoEntrada);
    const r = p({ tipo: "despesa", valor: 10, descricao: "  Mercado  ", conta: " Nubank " });
    expect(r.ok).toBe(true);
    expect(r.ok && (r.valor as LancarTransacaoEntrada).descricao).toBe("Mercado");
    expect(r.ok && (r.valor as LancarTransacaoEntrada).conta).toBe("Nubank");
  });
});

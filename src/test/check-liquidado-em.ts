/**
 * REDESIGN-03-E · P12 — o CHECK `transactions_liquidado_em_coerente` da M2, simulado para o
 * harness (`criarSupabaseEmMemoria(..., { antesDeGravar: checkLiquidadoEmCoerente })`).
 *
 * No banco: `liquidado_em is null or status in ('pago','recebido')`, e a violação é `23514`.
 * Sem esta simulação, um caminho que tira o lançamento de `pago` sem limpar a data passaria em
 * todos os testes e quebraria só em runtime — a mutação Z11.
 *
 * ⚠️ O harness não diz ao gancho QUAIS linhas o `update` alcança (os filtros vêm depois). Por
 * isso o update é conferido contra TODAS as linhas de `transactions` da fixture, com os valores
 * novos por cima: é exato nas fixtures de uma linha (ou de um par de transferência), que é como
 * estes testes são escritos. Só para teste — nenhum arquivo de runtime o importa.
 */
import type { ErroSimulado, EscritaPretendida, Linha } from "@/test/supabase-em-memoria";

const LIQUIDADOS = ["pago", "recebido"];

function incoerente(l: Linha): boolean {
  const data = l.liquidado_em;
  return data !== null && data !== undefined && !LIQUIDADOS.includes(String(l.status));
}

const VIOLACAO: ErroSimulado = {
  code: "23514",
  message:
    'new row for relation "transactions" violates check constraint "transactions_liquidado_em_coerente"',
};

export function checkLiquidadoEmCoerente(op: EscritaPretendida): ErroSimulado | null {
  if (op.tabela !== "transactions" || op.tipo === "delete") return null;
  const valores = Array.isArray(op.valores) ? op.valores : [op.valores ?? {}];

  if (op.tipo === "insert") return valores.some(incoerente) ? VIOLACAO : null;

  const alvo = op.tabelas.transactions ?? [];
  for (const v of valores) {
    if (alvo.some((linha) => incoerente({ ...linha, ...v }))) return VIOLACAO;
  }
  return null;
}

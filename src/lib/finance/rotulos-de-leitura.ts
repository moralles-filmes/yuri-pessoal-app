/**
 * REDESIGN-03-G (L1) — a TABELA ÚNICA de rótulos das leituras do financeiro (spec §5.2).
 *
 * O card, a Server Action e o Cron dizem a MESMA coisa sobre a MESMA leitura: quando a leitura
 * de lançamentos falha, a mensagem fala "os lançamentos" em todo lugar, nunca "as transações"
 * em um e "os registros" em outro.
 *
 * Puro, sem nenhum import: o texto é lido pelo servidor e pelos testes sem mock.
 */
export const ROTULOS_DE_LEITURA = {
  lancamentos: "os lançamentos",
  lancamento: "o lançamento",
  contas: "as contas",
  categorias: "as categorias",
  categoriasMarcadas: "as categorias marcadas como de terceiros",
  subcategorias: "as subcategorias",
  cartoes: "os cartões",
  cartao: "o cartão",
  faturas: "as faturas",
  fatura: "a fatura",
  parcelas: "as parcelas",
  comprasParceladas: "as compras parceladas",
  contasFixas: "as contas fixas",
  recorrencias: "as recorrências",
  pessoas: "as pessoas",
  recebiveis: "os recebíveis",
  recebimentos: "os recebimentos",
  divisao: "a divisão atual",
  lotesDaImportacao: "o histórico de importações",
  loteDaImportacao: "o lote da importação",
  linhasDaImportacao: "as linhas da importação",
  candidatasDoComprovante: "os lançamentos parecidos com o comprovante",
} as const;

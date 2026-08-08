import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · A METADE QUE SÓ LÊ do command de Financeiro. O ÚLTIMO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTA FERRAMENTA **NÃO** FAZ — e cada ausência é uma decisão, não um atraso.     ║
 * ║                                                                                       ║
 * ║   • TRANSFERÊNCIA entre contas. Efeito de dois lados, derivado de UMA linha            ║
 * ║     (`account_balance`); um engano move dinheiro em duas contas de uma vez.            ║
 * ║   • PARCELAMENTO. Parcela lançada NÃO está em `transactions` — ela vive em             ║
 * ║     `transaction_installments`, e a compra-pai guarda o total sem fatura. É a          ║
 * ║     assimetria que já causou lançamento em dobro na importação (2026-08-06).           ║
 * ║   • DIVISÃO COM TERCEIROS. Mexe em `shared_expenses` + `receivables` e deriva          ║
 * ║     `valor_pessoal`. Um erro aqui faz alguém cobrar (ou deixar de cobrar) outra pessoa.║
 * ║   • PAGAR FATURA, EDITAR e EXCLUIR lançamento existente. Risco 4, fora da 18-C.        ║
 * ║                                                                                       ║
 * ║ A restrição está na ENTRADA: não existe campo para nada disso no schema. O serviço     ║
 * ║ continua sabendo fazer tudo (é o mesmo do formulário) — o que a IA não tem é como      ║
 * ║ pedir. Restringir na entrada, e não copiando a regra pela metade, é o que impede a     ║
 * ║ divergência entre os dois caminhos.                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
/**
 * ⚠️ TUDO PELA CAMADA DE LEITURA DO MÓDULO, e nenhum `createClient()` aqui.
 *
 * A primeira versão deste arquivo abria o próprio client e consultava `credit_cards`,
 * `card_statements` e `transactions` direto. O teste de fronteira ("approval/ só toca tabelas
 * ai_*") pegou, e estava certo: consulta montada dentro do módulo de IA é a porta pela qual a
 * regra do domínio começa a ser reescrita — primeiro o `select`, depois o filtro, depois a
 * decisão. `getCardBillingDays`, `getStatementByCompetencia` e `getTransactionById` nasceram
 * dessa correção.
 */
import {
  getAccounts,
  getCardBillingDays,
  getCategories,
  getCreditCards,
  getStatementByCompetencia,
  getTransactionById,
} from "@/lib/finance/queries";
import { resolverFatura, statusEfetivo } from "@/lib/finance/invoice";
import { STATEMENT_STATUS_LABELS } from "@/lib/finance/constants";
import { formatCurrency, formatDate, hojeISO } from "@/lib/format";
import { EfeitoImpossivel, type EfeitoProposto } from "../contracts";

const ROTA_DOS_LANCAMENTOS = "/financeiro/lancamentos";

/* ══════════════════════════════════════════════════════════════════════════════════════
   Entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ `valor` É EM REAIS, e o schema do formulário converte para centavos — não converta aqui.
 * O sistema guarda dinheiro em centavos (integer), e uma segunda conversão neste arquivo seria
 * a chance de multiplicar ou dividir por 100 no lugar errado. O modelo diz "45,90" como o
 * usuário disse; `transactionSchema` faz o resto, uma vez só.
 *
 * ⚠️ `conta` E `cartao` SÃO EXCLUDENTES. Compra no cartão não tem conta (entra na fatura, não
 * no saldo) — a regra é do módulo, e está no `.refine` do schema do formulário.
 */
export const lancarTransacaoEntrada = z
  .object({
    tipo: z.enum(["despesa", "receita"]),
    valor: z.number().positive().max(1_000_000),
    descricao: z.string().trim().min(1).max(200),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .nullable()
      .optional(),
    conta: z.string().trim().max(120).nullable().optional(),
    cartao: z.string().trim().max(120).nullable().optional(),
    categoria: z.string().trim().max(120).nullable().optional(),
  })
  .strict();
export type LancarTransacaoEntrada = z.infer<typeof lancarTransacaoEntrada>;

export const excluirTransacaoEntrada = z.object({ transacao_id: z.uuid() }).strict();
export type ExcluirTransacaoEntrada = z.infer<typeof excluirTransacaoEntrada>;

export function parseComTransacao<T extends z.ZodType>(schema: T) {
  return (payload: unknown): { ok: true; valor: unknown } | { ok: false } => {
    const r = schema.safeParse(payload);
    return r.success ? { ok: true, valor: r.data } : { ok: false };
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   Resolução
   ══════════════════════════════════════════════════════════════════════════════════════ */

/** Mesma disciplina dos outros commands: exato ganha de parcial, e ambíguo RECUSA. */
function umSo<T>(
  candidatos: readonly T[],
  nomeDe: (c: T) => string,
  termo: string,
  oQue: string,
): T {
  const alvo = termo.toLowerCase();
  const exatos = candidatos.filter((c) => nomeDe(c).toLowerCase() === alvo);
  const lista =
    exatos.length > 0
      ? exatos
      : candidatos.filter((c) => nomeDe(c).toLowerCase().includes(alvo));

  if (lista.length === 0) {
    throw new EfeitoImpossivel(
      `Não encontrei ${oQue} "${termo}". Nada foi lançado — confira o nome no Financeiro.`,
    );
  }
  if (lista.length > 1) {
    throw new EfeitoImpossivel(
      `"${termo}" casa com ${lista.length} ${oQue}s (${lista.map(nomeDe).join(", ")}). Diga qual — o lançamento vai para um deles.`,
    );
  }
  return lista[0];
}

export type FaturaDoLancamento = {
  readonly competencia: string;
  readonly dataFechamento: string;
  readonly dataVencimento: string;
  readonly status: string;
  readonly jaPaga: boolean;
};

export type TransacaoResolvida = {
  readonly tipo: "despesa" | "receita";
  readonly data: string;
  readonly conta: { id: string; nome: string } | null;
  readonly cartao: { id: string; nome: string } | null;
  readonly categoria: { id: string; nome: string } | null;
  readonly fatura: FaturaDoLancamento | null;
};

/**
 * Descobre em QUAL FATURA a compra cai, sem criar a linha.
 *
 * ⚠️ `resolverFatura` é a regra PURA do módulo (`invoice.ts`) — a mesma que
 * `resolveOrCreateStatement` usa na hora de gravar. Reimplementar "a compra depois do
 * fechamento vai para o mês seguinte" aqui faria a previsão prometer uma fatura e a gravação
 * escolher outra.
 */
async function faturaDaCompra(
  cardId: string,
  dataCompra: string,
  hoje: string,
): Promise<FaturaDoLancamento> {
  const card = await getCardBillingDays(cardId);
  if (!card) {
    throw new EfeitoImpossivel("O cartão não existe mais (ou não é seu). Nada foi lançado.");
  }

  const alvo = resolverFatura(dataCompra, card.dia_fechamento, card.dia_vencimento);

  // A fatura pode ainda não existir — e aí ela é `aberta` por construção.
  const existente = await getStatementByCompetencia(cardId, alvo.competencia);

  const status = existente ? statusEfetivo(existente, hoje) : "aberta";

  return {
    competencia: alvo.competencia,
    dataFechamento: alvo.dataFechamento,
    dataVencimento: alvo.dataVencimento,
    status: STATEMENT_STATUS_LABELS[status],
    jaPaga: status === "paga",
  };
}

/**
 * ⛔ FATURA JÁ PAGA É RECUSA, e é a ÚNICA restrição desta ferramenta que o FORMULÁRIO não tem.
 *
 * No formulário, o dono pode lançar numa fatura paga sabendo o que faz — ele está olhando a
 * tela da fatura, com o total e a data do pagamento na frente. Aqui o pedido veio em
 * linguagem natural, sobre uma fatura que ele nem citou (quem a escolheu foi a regra de
 * fechamento), e mexer no valor de uma conta que ele JÁ PAGOU é o tipo de efeito que ele
 * descobriria pelo extrato do banco, semanas depois.
 *
 * ⚠️ PURA E EXPORTADA para teste — uma mutação que a desligava passou verde enquanto ela era
 * uma linha dentro de `resolverTransacao`, que exige banco para ser exercitada.
 */
export function recusarSeFaturaPaga(fatura: FaturaDoLancamento | null): void {
  if (!fatura?.jaPaga) return;
  throw new EfeitoImpossivel(
    `Essa compra cairia na fatura de ${fatura.competencia.slice(0, 7)}, que já está PAGA. Nada foi lançado — se for isso mesmo, lance pela tela da fatura.`,
  );
}

export async function resolverTransacao(
  d: LancarTransacaoEntrada,
): Promise<TransacaoResolvida> {
  const hoje = hojeISO();
  const data = d.data ?? hoje;

  if (d.conta && d.cartao) {
    throw new EfeitoImpossivel(
      "Diga conta OU cartão, não os dois: compra no cartão entra na fatura, não no saldo da conta. Nada foi lançado.",
    );
  }
  if (d.cartao && d.tipo !== "despesa") {
    throw new EfeitoImpossivel(
      "Cartão de crédito só recebe despesa. Uma receita entra numa conta. Nada foi lançado.",
    );
  }

  const cartao = d.cartao
    ? umSo(await getCreditCards(), (c) => c.nome, d.cartao, "cartão")
    : null;

  /**
   * ⚠️ Sem conta E sem cartão, RECUSA — não escolhe a primeira conta, nem a "principal".
   * O lançamento tem de sair de algum lugar, e escolher por ele faria o saldo de uma conta
   * que ele não citou mudar sem que a previsão tivesse como ele conferir de cabeça.
   */
  let conta: { id: string; nome: string } | null = null;
  if (!cartao) {
    if (!d.conta) {
      throw new EfeitoImpossivel(
        "Falta dizer de qual conta (ou cartão) é este lançamento. Nada foi lançado.",
      );
    }
    // ⚠️ `accounts.name` e `credit_cards.nome`: o schema mistura os dois idiomas desde a
    // Fase 02. Ler a coluna errada aqui daria `undefined` e faria toda busca falhar.
    const achada = umSo(await getAccounts(), (c) => c.name, d.conta, "conta");
    conta = { id: achada.id, nome: achada.name };
  }

  /**
   * A categoria é OPCIONAL de propósito. Sem ela o lançamento entra sem classificação — que é
   * o que o formulário também permite — e a previsão diz isso. Escolher uma categoria por
   * semelhança de texto ("mercado" → Alimentação) seria a IA classificando o gasto do dono
   * com uma regra que ele nunca viu, e que os relatórios dele passariam a refletir.
   */
  const categoriaResolvida = d.categoria
    ? umSo(
        // `kind` é o discriminador da categoria ('despesa' | 'receita' | 'ambos') — filtrar
        // por ele evita lançar uma despesa numa categoria que só existe para receita.
        (await getCategories()).filter((c) => c.kind === d.tipo || c.kind === "ambos"),
        (c) => c.name,
        d.categoria,
        "categoria",
      )
    : null;

  const fatura = cartao ? await faturaDaCompra(cartao.id, data, hoje) : null;
  recusarSeFaturaPaga(fatura);

  return {
    tipo: d.tipo,
    data,
    conta,
    cartao: cartao ? { id: cartao.id, nome: cartao.nome } : null,
    categoria: categoriaResolvida
      ? { id: categoriaResolvida.id, nome: categoriaResolvida.name }
      : null,
    fatura,
  };
}

/**
 * Traduz a entrada da IA para o schema do FORMULÁRIO — o ponto em que os dois caminhos
 * convergem. Daqui para baixo, `criarTransacao` recebe o mesmo objeto que receberia vindo do
 * diálogo "Novo lançamento".
 *
 * ⚠️ `classificacao: "pessoal"` sai FIXO. É o que desliga a divisão com terceiros no serviço
 * (`isShared` fica falso), e é a razão de a ferramenta não ter campo de pessoa.
 */
export function paraOSchemaDoFormulario(
  d: LancarTransacaoEntrada,
  r: TransacaoResolvida,
): Record<string, unknown> {
  return {
    type: d.tipo,
    payment_method: r.cartao ? "cartao_credito" : "debito",
    account_id: r.conta?.id ?? "",
    transfer_account_id: "",
    card_id: r.cartao?.id ?? "",
    category_id: r.categoria?.id ?? "",
    subcategory_id: "",
    amount: d.valor,
    purchase_date: r.data,
    competence_date: r.data,
    description: d.descricao,
    notes: "",
    tags: [],
    // O lançamento nasce como FATO consumado — é o padrão do formulário para gasto do dia.
    status: "pago",
    classificacao: "pessoal",
    parts: [],
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   A previsão
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverLancarTransacao(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as LancarTransacaoEntrada;
  const r = await resolverTransacao(d);

  const linhas = [
    { rotulo: "Tipo", valor: d.tipo === "despesa" ? "Despesa" : "Receita" },
    { rotulo: "Descrição", valor: d.descricao },
    { rotulo: "Valor", valor: formatCurrency(d.valor) },
    { rotulo: "Data", valor: formatDate(`${r.data}T12:00:00.000Z`) },
    {
      rotulo: r.cartao ? "Cartão" : "Conta",
      valor: r.cartao?.nome ?? r.conta?.nome ?? "—",
    },
    { rotulo: "Categoria", valor: r.categoria?.nome ?? "sem categoria" },
  ];

  const ressalvas: string[] = [];

  /**
   * ⚠️ A RESSALVA QUE ESTA FERRAMENTA EXISTE PARA DAR.
   *
   * "Comprei 80 reais no cartão" não diz em qual fatura isso cai — e depende do dia de
   * fechamento. Uma compra do dia 29 pode cair na fatura do mês SEGUINTE, e o dono só
   * descobriria ao abrir a conta. A regra que decide é a mesma da gravação.
   */
  if (r.fatura) {
    ressalvas.push(
      `A compra entra na fatura de ${r.fatura.competencia.slice(0, 7)} (${r.fatura.status}), que fecha em ${formatDate(`${r.fatura.dataFechamento}T12:00:00.000Z`)} e vence em ${formatDate(`${r.fatura.dataVencimento}T12:00:00.000Z`)}. Compra no cartão NÃO muda o saldo da conta — quem move o saldo é o pagamento da fatura.`,
    );
  } else {
    ressalvas.push(
      `O lançamento nasce como ${d.tipo === "despesa" ? "pago" : "recebido"} e ${d.tipo === "despesa" ? "reduz" : "aumenta"} o saldo de ${r.conta?.nome} em ${formatCurrency(d.valor)}.`,
    );
  }

  // O que a ferramenta NÃO faz, dito ao dono — senão ele supõe que o que mencionou entrou.
  ressalvas.push(
    "O lançamento é à vista e só seu: a IA não cria parcelamento, não divide com terceiros e não faz transferência entre contas. Para qualquer um desses, use a tela do Financeiro.",
  );

  if (!r.categoria) {
    ressalvas.push(
      "Sem categoria: o lançamento entra sem classificação e aparece assim nos relatórios até você categorizá-lo.",
    );
  }
  if (r.data > hojeISO()) {
    ressalvas.push("A data é futura — o lançamento entra já marcado como concluído nesse dia.");
  }

  return {
    command: "lancarTransacao",
    payload: { ...d },
    entidades: [
      ...(r.conta ? [{ tipo: "conta", id: r.conta.id, rota: "/financeiro/contas" }] : []),
      ...(r.cartao ? [{ tipo: "cartao", id: r.cartao.id, rota: "/cartoes" }] : []),
    ],
    previsao: {
      resumo: `Lançar ${d.tipo === "despesa" ? "a despesa" : "a receita"} "${d.descricao}" de ${formatCurrency(d.valor)} em ${r.cartao?.nome ?? r.conta?.nome}, no dia ${formatDate(`${r.data}T12:00:00.000Z`)}.`,
      linhas,
      ressalvas,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   excluirTransacao — o `undo` declarado
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverExcluirTransacao(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as ExcluirTransacaoEntrada;
  const linha = await getTransactionById(d.transacao_id);

  if (!linha) {
    throw new EfeitoImpossivel("O lançamento não existe mais (ou não é seu). Nada foi alterado.");
  }
  if (linha.transfer_group_id) {
    throw new EfeitoImpossivel(
      "Este lançamento é uma transferência e não pode ser desfeito por aqui.",
    );
  }

  return {
    command: "excluirTransacao",
    payload: { ...d },
    entidades: [{ tipo: "transacao", id: d.transacao_id, rota: ROTA_DOS_LANCAMENTOS }],
    previsao: {
      resumo: `Excluir o lançamento "${linha.description ?? "sem descrição"}" de ${formatCurrency(Number(linha.amount))}.`,
      linhas: [
        { rotulo: "Descrição", valor: String(linha.description ?? "sem descrição") },
        { rotulo: "Valor", valor: formatCurrency(Number(linha.amount)) },
        { rotulo: "Tipo", valor: String(linha.type) },
      ],
      ressalvas: [
        "O saldo (ou a fatura) volta ao que era antes deste lançamento. A exclusão não tem desfazer.",
      ],
    },
  };
}

export function rotaDoLancamento(): string {
  return ROTA_DOS_LANCAMENTOS;
}

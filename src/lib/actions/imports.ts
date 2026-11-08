"use server";

import { revalidatePath } from "next/cache";
import { motivoParaNaoApagar } from "@/lib/finance/protecao-do-recebivel";
import { protecaoDosRecebiveis } from "@/lib/finance/recebimentos-leitura";
import {
  authContext,
  dbError,
  falhaDeLeituraAntes,
  falhaDeLeituraDepois,
  gravadoEmParte,
  invalid,
  nadaGravado,
  notAuthed,
  type AuthContext,
} from "@/lib/actions/helpers";
import { createTransaction } from "@/lib/actions/transactions";
import { createInstallmentPurchase } from "@/lib/actions/installments";
import {
  getOrCreateStatementForCompetencia,
  resolveOrCreateStatement,
} from "@/lib/finance/statements";
import { ehErroDeLeitura, exigir, listaCompleta } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { resolverFatura } from "@/lib/finance/invoice";
import { dataDoExtratoAGravar } from "@/lib/finance/caixa";
import { MSG_ESTORNO_NAO_ABATE } from "@/lib/finance/reembolso";
import { detectarCompetenciaFatura } from "@/lib/import/competencia";
import {
  importUploadSchema,
  remapSchema,
  updateImportRowSchema,
} from "@/lib/validators/import";
import { importRowReembolsoSchema, splitSchema } from "@/lib/validators/split";
import {
  autoDetectMapping,
  applyMapping,
  detectarSinalNegativoDespesa,
} from "@/lib/import/mapping";
import { chaveComposta, detectarDuplicados } from "@/lib/import/dedup";
import {
  marcarParcelasJaLancadas,
  type ParcelaLancada,
} from "@/lib/import/parcelas-lancadas";
import {
  marcarTransferencias,
  pernasDaTransferencia,
} from "@/lib/import/transferencia";
import { descricaoBaseParcela } from "@/lib/import/normalize";
import {
  escalarPartesParcelado,
  planejarImportParcelado,
} from "@/lib/import/parcelamento";
import {
  FRASE_DO_LOTE_NAO_MARCADO,
  MOTIVO_IMPORTACAO_INTERROMPIDA,
  fraseDoCommitInterrompido,
} from "@/lib/import/frases-do-commit";
import { parseOfx } from "@/lib/import/ofx";
import { parseCsv } from "@/lib/import/csv";
import { parseXlsx } from "@/lib/import/xlsx";
import type { ImportFormat } from "@/lib/import/constants";
import type {
  ColumnMapping,
  NormalizedRow,
  ParsedTable,
} from "@/lib/import/types";
import {
  centavosParaReais,
  hojeISO,
  reaisParaCentavos,
} from "@/lib/format";
import type { ActionResult } from "@/types/finance";
import type { ImportSplitPart } from "@/types/database";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const R = ROTULOS_DE_LEITURA;

function revalidateImports() {
  revalidatePath("/importar");
}

function revalidateFinance() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/cartoes");
  revalidatePath("/faturas");
  revalidatePath("/terceiros");
  revalidatePath("/parcelamentos");
  revalidatePath("/importar");
}

/** Descobre o formato pela extensão do arquivo. */
function formatoPorNome(name: string): ImportFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  if (lower.endsWith(".ofx")) return "ofx";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  return null;
}

/** Decodifica texto tentando UTF-8 e caindo para latin1 (comum em extratos BR). */
function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (utf8.includes("�")) {
    try {
      return new TextDecoder("latin1").decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

/** Lê o arquivo (pelo formato) em uma ParsedTable. Pode lançar em arquivo malformado. */
function parseBuffer(buffer: ArrayBuffer, formato: ImportFormat): ParsedTable {
  if (formato === "excel") return parseXlsx(buffer);
  const text = decodeText(buffer);
  return formato === "ofx" ? parseOfx(text) : parseCsv(text);
}

/**
 * Monta o conjunto de chaves compostas das transações JÁ EXISTENTES do alvo (cartão/conta),
 * para a deduplicação não reimportar o que o usuário já tem. `amount` é sempre o módulo.
 */
async function existingKeysFor(
  ctx: Awaited<ReturnType<typeof authContext>>,
  origem: "cartao" | "conta",
  targetId: string,
): Promise<Set<string>> {
  if (!ctx) return new Set();
  const col = origem === "cartao" ? "card_id" : "account_id";
  // 03-G — a dedup sobre um conjunto CORTADO reimportaria duplicata: erro, saturação ou falta de
  // contagem LANÇAM, e quem chama recusa antes de gravar.
  const res = await ctx.supabase
    .from("transactions")
    .select("purchase_date, amount, description", { count: "exact" })
    .eq(col, targetId)
    .limit(5000);
  const data = listaCompleta(res, "os lançamentos já existentes");
  const set = new Set<string>();
  for (const t of data) {
    const k = chaveComposta(
      t.purchase_date,
      reaisParaCentavos(t.amount),
      t.description ?? "",
      targetId,
    );
    if (k) set.add(k);
  }
  return set;
}

/**
 * Parcelas ATIVAS já lançadas no cartão, para reconhecer na fatura do mês seguinte a compra que
 * já entrou como parcelamento (ver `parcelas-lancadas.ts`). As parcelas vivem em
 * `transaction_installments` — fora do alcance de `existingKeysFor`, que só lê `transactions`.
 *
 * `status = 'ativa'` de propósito: parcela cancelada não ocupa mais a fatura, então não pode
 * bloquear a importação da linha correspondente.
 */
async function parcelasLancadasFor(
  ctx: AuthContext,
  cardId: string,
): Promise<ParcelaLancada[]> {
  // 03-G — mesma regra de `existingKeysFor`: com a lista cortada, a parcela já lançada entraria
  // de novo. Lança; quem chama recusa antes de gravar.
  const res = await ctx.supabase
    .from("transaction_installments")
    .select(
      "numero, total_parcelas, valor, data_competencia, parent:transactions!transaction_installments_parent_transaction_id_fkey(description)",
      { count: "exact" },
    )
    .eq("card_id", cardId)
    .eq("status", "ativa")
    .limit(5000);
  const data = listaCompleta(res, "as parcelas já lançadas");

  return data.map((p) => {
    const parent = p.parent as { description: string | null } | null;
    const descricao = parent?.description ?? "";
    return {
      numero: p.numero,
      totalParcelas: p.total_parcelas,
      valorCentavos: reaisParaCentavos(p.valor),
      competencia: p.data_competencia,
      descricaoBase: descricaoBaseParcela(descricao),
      descricaoOriginal: descricao,
    };
  });
}

/** Converte NormalizedRow[] em linhas para insert em import_rows. */
function toRowInserts(
  userId: string,
  batchId: string,
  rows: NormalizedRow[],
) {
  return rows.map((r) => ({
    user_id: userId,
    import_batch_id: batchId,
    linha_index: r.linhaIndex,
    raw: r.raw,
    data_norm: r.dataNorm,
    descricao: r.descricao || null,
    valor: r.valorCentavos != null ? centavosParaReais(r.valorCentavos) : null,
    tipo: r.tipo,
    categoria_sugerida_id: r.categoriaSugeridaId,
    parcela: r.parcela,
    parcelas_total: r.parcelasTotal,
    identificador: r.identificador,
    import_as: "single" as const,
    status: r.status,
    motivo: r.motivo,
  }));
}

/**
 * Detecta a competência da fatura de cartão sendo importada, a partir das linhas à vista do lote
 * (regra pura em `detectarCompetenciaFatura`). Retorna 'yyyy-MM-01' ou null (sem linha à vista
 * para inferir). Usada no parse/remap para pré-preencher e na revisão para o usuário confirmar.
 */
async function detectarCompetenciaLote(
  ctx: AuthContext,
  cardId: string,
  rows: { dataNorm: string | null; parcelasTotal: number | null }[],
): Promise<string | null> {
  // 03-G — erro de leitura LANÇA (antes virava "sem competência detectada").
  const card = exigir(
    await ctx.supabase
      .from("credit_cards")
      .select("dia_fechamento, dia_vencimento")
      .eq("id", cardId)
      .maybeSingle(),
    R.cartao,
  );
  if (!card) return null;
  return (
    detectarCompetenciaFatura(rows, card.dia_fechamento, card.dia_vencimento)
      ?.competencia ?? null
  );
}

/**
 * Lê e processa um arquivo importado: parseia, detecta o mapeamento, normaliza, sugere
 * categorias e DETECTA DUPLICADOS, persistindo o lote (import_batches) + as linhas
 * (import_rows) para revisão editável. NÃO cria transações ainda (isso é o commit).
 * O `user_id` vem sempre de auth.uid(); o arquivo é processado no servidor.
 */
export async function parseImportFile(
  formData: FormData,
): Promise<ActionResult<{ batchId: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = importUploadSchema.safeParse({
    origem: formData.get("origem"),
    credit_card_id: formData.get("credit_card_id"),
    account_id: formData.get("account_id"),
    sinal_negativo_despesa: formData.get("sinal_negativo_despesa"),
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return dbError("Selecione um arquivo para importar.");
  }
  if (file.size > MAX_FILE_BYTES) {
    return dbError("Arquivo muito grande (máximo 5 MB).");
  }
  const formato = formatoPorNome(file.name);
  if (!formato) {
    return dbError("Formato não suportado. Use .xlsx, .xls, .csv ou .ofx.");
  }

  let table: ParsedTable;
  try {
    table = parseBuffer(await file.arrayBuffer(), formato);
  } catch {
    return dbError("Não foi possível ler o arquivo. Verifique se não está corrompido.");
  }
  if (table.rows.length === 0) {
    return dbError(
      "Não encontramos lançamentos no arquivo. Confira o conteúdo e o formato.",
    );
  }

  const fields = autoDetectMapping(table.headers);
  const targetId = d.origem === "cartao" ? d.credit_card_id! : d.account_id!;

  // 03-G — nenhuma escrita antes desta região: toda leitura que decide o lote mora nela, e
  // qualquer uma que falhe (ou venha cortada) recusa com "Nada foi alterado".
  let sinalNegativoDespesa: boolean;
  let competenciaFatura: string | null;
  let conferidas: NormalizedRow[];
  let duplicadas: number;
  try {
    const cats = listaCompleta(
      await ctx.supabase.from("categories").select("id, name", { count: "exact" }),
      R.categorias,
    );
    const categorias = cats.map((c) => ({ id: c.id, name: c.name }));

    // Fatura de cartão não tem convenção de sinal única (OFX traz compra negativa; planilha traz
    // compra positiva), então ela é DETECTADA do arquivo — assumir uma delas fazia a fatura
    // inteira entrar como estorno. Em extrato de conta quem decide continua sendo o usuário.
    sinalNegativoDespesa =
      d.origem === "cartao"
        ? detectarSinalNegativoDespesa(table, fields)
        : d.sinal_negativo_despesa;

    const normalized = applyMapping(table, fields, {
      origem: d.origem,
      sinalNegativoDespesa,
      categorias,
    });
    // Fatura de cartão: detecta a competência (das compras à vista) para ancorar parcelas e
    // últimas parcelas na fatura certa. O usuário confirma/ajusta na revisão. Vem ANTES da dedup
    // porque a conferência contra parcelamentos já lançados precisa dela; o resultado é o mesmo,
    // pois `detectarCompetenciaFatura` só lê data e total de parcelas — campos que a dedup não toca.
    competenciaFatura =
      d.origem === "cartao" && d.credit_card_id
        ? await detectarCompetenciaLote(ctx, d.credit_card_id, normalized)
        : null;

    const existingKeys = await existingKeysFor(ctx, d.origem, targetId);
    const deduped = detectarDuplicados(normalized, existingKeys, targetId);
    // Segundo passe: a linha já coberta por uma parcela ativa deste cartão (a compra que o mês
    // anterior lançou como parcelamento) entraria duplicada — a dedup não a vê, pois as parcelas
    // não estão em `transactions`.
    conferidas =
      d.origem === "cartao" && d.credit_card_id
        ? marcarParcelasJaLancadas(
            deduped,
            await parcelasLancadasFor(ctx, d.credit_card_id),
            competenciaFatura,
          )
        : // Extrato: avisa o que parece transferência (e auto-ignora o pagamento de fatura, que
          // já entra pelo cartão). Depois da dedup de propósito — ela limpa o `motivo` ao promover
          // a linha, e rodar antes apagaria o aviso justamente nas linhas que ele existe para marcar.
          marcarTransferencias(deduped, d.origem);
    duplicadas = conferidas.filter((r) => r.status === "duplicada").length;
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return falhaDeLeituraAntes(e.oQue);
  }

  const { data: batch, error: batchErr } = await ctx.supabase
    .from("import_batches")
    .insert({
      user_id: ctx.userId,
      file_name: file.name,
      formato,
      origem: d.origem,
      credit_card_id: d.origem === "cartao" ? d.credit_card_id : null,
      account_id: d.origem === "conta" ? d.account_id : null,
      sinal_negativo_despesa: sinalNegativoDespesa,
      status: "revisando",
      total_linhas: conferidas.length,
      total_duplicadas: duplicadas,
      competencia_fatura: competenciaFatura,
      column_mapping: { headers: table.headers, fields },
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    return dbError("Não foi possível registrar o lote de importação.");
  }

  const { error: rowsErr } = await ctx.supabase
    .from("import_rows")
    .insert(toRowInserts(ctx.userId, batch.id, conferidas));
  if (rowsErr) {
    // 03-G2 (S11) — a compensação é conferida: se o lote vazio não saiu, ele continua na lista e a
    // frase diz o que fazer com ele, em vez de fingir que nada ficou.
    const { error: compErr } = await ctx.supabase
      .from("import_batches")
      .delete()
      .eq("id", batch.id);
    if (compErr) {
      revalidateImports();
      return gravadoEmParte(
        "O lote foi registrado, mas as linhas do arquivo não foram salvas e o lote vazio não pôde ser removido. Exclua o lote em Importações e envie o arquivo de novo.",
      );
    }
    return dbError("Não foi possível salvar as linhas do arquivo.");
  }

  revalidateImports();
  return { ok: true, data: { batchId: batch.id } };
}

/**
 * Re-aplica o mapeamento de colunas de um lote (a partir dos dados crus já salvos, sem
 * reupload): re-normaliza, re-sugere categorias e re-detecta duplicados, substituindo as
 * linhas. Só permitido enquanto o lote não foi importado.
 */
export async function remapImportBatch(
  batchId: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = remapSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const fields = parsed.data.fields as ColumnMapping;

  // 03-G — nenhuma escrita antes desta região; qualquer leitura que falhe recusa antes do
  // `delete` das linhas.
  let headers: string[];
  let competenciaFatura: string | null;
  let conferidas: NormalizedRow[];
  try {
    const batch = exigir(
      await ctx.supabase
        .from("import_batches")
        .select("id, origem, credit_card_id, account_id, status, column_mapping")
        .eq("id", batchId)
        .maybeSingle(),
      R.loteDaImportacao,
    );
    if (!batch) return dbError("Lote não encontrado.");
    if (batch.status === "importado" || batch.status === "cancelado") {
      return dbError("Este lote já foi finalizado e não pode ser remapeado.");
    }

    // ⛔ O remap APAGA todas as linhas e regrava as lidas: com a leitura cortada pelo max_rows,
    // ele perderia linhas do lote em silêncio.
    const rows = listaCompleta(
      await ctx.supabase
        .from("import_rows")
        .select("raw", { count: "exact" })
        .eq("import_batch_id", batchId)
        .order("linha_index", { ascending: true }),
      R.linhasDaImportacao,
    );
    headers =
      (batch.column_mapping as { headers?: string[] } | null)?.headers ?? [];
    const table: ParsedTable = {
      headers,
      rows: rows.map((r) => (Array.isArray(r.raw) ? (r.raw as string[]) : [])),
    };

    const origem = batch.origem as "cartao" | "conta";
    const targetId = (
      origem === "cartao" ? batch.credit_card_id : batch.account_id
    ) as string;

    const cats = listaCompleta(
      await ctx.supabase.from("categories").select("id, name", { count: "exact" }),
      R.categorias,
    );
    const categorias = cats.map((c) => ({ id: c.id, name: c.name }));

    const normalized = applyMapping(table, fields, {
      origem,
      sinalNegativoDespesa: parsed.data.sinal_negativo_despesa,
      categorias,
    });
    // Remap recalcula tudo (datas/valores/parcelas) → re-detecta a competência da fatura. Assim
    // como no parse, vem antes da dedup para alimentar a conferência de parcelamentos.
    competenciaFatura =
      origem === "cartao"
        ? await detectarCompetenciaLote(ctx, targetId, normalized)
        : null;

    const existingKeys = await existingKeysFor(ctx, origem, targetId);
    const deduped = detectarDuplicados(normalized, existingKeys, targetId);
    conferidas =
      origem === "cartao"
        ? marcarParcelasJaLancadas(
            deduped,
            await parcelasLancadasFor(ctx, targetId),
            competenciaFatura,
          )
        : marcarTransferencias(deduped, origem);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return falhaDeLeituraAntes(e.oQue);
  }

  // 03-G2 (S11) — as três escritas são conferidas. O `delete` que falha não apagou nada (um comando
  // só). Depois dele, as linhas antigas JÁ se foram — e o remap lê o `raw` dessas mesmas linhas, então
  // "aplicar de novo" não é saída: o que resta é reenviar o arquivo.
  const { error: delErr } = await ctx.supabase
    .from("import_rows")
    .delete()
    .eq("import_batch_id", batchId);
  if (delErr) return nadaGravado("aplicar o mapeamento");

  const { error: insErr } = await ctx.supabase
    .from("import_rows")
    .insert(toRowInserts(ctx.userId, batchId, conferidas));
  if (insErr) {
    revalidateImports();
    return gravadoEmParte(
      "As linhas antigas do lote foram removidas e as novas não foram salvas. Exclua o lote em Importações e envie o arquivo de novo.",
    );
  }

  const { error: loteErr } = await ctx.supabase
    .from("import_batches")
    .update({
      status: "revisando",
      sinal_negativo_despesa: parsed.data.sinal_negativo_despesa,
      total_linhas: conferidas.length,
      total_duplicadas: conferidas.filter((r) => r.status === "duplicada").length,
      competencia_fatura: competenciaFatura,
      column_mapping: { headers, fields },
    })
    .eq("id", batchId);
  if (loteErr) {
    revalidateImports();
    // As linhas novas guardam o `raw`, então aplicar o mapeamento de novo funciona de verdade.
    return gravadoEmParte(
      "As linhas foram remapeadas, mas o lote não foi atualizado. Aplique o mapeamento de novo.",
    );
  }

  revalidateImports();
  return { ok: true, data: undefined };
}

/** As três colunas do reembolso da revisão (04-C · T7), todas de volta a "sem escolha". */
const LIMPA_O_REEMBOLSO = {
  receita_classificacao: null,
  reembolso_pessoa_id: null,
  reembolso_sobra: null,
} as const;

/**
 * Edita uma linha na revisão: trocar categoria, corrigir data/valor/descrição, definir tipo,
 * importar como parcelamento, e incluir/ignorar/forçar (status). Só aplica os campos enviados.
 */
export async function updateImportRow(
  rowId: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = updateImportRowSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  // Trava por LINHA, não pelo lote: a linha que já virou lançamento é imutável, mas as que
  // ficaram de fora (duplicada/ignorada/erro) seguem editáveis mesmo depois do lote importado —
  // senão marcar "não é duplicidade" depois da importação não teria como chegar à fatura.
  const rowRes = await ctx.supabase
    .from("import_rows")
    .select(
      "id, status, transaction_id, classificacao, import_batches(status, origem, account_id)",
    )
    .eq("id", rowId)
    .maybeSingle();
  if (rowRes.error) return falhaDeLeituraAntes("a linha da importação");
  const row = rowRes.data;
  if (!row) return dbError("Linha não encontrada.");
  const batch = row.import_batches as {
    status?: string;
    origem?: string;
    account_id?: string | null;
  } | null;
  if (batch?.status === "cancelado") return dbError("Este lote foi cancelado.");
  if (row.status === "importada" || row.transaction_id) {
    return dbError(
      "Esta linha já virou lançamento. Edite o lançamento em Financeiro, ou desfaça a importação do lote.",
    );
  }

  // Escolher a conta de destino é o ATO de transformar a linha em transferência (não existe
  // `tipo = 'transferencia'`; ver a migration). Por isso as travas moram aqui, e não no commit:
  // barrar no momento da escolha é o que impede o lote de chegar ao fim com uma linha que só vai
  // falhar lá.
  if (d.transfer_account_id) {
    if (batch?.origem !== "conta") {
      return invalid({
        transfer_account_id: ["Transferência só existe em extrato de conta."],
      });
    }
    if (d.transfer_account_id === batch.account_id) {
      return invalid({
        transfer_account_id: [
          "A conta de destino tem de ser diferente da conta do extrato.",
        ],
      });
    }
    // Transferência não é despesa de ninguém: dividir uma exigiria decidir quem "pagou" um
    // dinheiro que não saiu do casal, e o motor de divisão (applySplit) só sabe repartir gasto.
    if (row.classificacao !== "pessoal") {
      return invalid({
        transfer_account_id: [
          "Esta linha está dividida com terceiros. Remova a divisão antes de marcá-la como transferência.",
        ],
      });
    }
  }

  const update: {
    status?: string;
    categoria_sugerida_id?: string | null;
    subcategoria_sugerida_id?: string | null;
    import_as?: string;
    descricao?: string | null;
    data_norm?: string;
    valor?: number;
    tipo?: string;
    transfer_account_id?: string | null;
    receita_classificacao?: string | null;
    reembolso_pessoa_id?: string | null;
    reembolso_sobra?: string | null;
  } = {};
  if (d.status !== undefined) update.status = d.status;
  if (d.categoria_sugerida_id !== undefined) {
    update.categoria_sugerida_id = d.categoria_sugerida_id;
    // Trocar a categoria sem dizer a subcategoria limpa a subcategoria: a antiga é de outra
    // categoria, e a FK composta recusaria a combinação.
    update.subcategoria_sugerida_id = null;
  }
  if (d.subcategoria_sugerida_id) {
    // A categoria SAI da subcategoria (RLS: só a do próprio dono é lida). Escolher as duas
    // separadamente deixaria o cliente montar "Delivery sob Moradia"; o banco recusaria, mas a
    // mensagem chegaria como erro genérico.
    const subRes = await ctx.supabase
      .from("subcategories")
      .select("id, category_id")
      .eq("id", d.subcategoria_sugerida_id)
      .maybeSingle();
    if (subRes.error) return falhaDeLeituraAntes("a subcategoria");
    const sub = subRes.data;
    if (!sub) {
      return invalid({ subcategoria_sugerida_id: ["Subcategoria não encontrada."] });
    }
    update.categoria_sugerida_id = sub.category_id;
    update.subcategoria_sugerida_id = sub.id;
  } else if (d.subcategoria_sugerida_id === null) {
    update.subcategoria_sugerida_id = null;
  }
  if (d.import_as !== undefined) update.import_as = d.import_as;
  if (d.descricao !== undefined) update.descricao = d.descricao || null;
  if (d.data_norm !== undefined) update.data_norm = d.data_norm;
  if (d.valor !== undefined) update.valor = d.valor;
  if (d.tipo !== undefined) update.tipo = d.tipo;
  if (d.transfer_account_id !== undefined) {
    update.transfer_account_id = d.transfer_account_id;
    // Transferência não tem categoria — o lançamento gravado também não terá
    // (`criarTransacao` força `category_id: null`). Deixar a sugestão na linha faria a revisão
    // prometer uma categoria que o lançamento não vai ter.
    if (d.transfer_account_id) {
      update.categoria_sugerida_id = null;
      update.subcategoria_sugerida_id = null;
    }
  }

  // 04-C · T7 — reembolso só existe em ENTRADA que vai virar lançamento: a linha que passa a ser
  // despesa, transferência ou ignorada perde pessoa, classificação e escolha da sobra no mesmo
  // update. Deixar o resíduo faria uma transferência (ou a volta da linha à revisão) carregar uma
  // pessoa que a revisão já não mostra. `commitImport` também não o lê fora do ramo da receita.
  if (
    d.tipo === "despesa" ||
    d.status === "ignorada" ||
    (d.transfer_account_id !== undefined && d.transfer_account_id !== null)
  ) {
    Object.assign(update, LIMPA_O_REEMBOLSO);
  }

  if (Object.keys(update).length === 0) {
    return { ok: true, data: undefined };
  }

  const { error } = await ctx.supabase
    .from("import_rows")
    .update(update)
    .eq("id", rowId);
  if (error) return dbError("Não foi possível atualizar a linha.");

  revalidateImports();
  return { ok: true, data: undefined };
}

/**
 * Define (ou remove) a divisão com terceiros de UMA linha da revisão (Fase 05 + 06). Guarda
 * `classificacao` + `split_parts` na linha; quem aplica de fato é o `commitImport`, repassando
 * para os mesmos motores de divisão (applySplit/applySplitParcelado). Só despesas podem ser
 * divididas; só enquanto o lote não foi finalizado.
 */
export async function setImportRowSplit(
  rowId: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = splitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const rowRes = await ctx.supabase
    .from("import_rows")
    .select(
      "id, tipo, status, transaction_id, transfer_account_id, import_batches(status)",
    )
    .eq("id", rowId)
    .maybeSingle();
  if (rowRes.error) return falhaDeLeituraAntes("a linha da importação");
  const row = rowRes.data;
  if (!row) return dbError("Linha não encontrada.");
  const batchStatus = (row.import_batches as { status?: string } | null)?.status;
  if (batchStatus === "cancelado") return dbError("Este lote foi cancelado.");
  if (row.status === "importada" || row.transaction_id) {
    return dbError(
      "Esta linha já virou lançamento. Ajuste a divisão em Financeiro, ou desfaça a importação do lote.",
    );
  }
  // A linha marcada como transferência tem `tipo = 'despesa'` (o sentido "saiu da conta"), então
  // a checagem de despesa abaixo a deixaria passar. Transferência não é gasto de ninguém: não há
  // o que repartir, e `criarTransacao` nem chega a olhar a divisão nesse caminho.
  if (parsed.data.classificacao !== "pessoal" && row.transfer_account_id) {
    return dbError(
      "Esta linha é uma transferência entre suas contas. Remova a conta de destino para poder dividi-la.",
    );
  }
  if (parsed.data.classificacao !== "pessoal" && row.tipo !== "despesa") {
    return dbError("Só é possível dividir despesas.");
  }

  const { error } = await ctx.supabase
    .from("import_rows")
    .update({
      classificacao: parsed.data.classificacao,
      split_parts: parsed.data.parts,
    })
    .eq("id", rowId);
  if (error) return dbError("Não foi possível salvar a divisão.");

  revalidateImports();
  return { ok: true, data: undefined };
}

/**
 * 04-C · T7 — define o reembolso de UMA linha de ENTRADA da revisão: pessoal ou de terceiro, de
 * quem, e o que fazer com a sobra. Só guarda a escolha; quem decide e grava é o `commitImport`,
 * pelo mesmo caminho do formulário (`criarTransacao` → `lerReembolsoDaReceita`), recalculando a
 * dívida linha a linha. Só extrato (estorno de cartão e transferência nunca têm pessoa), só
 * entrada, e só enquanto a linha não virou lançamento.
 *
 * A pessoa só é guardada com "de terceiro", e a escolha da sobra só com pessoa: guardar o que não
 * se aplica faria a revisão mostrar um vínculo que o commit ignora.
 */
export async function setImportRowReembolso(
  rowId: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = importRowReembolsoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const rowRes = await ctx.supabase
    .from("import_rows")
    .select(
      "id, tipo, status, transaction_id, transfer_account_id, import_batches(status, origem)",
    )
    .eq("id", rowId)
    .maybeSingle();
  if (rowRes.error) return falhaDeLeituraAntes("a linha da importação");
  const row = rowRes.data;
  if (!row) return dbError("Linha não encontrada.");
  const batch = row.import_batches as { status?: string; origem?: string } | null;
  if (batch?.status === "cancelado") return dbError("Este lote foi cancelado.");
  if (row.status === "importada" || row.transaction_id) {
    return dbError(
      "Esta linha já virou lançamento. Ajuste o reembolso em Financeiro, ou desfaça a importação do lote.",
    );
  }
  if (row.tipo !== "receita") return dbError("Só uma entrada pode ser reembolso.");
  if (row.transfer_account_id) {
    return dbError("Esta linha é uma transferência entre suas contas.");
  }
  if (batch?.origem === "cartao") return dbError(MSG_ESTORNO_NAO_ABATE);

  const d = parsed.data;
  const pessoaId = d.receita_classificacao === "terceiro" ? d.reembolso_pessoa_id : null;
  const { error } = await ctx.supabase
    .from("import_rows")
    .update({
      receita_classificacao: d.receita_classificacao,
      reembolso_pessoa_id: pessoaId,
      reembolso_sobra: pessoaId ? (d.reembolso_sobra ?? null) : null,
    })
    .eq("id", rowId);
  if (error) return dbError("Não foi possível salvar o reembolso.");

  revalidateImports();
  return { ok: true, data: undefined };
}

/**
 * Cria um ESTORNO/crédito de fatura como uma RECEITA vinculada à fatura do cartão (reduz o
 * total_atual da view). Vai por insert direto porque `createTransaction` só vincula statement_id
 * a despesas — aqui o crédito precisa entrar na MESMA fatura da data, fora do saldo de conta.
 * Valor sempre positivo (a subtração é feita na view); status 'recebido'.
 */
async function createCardEstorno(
  ctx: AuthContext,
  args: {
    cardId: string;
    amount: number;
    date: string;
    description: string;
    categoryId: string | null;
    subcategoryId: string | null;
    competencia?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  // Na importação, `competencia` força a fatura sendo importada; senão deriva da data.
  // 03-G (D-G26): no commit da importação, a falha vira o erro DESTA linha (o laço marca a linha
  // como erro e segue, como já fazia com o null); nenhuma escrita desta linha veio antes.
  let statementId: string | null;
  try {
    statementId = args.competencia
      ? await getOrCreateStatementForCompetencia(ctx, args.cardId, args.competencia)
      : await resolveOrCreateStatement(ctx, args.cardId, args.date);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return dbError(`Não foi possível ler ${ROTULOS_DE_LEITURA.fatura}.`);
  }
  if (!statementId) return dbError("Não foi possível resolver a fatura do estorno.");

  const { data, error } = await ctx.supabase
    .from("transactions")
    .insert({
      user_id: ctx.userId,
      type: "receita",
      payment_method: null,
      account_id: null,
      card_id: args.cardId,
      statement_id: statementId,
      category_id: args.categoryId,
      subcategory_id: args.subcategoryId,
      amount: args.amount,
      purchase_date: args.date,
      competence_date: args.date,
      description: args.description,
      status: "recebido",
      classificacao: "pessoal",
    })
    .select("id")
    .single();
  if (error || !data) return dbError("Não foi possível registrar o estorno do cartão.");
  return { ok: true, data: { id: data.id } };
}

/**
 * IMPORTA o lote: para cada linha `para_importar`, cria a transação reusando os MESMOS motores
 * do lançamento manual (createTransaction / createInstallmentPurchase) — nada de modelo paralelo.
 * Cada linha importada vira UMA transação na fatura/competência correta (regra das Fases 03/04);
 * grava `transaction_id` na linha. Falhas individuais marcam a linha como `erro` (não derrubam o
 * lote). Ao final, o lote vira `importado`.
 *
 * 03-G2 (S10, D-G2-11) — a ORDEM de cada linha é reserva → cria → marca:
 *  1. RESERVA: `update status = 'erro', motivo = MOTIVO_IMPORTACAO_INTERROMPIDA` condicionado a
 *     `status = 'para_importar'`. Vem ANTES de criar o lançamento (claim-first, invariante 37). Se
 *     outra execução do mesmo lote já pegou a linha, o update altera 0 linhas e esta pula — dois
 *     commits ao mesmo tempo não lançam a mesma linha duas vezes.
 *  2. CRIA o lançamento, como sempre.
 *  3. MARCA a linha `importada` (com o `transaction_id`) ou grava o motivo da falha.
 *  A reserva grava `erro` com o motivo de interrupção, e não um estado novo, porque é a verdade de
 *  quem cair no meio: a linha fica fora de `para_importar` dizendo que pode ter sido lançada, e
 *  rodar o commit de novo NÃO a relança. Erra para "pode não ter acontecido", nunca para "duas
 *  vezes". Toda escrita é conferida; a que falha para o commit com uma frase de lote.
 */
export async function commitImport(
  batchId: string,
): Promise<ActionResult<{ importadas: number; falhas: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const batchRes = await ctx.supabase
    .from("import_batches")
    .select("id, origem, credit_card_id, account_id, status, competencia_fatura")
    .eq("id", batchId)
    .maybeSingle();
  if (batchRes.error) return falhaDeLeituraAntes(R.loteDaImportacao);
  const batch = batchRes.data;
  if (!batch) return dbError("Lote não encontrado.");
  if (batch.status === "cancelado") {
    return dbError("Este lote foi cancelado.");
  }

  // Rodar de novo num lote já importado é seguro e às vezes necessário: só entram as linhas
  // `para_importar`, então a linha que o usuário destravou depois ("não é duplicidade") alcança
  // a fatura sem recriar nada — as já importadas ficaram com outro status.
  const rowsRes = await ctx.supabase
    .from("import_rows")
    .select(
      "id, data_norm, descricao, valor, tipo, categoria_sugerida_id, subcategoria_sugerida_id, parcela, parcelas_total, import_as, classificacao, split_parts, transfer_account_id, receita_classificacao, reembolso_pessoa_id, reembolso_sobra",
      { count: "exact" },
    )
    .eq("import_batch_id", batchId)
    .eq("status", "para_importar")
    .order("linha_index", { ascending: true });
  // 03-G — importar só parte do lote e marcá-lo como importado esconderia o resto.
  if (
    rowsRes.error ||
    rowsRes.count === null ||
    rowsRes.count > (rowsRes.data ?? []).length
  ) {
    return falhaDeLeituraAntes(R.linhasDaImportacao);
  }
  const rows = rowsRes.data;

  if ((rows ?? []).length === 0) {
    return dbError("Não há linhas marcadas para importar neste lote.");
  }

  // Competência-âncora da fatura de cartão: TODAS as linhas do arquivo pertencem à fatura sendo
  // importada — parcela "k" cai nela, "k+1, k+2…" nos meses seguintes; última parcela e à vista
  // também caem nela. Usa a competência confirmada na revisão; se faltar (lote antigo), detecta
  // das linhas e, em último caso, usa a fatura aberta de hoje.
  let competenciaAlvo: string | null = null;
  if (batch.origem === "cartao" && batch.credit_card_id) {
    competenciaAlvo = batch.competencia_fatura ?? null;
    if (!competenciaAlvo) {
      const cardRes = await ctx.supabase
        .from("credit_cards")
        .select("dia_fechamento, dia_vencimento")
        .eq("id", batch.credit_card_id)
        .maybeSingle();
      if (cardRes.error) return falhaDeLeituraAntes(R.cartao);
      const card = cardRes.data;
      if (card) {
        competenciaAlvo =
          detectarCompetenciaFatura(
            (rows ?? []).map((r) => ({
              dataNorm: r.data_norm,
              parcelasTotal: r.parcelas_total,
            })),
            card.dia_fechamento,
            card.dia_vencimento,
          )?.competencia ??
          resolverFatura(
            hojeISO(),
            card.dia_fechamento,
            card.dia_vencimento,
          ).competencia;
      }
    }
  }

  let importadas = 0;
  let falhas = 0;
  // 03-G2 (S10) — linhas que passaram pela reserva; entra na frase de quando o commit para.
  let processadas = 0;
  // K0.3 — "hoje" uma vez só: linha de extrato com data futura entra sem a data de caixa.
  const hoje = hojeISO();

  for (const r of rows ?? []) {
    if (r.data_norm == null || r.valor == null) {
      const semDados = await ctx.supabase
        .from("import_rows")
        .update({ status: "erro", motivo: "Data ou valor ausente." })
        .eq("id", r.id)
        .eq("status", "para_importar")
        .select("id");
      if (semDados.error) {
        revalidateFinance();
        return gravadoEmParte(fraseDoCommitInterrompido(processadas));
      }
      // Outra execução já pegou esta linha.
      if ((semDados.data ?? []).length === 0) continue;
      falhas++;
      processadas++;
      continue;
    }
    // 03-G2 (S10, D-G2-11) — a RESERVA vem antes de qualquer criação.
    const reserva = await ctx.supabase
      .from("import_rows")
      .update({ status: "erro", motivo: MOTIVO_IMPORTACAO_INTERROMPIDA })
      .eq("id", r.id)
      .eq("status", "para_importar")
      .select("id");
    if (reserva.error) {
      revalidateFinance();
      return gravadoEmParte(fraseDoCommitInterrompido(processadas));
    }
    // Outra execução já reservou a linha: não cria nada.
    if ((reserva.data ?? []).length === 0) continue;
    processadas++;
    const category = r.categoria_sugerida_id ?? "";
    // Só existe com a categoria (FK composta); transferência nunca chega aqui com uma.
    const subcategory = r.subcategoria_sugerida_id ?? "";
    // Divisão configurada na revisão (Fase 05): repassa para os motores reusados. `parts` vai cru
    // (splitSchema revalida no destino); só faz efeito em despesa compartilhada/de terceiro.
    const split =
      r.classificacao && r.classificacao !== "pessoal"
        ? {
            classificacao: r.classificacao,
            // Gravado pelo splitSchema (setImportRowSplit); o select inline devolve Json cru.
            parts: (r.split_parts ?? []) as ImportSplitPart[],
          }
        : { classificacao: "pessoal" as const, parts: [] as ImportSplitPart[] };
    let res: ActionResult<{ id: string }>;

    if (batch.origem === "cartao" && r.tipo === "receita") {
      // Estorno/crédito na fatura: receita vinculada à fatura (subtrai do total). Não é
      // parcelável nem divisível; entra direto via createCardEstorno.
      res = await createCardEstorno(ctx, {
        cardId: batch.credit_card_id!,
        amount: r.valor,
        date: r.data_norm,
        description: r.descricao ?? "",
        categoryId: r.categoria_sugerida_id ?? null,
        subcategoryId: r.subcategoria_sugerida_id ?? null,
        competencia: competenciaAlvo,
      });
    } else if (
      batch.origem === "cartao" &&
      r.import_as === "parcelamento" &&
      r.parcela != null &&
      r.parcelas_total != null &&
      r.parcela < r.parcelas_total
    ) {
      // Linha "k/N" de fatura: o valor da linha é o de UMA parcela. Gera só as restantes
      // (k..N), cada uma nesse valor, preservando a numeração original (regra em
      // parcelamento.ts). A última parcela (k === N) não entra aqui — cai no `else` abaixo
      // como despesa avulsa, pois não há parcela futura a gerar.
      const plano = planejarImportParcelado({
        valorParcelaCentavos: reaisParaCentavos(r.valor),
        parcela: r.parcela,
        parcelasTotal: r.parcelas_total,
      });
      // A divisão foi digitada/prevista contra UMA parcela (o valor da linha), mas
      // createInstallmentPurchase divide a parte de cada pessoa pelo total da compra
      // (parcela × qtd). Escala as partes por valor por `qtd` para o recebível por parcela
      // bater com o que o usuário viu — senão a parte do terceiro fica dividida por qtd.
      const splitParcelado =
        split.classificacao !== "pessoal"
          ? {
              classificacao: split.classificacao,
              parts: escalarPartesParcelado(split.parts, plano.qtd),
            }
          : split;
      res = await createInstallmentPurchase({
        card_id: batch.credit_card_id,
        qtd_parcelas: plano.qtd,
        valor_total: centavosParaReais(plano.valorTotalCentavos),
        numero_inicial: plano.numeroInicial,
        parcelas_total_label: plano.totalLabel,
        // A parcela atual (k) entra na fatura importada; as seguintes nos próximos meses.
        fatura_inicial_competencia: competenciaAlvo ?? undefined,
        purchase_date: r.data_norm,
        competence_date: r.data_norm,
        category_id: category,
        subcategory_id: subcategory,
        description: r.descricao ?? "",
        ...splitParcelado,
      });
    } else if (batch.origem === "cartao") {
      // Linha à vista OU última parcela (k === N): entra na fatura importada. Forçar a competência
      // corrige as últimas parcelas, cuja data é a da compra original (antiga).
      res = await createTransaction({
        type: "despesa",
        payment_method: "cartao_credito",
        card_id: batch.credit_card_id,
        account_id: "",
        category_id: category,
        subcategory_id: subcategory,
        amount: r.valor,
        purchase_date: r.data_norm,
        competence_date: r.data_norm,
        statement_competencia: competenciaAlvo ?? undefined,
        description: r.descricao ?? "",
        status: "pago",
        ...split,
      });
    } else if (r.transfer_account_id) {
      // EXTRATO — a linha é dinheiro andando entre duas contas do dono, não gasto nem entrada.
      //
      // ⚠️ Quem decide a ORIGEM é o `tipo`, que guarda o sentido que veio do sinal do arquivo:
      // `despesa` = saiu da conta do extrato (ela é a origem), `receita` = entrou nela (ela é o
      // destino). É por isso que nada neste módulo sobrescreve `tipo` com um terceiro valor —
      // sem o sentido, uma aplicação e um resgate ficariam indistinguíveis e o saldo das duas
      // contas sairia invertido, sem nada na tela para denunciar.
      //
      // Uma linha só, como o resto do sistema: `public.account_balance` deriva as duas pernas
      // dela (−amount na origem, +amount no destino) desde a migration
      // 20260720030000_transferencia_uma_linha.sql. Sem divisão e sem categoria — `criarTransacao`
      // já força as duas coisas neste caminho.
      const pernas = pernasDaTransferencia({
        tipo: r.tipo,
        contaDoLote: batch.account_id!,
        outraConta: r.transfer_account_id,
      });
      res = await createTransaction({
        type: "transferencia",
        payment_method: "transferencia",
        card_id: "",
        category_id: "",
        ...pernas,
        amount: r.valor,
        purchase_date: r.data_norm,
        competence_date: r.data_norm,
        liquidado_em: dataDoExtratoAGravar(r.data_norm, hoje),
        description: r.descricao ?? "",
        status: "pago",
      });
    } else {
      const tipo = r.tipo === "receita" ? "receita" : "despesa";
      res = await createTransaction({
        type: tipo,
        payment_method: "",
        card_id: "",
        account_id: batch.account_id,
        category_id: category,
        subcategory_id: subcategory,
        amount: r.valor,
        purchase_date: r.data_norm,
        competence_date: r.data_norm,
        // K0.3 — a data da linha do extrato é quando o dinheiro mexeu na conta.
        liquidado_em: dataDoExtratoAGravar(r.data_norm, hoje),
        description: r.descricao ?? "",
        status: tipo === "receita" ? "recebido" : "pago",
        ...(tipo === "receita"
          ? {
              // 04-C · T7 — a ENTRADA de extrato leva a responsabilidade escolhida na revisão, nas
              // chaves PRÓPRIAS da receita, e NÃO leva a divisão de despesa. Vazio é "sem pessoa" /
              // "sem escolha": o serviço (`lerReembolsoDaReceita`) decide pela dívida de AGORA.
              // `reembolso_devido_visto` vazio é "não conferir" — a linha anterior do lote já
              // atualizou o estado, e a conta é refeita linha a linha no servidor.
              receita_classificacao: r.receita_classificacao ?? "pessoal",
              reembolso_pessoa_id: r.reembolso_pessoa_id ?? "",
              reembolso_sobra: r.reembolso_sobra ?? "",
              reembolso_devido_visto: "",
            }
          : split),
      });
    }

    if (res.ok) {
      const marcada = await ctx.supabase
        .from("import_rows")
        .update({ status: "importada", transaction_id: res.data.id, motivo: null })
        .eq("id", r.id);
      if (marcada.error) {
        // A linha fica `erro` com o motivo da reserva ("pode ter sido lançada"), que é a verdade.
        revalidateFinance();
        return gravadoEmParte(fraseDoCommitInterrompido(processadas));
      }
      importadas++;
    } else {
      // A frase da action vira o motivo (RR-G-10). Se ESTA escrita falhar, a linha fica com o
      // motivo da reserva — que erra para "pode ter sido lançada" — e o commit segue.
      // 04-C · T7 — a recusa do reembolso vem como erro de CAMPO e a frase útil está nele ("Escolha
      // o que fazer com a sobra"); `res.error` seria só "Verifique os campos destacados.", que na
      // lista de linhas não aponta para campo nenhum.
      const motivo =
        res.fieldErrors?.reembolso_sobra?.[0] ??
        res.fieldErrors?.reembolso_pessoa_id?.[0] ??
        res.error;
      await ctx.supabase
        .from("import_rows")
        .update({ status: "erro", motivo })
        .eq("id", r.id);
      falhas++;
    }
  }

  // Recontagem final dos totais a partir do estado real das linhas.
  // 03-G (D-G20) — as linhas JÁ foram importadas: sem a recontagem, o lote não é marcado como
  // importado com totais inventados, e a frase diz que a alteração pode ter sido gravada em parte.
  const allRes = await ctx.supabase
    .from("import_rows")
    .select("status", { count: "exact" })
    .eq("import_batch_id", batchId);
  if (
    allRes.error ||
    allRes.count === null ||
    allRes.count > (allRes.data ?? []).length
  ) {
    revalidateFinance();
    return falhaDeLeituraDepois(R.linhasDaImportacao);
  }
  const all = allRes.data;
  const count = (s: string) =>
    (all ?? []).filter((r) => r.status === s).length;

  const { error: loteErr } = await ctx.supabase
    .from("import_batches")
    .update({
      status: "importado",
      total_importadas: count("importada"),
      total_ignoradas: count("ignorada"),
      total_duplicadas: count("duplicada"),
    })
    .eq("id", batchId);
  if (loteErr) {
    // Rodar de novo NÃO recontaria: sem linha `para_importar`, o commit recusa antes (ver a frase).
    revalidateFinance();
    return gravadoEmParte(FRASE_DO_LOTE_NAO_MARCADO);
  }

  revalidateFinance();
  return { ok: true, data: { importadas, falhas } };
}

/** 'yyyy-MM-01' → "07/2026" (para as mensagens de bloqueio do desfazer). */
function competenciaLabel(competencia: string | null): string {
  if (!competencia) return "—";
  const [y, m] = competencia.split("-");
  return `${m}/${y}`;
}

/**
 * DESFAZ a importação: apaga os lançamentos que ESTE lote criou (`import_rows.transaction_id`)
 * e devolve as linhas para revisão, permitindo corrigir e importar de novo sem que a
 * deduplicação acuse os próprios lançamentos como duplicata.
 *
 * Nada some sozinho e nada some pela metade:
 * - fatura já paga bloqueia (apagar lançamento de fatura paga deixaria o pagamento sem lastro);
 * - recebível já cobrado/pago bloqueia (dinheiro de terceiro já movimentado);
 * - lançamento editado à mão depois da importação é apagado junto — é o que o usuário pediu ao
 *   desfazer o lote, e o aviso na tela diz isso antes de confirmar.
 *
 * O delete das transações cascateia parcelas (`transaction_installments`), divisão
 * (`shared_expenses`) e os recebíveis pendentes; `import_rows.transaction_id` é `set null`.
 */
export async function undoImportBatch(
  batchId: string,
): Promise<ActionResult<{ removidas: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // 03-G — nenhuma escrita antes desta região; qualquer leitura que falhe (ou venha cortada)
  // recusa antes do `delete`.
  let txIds: string[];
  try {
    const batch = exigir(
      await ctx.supabase
        .from("import_batches")
        .select("id, status")
        .eq("id", batchId)
        .maybeSingle(),
      R.loteDaImportacao,
    );
    if (!batch) return dbError("Lote não encontrado.");

    // Desfazer só parte e devolver TODAS as linhas para revisão deixaria lançamento sem linha.
    const rows = listaCompleta(
      await ctx.supabase
        .from("import_rows")
        .select("id, transaction_id", { count: "exact" })
        .eq("import_batch_id", batchId)
        .not("transaction_id", "is", null),
      R.linhasDaImportacao,
    );

    txIds = rows
      .map((r) => r.transaction_id)
      .filter((id): id is string => !!id);
    if (txIds.length === 0) {
      return dbError("Este lote não criou lançamentos para desfazer.");
    }

    // Faturas alcançadas: a do próprio lançamento (à vista/estorno) e as das parcelas geradas.
    // 03-G — sem elas, uma fatura paga passaria despercebida.
    const txs = listaCompleta(
      await ctx.supabase
        .from("transactions")
        .select("id, statement_id", { count: "exact" })
        .in("id", txIds),
      R.lancamentos,
    );
    const parcelas = listaCompleta(
      await ctx.supabase
        .from("transaction_installments")
        .select("statement_id", { count: "exact" })
        .in("parent_transaction_id", txIds),
      R.parcelas,
    );

    const statementIds = [
      ...new Set(
        [
          ...txs.map((t) => t.statement_id),
          ...parcelas.map((p) => p.statement_id),
        ].filter((id): id is string => !!id),
      ),
    ];

    if (statementIds.length > 0) {
      const pagas = listaCompleta(
        await ctx.supabase
          .from("card_statements")
          .select("competencia", { count: "exact" })
          .in("id", statementIds)
          .not("pago_em", "is", null),
        R.faturas,
      );
      if (pagas.length > 0) {
        const meses = pagas
          .map((s) => competenciaLabel(s.competencia))
          .join(", ");
        return dbError(
          `Fatura já paga (${meses}). Desfaça o pagamento em Faturas antes de desfazer a importação.`,
        );
      }
    }
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return falhaDeLeituraAntes(e.oQue);
  }

  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: txIds });
  if (protecao.erro) {
    return dbError("Não foi possível conferir os recebíveis deste lote. Tente de novo.");
  }
  const motivo = motivoParaNaoApagar(
    protecao.recebiveis,
    "regra-cheia",
    "desfazer a importação",
  );
  if (motivo) return dbError(motivo);

  const { error } = await ctx.supabase
    .from("transactions")
    .delete()
    .in("id", txIds);
  if (error) return dbError("Não foi possível remover os lançamentos do lote.");

  // As linhas voltam para revisão (o que estava ignorado/duplicado continua como estava).
  // 03-G2 (S11) — os dois updates são conferidos. Os lançamentos JÁ foram removidos e
  // `import_rows.transaction_id` virou null (set null): desfazer de novo não acha o que desfazer.
  // Por isso a saída do primeiro erro é reenviar o arquivo (os lançamentos não existem mais, então
  // a dedup não os acusa); no segundo as linhas já voltaram e seguem editáveis com o lote
  // `importado`, então corrigir e importar de novo funciona (e reconta os totais).
  const { error: linhasErr } = await ctx.supabase
    .from("import_rows")
    .update({ status: "para_importar", transaction_id: null, motivo: null })
    .eq("import_batch_id", batchId)
    .eq("status", "importada");
  if (linhasErr) {
    revalidateFinance();
    return gravadoEmParte(
      "Os lançamentos do lote foram removidos, mas as linhas não voltaram para a revisão. Exclua o lote em Importações e envie o arquivo de novo.",
    );
  }
  const { error: loteErr } = await ctx.supabase
    .from("import_batches")
    .update({ status: "revisando", total_importadas: 0 })
    .eq("id", batchId);
  if (loteErr) {
    revalidateFinance();
    return gravadoEmParte(
      "Os lançamentos foram removidos e as linhas voltaram para a revisão, mas o lote continua marcado como importado, com o total antigo. As linhas podem ser corrigidas no lote e importadas de novo quando quiser.",
    );
  }

  revalidateFinance();
  return { ok: true, data: { removidas: txIds.length } };
}

/**
 * Define (ou limpa) a competência da fatura de cartão do lote — a fatura à qual TODAS as linhas
 * pertencem (âncora das parcelas). Editável na revisão; normaliza para o dia 1 do mês. Só
 * enquanto o lote não foi finalizado e só para origem cartão.
 */
export async function setImportBatchCompetencia(
  batchId: string,
  competencia: string | null,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const batchRes = await ctx.supabase
    .from("import_batches")
    .select("id, status, origem")
    .eq("id", batchId)
    .maybeSingle();
  if (batchRes.error) return falhaDeLeituraAntes(R.loteDaImportacao);
  const batch = batchRes.data;
  if (!batch) return dbError("Lote não encontrado.");
  if (batch.status === "importado" || batch.status === "cancelado") {
    return dbError("Este lote já foi finalizado.");
  }
  if (batch.origem !== "cartao") {
    return dbError("A competência só se aplica a faturas de cartão.");
  }

  let normalizada: string | null = null;
  if (competencia) {
    const m = /^(\d{4})-(\d{2})/.exec(competencia);
    if (!m) return dbError("Competência inválida.");
    normalizada = `${m[1]}-${m[2]}-01`;
  }

  const { error } = await ctx.supabase
    .from("import_batches")
    .update({ competencia_fatura: normalizada })
    .eq("id", batchId);
  if (error) return dbError("Não foi possível atualizar a competência da fatura.");

  revalidateImports();
  return { ok: true, data: undefined };
}

/** Cancela o lote (marca `cancelado`). NÃO apaga transações já importadas. */
export async function cancelImportBatch(
  batchId: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("import_batches")
    .update({ status: "cancelado" })
    .eq("id", batchId);
  if (error) return dbError("Não foi possível cancelar o lote.");

  revalidateImports();
  return { ok: true, data: undefined };
}

/**
 * Exclui o registro do lote (e suas linhas, via cascade). As transações já criadas a partir
 * dele PERMANECEM (o FK transaction_id é `on delete set null` no sentido oposto) — excluir o
 * histórico de importação não desfaz lançamentos.
 */
export async function deleteImportBatch(
  batchId: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("import_batches")
    .delete()
    .eq("id", batchId);
  if (error) return dbError("Não foi possível excluir o lote.");

  revalidateImports();
  return { ok: true, data: undefined };
}

"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { createTransaction } from "@/lib/actions/transactions";
import { createInstallmentPurchase } from "@/lib/actions/installments";
import {
  importUploadSchema,
  remapSchema,
  updateImportRowSchema,
} from "@/lib/validators/import";
import { autoDetectMapping, applyMapping } from "@/lib/import/mapping";
import { chaveComposta, detectarDuplicados } from "@/lib/import/dedup";
import { parseOfx } from "@/lib/import/ofx";
import { parseCsv } from "@/lib/import/csv";
import { parseXlsx } from "@/lib/import/xlsx";
import type { ImportFormat } from "@/lib/import/constants";
import type {
  ColumnMapping,
  NormalizedRow,
  ParsedTable,
} from "@/lib/import/types";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";
import type { ActionResult } from "@/types/finance";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

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
  const { data } = await ctx.supabase
    .from("transactions")
    .select("purchase_date, amount, description")
    .eq(col, targetId)
    .limit(5000);
  const set = new Set<string>();
  for (const t of data ?? []) {
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

  const { data: cats } = await ctx.supabase
    .from("categories")
    .select("id, name");
  const categorias = (cats ?? []).map((c) => ({ id: c.id, name: c.name }));

  const normalized = applyMapping(table, fields, {
    origem: d.origem,
    sinalNegativoDespesa: d.sinal_negativo_despesa,
    categorias,
  });
  const existingKeys = await existingKeysFor(ctx, d.origem, targetId);
  const deduped = detectarDuplicados(normalized, existingKeys, targetId);
  const duplicadas = deduped.filter((r) => r.status === "duplicada").length;

  const { data: batch, error: batchErr } = await ctx.supabase
    .from("import_batches")
    .insert({
      user_id: ctx.userId,
      file_name: file.name,
      formato,
      origem: d.origem,
      credit_card_id: d.origem === "cartao" ? d.credit_card_id : null,
      account_id: d.origem === "conta" ? d.account_id : null,
      sinal_negativo_despesa: d.sinal_negativo_despesa,
      status: "revisando",
      total_linhas: deduped.length,
      total_duplicadas: duplicadas,
      column_mapping: { headers: table.headers, fields },
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    return dbError("Não foi possível registrar o lote de importação.");
  }

  const { error: rowsErr } = await ctx.supabase
    .from("import_rows")
    .insert(toRowInserts(ctx.userId, batch.id, deduped));
  if (rowsErr) {
    await ctx.supabase.from("import_batches").delete().eq("id", batch.id);
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

  const { data: batch } = await ctx.supabase
    .from("import_batches")
    .select("id, origem, credit_card_id, account_id, status, column_mapping")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return dbError("Lote não encontrado.");
  if (batch.status === "importado" || batch.status === "cancelado") {
    return dbError("Este lote já foi finalizado e não pode ser remapeado.");
  }

  const { data: rows } = await ctx.supabase
    .from("import_rows")
    .select("raw")
    .eq("import_batch_id", batchId)
    .order("linha_index", { ascending: true });
  const headers =
    (batch.column_mapping as { headers?: string[] } | null)?.headers ?? [];
  const table: ParsedTable = {
    headers,
    rows: (rows ?? []).map((r) => (Array.isArray(r.raw) ? (r.raw as string[]) : [])),
  };

  const origem = batch.origem as "cartao" | "conta";
  const targetId = (
    origem === "cartao" ? batch.credit_card_id : batch.account_id
  ) as string;

  const { data: cats } = await ctx.supabase
    .from("categories")
    .select("id, name");
  const categorias = (cats ?? []).map((c) => ({ id: c.id, name: c.name }));

  const normalized = applyMapping(table, fields, {
    origem,
    sinalNegativoDespesa: parsed.data.sinal_negativo_despesa,
    categorias,
  });
  const existingKeys = await existingKeysFor(ctx, origem, targetId);
  const deduped = detectarDuplicados(normalized, existingKeys, targetId);

  await ctx.supabase.from("import_rows").delete().eq("import_batch_id", batchId);
  const { error: insErr } = await ctx.supabase
    .from("import_rows")
    .insert(toRowInserts(ctx.userId, batchId, deduped));
  if (insErr) return dbError("Não foi possível aplicar o mapeamento.");

  await ctx.supabase
    .from("import_batches")
    .update({
      status: "revisando",
      sinal_negativo_despesa: parsed.data.sinal_negativo_despesa,
      total_linhas: deduped.length,
      total_duplicadas: deduped.filter((r) => r.status === "duplicada").length,
      column_mapping: { headers, fields },
    })
    .eq("id", batchId);

  revalidateImports();
  return { ok: true, data: undefined };
}

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

  const { data: row } = await ctx.supabase
    .from("import_rows")
    .select("id, import_batch_id, import_batches(status)")
    .eq("id", rowId)
    .maybeSingle();
  if (!row) return dbError("Linha não encontrada.");
  const batchStatus = (row.import_batches as { status?: string } | null)?.status;
  if (batchStatus === "importado" || batchStatus === "cancelado") {
    return dbError("Este lote já foi finalizado.");
  }

  const update: {
    status?: string;
    categoria_sugerida_id?: string | null;
    import_as?: string;
    descricao?: string | null;
    data_norm?: string;
    valor?: number;
    tipo?: string;
  } = {};
  if (d.status !== undefined) update.status = d.status;
  if (d.categoria_sugerida_id !== undefined)
    update.categoria_sugerida_id = d.categoria_sugerida_id;
  if (d.import_as !== undefined) update.import_as = d.import_as;
  if (d.descricao !== undefined) update.descricao = d.descricao || null;
  if (d.data_norm !== undefined) update.data_norm = d.data_norm;
  if (d.valor !== undefined) update.valor = d.valor;
  if (d.tipo !== undefined) update.tipo = d.tipo;

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
 * IMPORTA o lote: para cada linha `para_importar`, cria a transação reusando os MESMOS motores
 * do lançamento manual (createTransaction / createInstallmentPurchase) — nada de modelo paralelo.
 * Cada linha importada vira UMA transação na fatura/competência correta (regra das Fases 03/04);
 * grava `transaction_id` na linha. Falhas individuais marcam a linha como `erro` (não derrubam o
 * lote). Ao final, o lote vira `importado`.
 */
export async function commitImport(
  batchId: string,
): Promise<ActionResult<{ importadas: number; falhas: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: batch } = await ctx.supabase
    .from("import_batches")
    .select("id, origem, credit_card_id, account_id, status")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return dbError("Lote não encontrado.");
  if (batch.status === "importado") {
    return dbError("Este lote já foi importado.");
  }
  if (batch.status === "cancelado") {
    return dbError("Este lote foi cancelado.");
  }

  const { data: rows } = await ctx.supabase
    .from("import_rows")
    .select(
      "id, data_norm, descricao, valor, tipo, categoria_sugerida_id, parcela, parcelas_total, import_as",
    )
    .eq("import_batch_id", batchId)
    .eq("status", "para_importar")
    .order("linha_index", { ascending: true });

  let importadas = 0;
  let falhas = 0;

  for (const r of rows ?? []) {
    if (r.data_norm == null || r.valor == null) {
      await ctx.supabase
        .from("import_rows")
        .update({ status: "erro", motivo: "Data ou valor ausente." })
        .eq("id", r.id);
      falhas++;
      continue;
    }
    const category = r.categoria_sugerida_id ?? "";
    let res: ActionResult<{ id: string }>;

    if (
      batch.origem === "cartao" &&
      r.import_as === "parcelamento" &&
      r.parcelas_total &&
      r.parcelas_total > 1
    ) {
      res = await createInstallmentPurchase({
        card_id: batch.credit_card_id,
        qtd_parcelas: r.parcelas_total,
        valor_total: r.valor,
        purchase_date: r.data_norm,
        competence_date: r.data_norm,
        category_id: category,
        description: r.descricao ?? "",
        classificacao: "pessoal",
        parts: [],
      });
    } else if (batch.origem === "cartao") {
      res = await createTransaction({
        type: "despesa",
        payment_method: "cartao_credito",
        card_id: batch.credit_card_id,
        account_id: "",
        category_id: category,
        amount: r.valor,
        purchase_date: r.data_norm,
        competence_date: r.data_norm,
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
        amount: r.valor,
        purchase_date: r.data_norm,
        competence_date: r.data_norm,
        description: r.descricao ?? "",
        status: tipo === "receita" ? "recebido" : "pago",
      });
    }

    if (res.ok) {
      await ctx.supabase
        .from("import_rows")
        .update({ status: "importada", transaction_id: res.data.id, motivo: null })
        .eq("id", r.id);
      importadas++;
    } else {
      await ctx.supabase
        .from("import_rows")
        .update({ status: "erro", motivo: res.error })
        .eq("id", r.id);
      falhas++;
    }
  }

  // Recontagem final dos totais a partir do estado real das linhas.
  const { data: all } = await ctx.supabase
    .from("import_rows")
    .select("status")
    .eq("import_batch_id", batchId);
  const count = (s: string) =>
    (all ?? []).filter((r) => r.status === s).length;

  await ctx.supabase
    .from("import_batches")
    .update({
      status: "importado",
      total_importadas: count("importada"),
      total_ignoradas: count("ignorada"),
      total_duplicadas: count("duplicada"),
    })
    .eq("id", batchId);

  revalidateFinance();
  return { ok: true, data: { importadas, falhas } };
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

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryPicker } from "@/components/finance/category-picker";
import { categoriaServeAoTipo, categoriasDoTipo } from "@/lib/finance/category-search";
import { MoneyInput } from "@/components/financeiro/money-input";
import { ReceitaResponsabilidadeEditor } from "@/components/financeiro/receita-responsabilidade";
import { InstallmentBadge } from "@/components/financeiro/badges";
import {
  SplitEditor,
  usableSplitParts,
  type SplitPartValue,
} from "@/components/financeiro/split-editor";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import {
  createTransaction,
  getTransactionSplit,
  updateTransaction,
} from "@/lib/actions/transactions";
import { createInstallmentPurchase } from "@/lib/actions/installments";
import {
  formatCurrency,
  formatDate,
  parseCurrencyToNumber,
  reaisParaCentavos,
  toDateInputValue,
} from "@/lib/format";
import { resolverFatura } from "@/lib/finance/invoice";
import {
  aplicarAtalhoDaCategoria,
  DICA_DO_ATALHO,
  type OrigemDaClassificacao,
} from "@/lib/finance/marcacao-da-categoria";
import {
  planejarParcelamento,
  type ParcelaPlano,
} from "@/lib/finance/installments";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  type Classificacao,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/finance/constants";
import type {
  CategoryRow,
  SubcategoryRow,
  TransactionRow,
} from "@/types/database";

const NONE = "none";

type AccountOption = { id: string; name: string };
type CardOption = {
  id: string;
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
};
type PersonOption = { id: string; nome: string };

type FormValues = {
  type: TransactionType;
  amount: string;
  account_id: string;
  transfer_account_id: string;
  card_id: string;
  category_id: string;
  subcategory_id: string;
  payment_method: string;
  purchase_date: string;
  competence_date: string;
  status: TransactionStatus;
  description: string;
  notes: string;
  parcelado: boolean;
  qtd_parcelas: string;
  override_ultima: string;
  classificacao: Classificacao;
  parts: SplitPartValue[];
  receita_classificacao: Classificacao;
  receita_minha_parte: string;
};

// Campo que não existe na tela sobe para o toast com o nome.
const CAMPOS_DO_FORMULARIO = [
  "type",
  "amount",
  "account_id",
  "transfer_account_id",
  "card_id",
  "category_id",
  "subcategory_id",
  "payment_method",
  "purchase_date",
  "competence_date",
  "status",
  "description",
  "notes",
  "parcelado",
  "qtd_parcelas",
  "override_ultima",
  "classificacao",
  "parts",
  "receita_classificacao",
  "receita_minha_parte",
] as const satisfies readonly (keyof FormValues)[];

function defaults(tx?: TransactionRow): FormValues {
  const today = toDateInputValue(new Date());
  return {
    type: tx?.type ?? "despesa",
    amount: tx ? String(tx.amount).replace(".", ",") : "",
    account_id: tx?.account_id ?? "",
    transfer_account_id: tx?.transfer_account_id ?? "",
    card_id: tx?.card_id ?? "",
    category_id: tx?.category_id ?? NONE,
    subcategory_id: tx?.subcategory_id ?? NONE,
    payment_method: tx?.payment_method ?? NONE,
    purchase_date: tx?.purchase_date ?? today,
    competence_date: tx?.competence_date ?? today,
    status: tx?.status ?? "pago",
    description: tx?.description ?? "",
    notes: tx?.notes ?? "",
    parcelado: false,
    qtd_parcelas: "2",
    override_ultima: "",
    classificacao: tx?.type === "despesa" ? tx.classificacao : "pessoal",
    parts: [],
    receita_classificacao: tx?.type === "receita" ? tx.classificacao : "pessoal",
    receita_minha_parte:
      tx?.type === "receita" && tx.classificacao === "compartilhada" && tx.valor_pessoal != null
        ? String(tx.valor_pessoal).replace(".", ",")
        : "",
  };
}

/** Rótulo "mês de aaaa" (pt-BR) a partir de uma competência 'yyyy-MM-01'. */
function mesAnoLabel(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

export function TransactionFormDialog({
  transaction,
  accounts,
  categories,
  subcategories,
  cards = [],
  people = [],
  trigger,
}: {
  transaction?: TransactionRow;
  accounts: AccountOption[];
  categories: Pick<CategoryRow, "id" | "name" | "kind" | "classificacao_padrao">[];
  subcategories: Pick<SubcategoryRow, "id" | "name" | "category_id">[];
  cards?: CardOption[];
  people?: PersonOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [origem, setOrigem] = React.useState<OrigemDaClassificacao>("padrao");
  const isEdit = Boolean(transaction);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(transaction) });

  // Ao abrir, reseta com os defaults; numa edição de despesa JÁ dividida, carrega as partes
  // gravadas (shared_expenses) para pré-preencher a divisão (Fase 05 — divisão na edição).
  React.useEffect(() => {
    if (!open) return;
    reset(defaults(transaction));
    if (!transaction || transaction.type !== "despesa" || transaction.classificacao === "pessoal") return;
    let active = true;
    getTransactionSplit(transaction.id).then((res) => {
      if (!active || !res.ok) return;
      setValue("classificacao", res.data.classificacao);
      setValue("parts", res.data.parts);
    });
    return () => {
      active = false;
    };
  }, [open, transaction, reset, setValue]);

  const type = useWatch({ control, name: "type" });
  const categoryId = useWatch({ control, name: "category_id" });
  const subcategoryId = useWatch({ control, name: "subcategory_id" });
  const paymentMethod = useWatch({ control, name: "payment_method" });
  const cardId = useWatch({ control, name: "card_id" });
  const purchaseDate = useWatch({ control, name: "purchase_date" });
  const amount = useWatch({ control, name: "amount" });
  const parcelado = useWatch({ control, name: "parcelado" });
  const qtdParcelas = useWatch({ control, name: "qtd_parcelas" });
  const overrideUltima = useWatch({ control, name: "override_ultima" });
  const isTransfer = type === "transferencia";
  const isReceita = type === "receita";
  const isCard = !isTransfer && paymentMethod === "cartao_credito";
  // Parcelamento só na criação (edição de parcelamento é feita em /parcelamentos).
  const canParcelar = !isEdit && isCard;
  const isParcelado = canParcelar && parcelado;
  // Divisão de gastos (Fase 05): em despesa, na criação OU na edição de despesa simples.
  // Compra parcelada já criada é gerida em /parcelamentos (mesmo núcleo no servidor).
  const canSplit = type === "despesa" && !(isEdit && transaction?.parcelado);

  const selectedCardObj = cards.find((c) => c.id === cardId);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate);

  // Preview reativo da fatura para compra à vista no cartão.
  const faturaPreview =
    isCard && !isParcelado && selectedCardObj && dateOk
      ? resolverFatura(
          purchaseDate,
          selectedCardObj.dia_fechamento,
          selectedCardObj.dia_vencimento,
        )
      : null;

  // Preview reativo do parcelamento (valor por parcela + faturas). Lógica pura — idêntica ao
  // servidor. Sem useMemo: o React Compiler do projeto memoiza automaticamente.
  let plano: ParcelaPlano[] | null = null;
  let overrideErro = false;
  if (isParcelado && selectedCardObj && dateOk) {
    const total = parseCurrencyToNumber(amount);
    const qtd = Number.parseInt(qtdParcelas, 10);
    if (total > 0 && Number.isInteger(qtd) && qtd >= 1) {
      const overrideTrim = overrideUltima?.trim();
      const overrideCentavos = overrideTrim
        ? reaisParaCentavos(parseCurrencyToNumber(overrideTrim))
        : null;
      try {
        plano = planejarParcelamento({
          valorTotalReais: total,
          qtd,
          dataCompra: purchaseDate,
          diaFechamento: selectedCardObj.dia_fechamento,
          diaVencimento: selectedCardObj.dia_vencimento,
          overrideUltimaCentavos: overrideCentavos,
        });
      } catch {
        // Override não fecha a soma: mostra o plano padrão + aviso.
        try {
          plano = planejarParcelamento({
            valorTotalReais: total,
            qtd,
            dataCompra: purchaseDate,
            diaFechamento: selectedCardObj.dia_fechamento,
            diaVencimento: selectedCardObj.dia_vencimento,
          });
          overrideErro = Boolean(overrideCentavos);
        } catch {
          plano = null;
        }
      }
    }
  }

  // Monta o bloco de divisão a enviar ao servidor (vazio quando pessoal/não aplicável).
  function buildSplitPayload(values: FormValues) {
    if (!canSplit || values.classificacao === "pessoal") {
      return { classificacao: "pessoal" as Classificacao, parts: [] };
    }
    return {
      classificacao: values.classificacao,
      parts: usableSplitParts(values.parts).map((p) => ({
        person_id: p.person_id,
        tipo: p.tipo,
        valor: p.tipo === "valor" ? p.valor : "",
        percentual: p.tipo === "percentual" ? p.percentual : "",
      })),
    };
  }

  // 03-C2 · A5 — a categoria PROPÕE (só em lançamento novo, só em receita); o lançamento REGISTRA.
  function reavaliarAtalho(proximo: { categoryId: string; tipo: TransactionType }) {
    const categoria = categories.find((c) => c.id === proximo.categoryId);
    const atual = { classificacao: getValues("receita_classificacao"), origem };
    const seguinte = aplicarAtalhoDaCategoria(atual, {
      marcacao: categoria?.classificacao_padrao ?? null,
      tipo: proximo.tipo,
      modo: isEdit ? "editar" : "criar",
    });
    if (seguinte === atual) return;
    setValue("receita_classificacao", seguinte.classificacao);
    if (seguinte.classificacao !== "compartilhada") setValue("receita_minha_parte", "");
    setOrigem(seguinte.origem);
  }

  async function onSubmit(values: FormValues) {
    const splitPayload = buildSplitPayload(values);

    // Fluxo de COMPRA PARCELADA (Fase 04).
    if (canParcelar && values.parcelado) {
      const overrideTrim = values.override_ultima?.trim();
      const overrideCentavos = overrideTrim
        ? reaisParaCentavos(parseCurrencyToNumber(overrideTrim))
        : null;
      const payload = {
        card_id: values.card_id || "",
        qtd_parcelas: values.qtd_parcelas,
        valor_total: values.amount,
        purchase_date: values.purchase_date,
        competence_date: values.competence_date,
        category_id: values.category_id === NONE ? "" : values.category_id,
        subcategory_id:
          values.subcategory_id === NONE ? "" : values.subcategory_id,
        description: values.description,
        notes: values.notes,
        override_ultima_centavos: overrideCentavos,
        ...splitPayload,
      };
      const res = await createInstallmentPurchase(payload);
      if (res.ok) {
        toast.success("Compra parcelada criada.");
        setOpen(false);
        router.refresh();
      } else {
        applyFieldErrors(setError, res.fieldErrors);
        if (res.fieldErrors?.valor_total) {
          setError("amount", { message: res.fieldErrors.valor_total[0] });
        }
        if (res.fieldErrors?.override_ultima_centavos) {
          setError("override_ultima", {
            message: res.fieldErrors.override_ultima_centavos[0],
          });
        }
        toast.error(res.error);
      }
      return;
    }

    const payload = {
      type: values.type,
      amount: values.amount,
      account_id: values.account_id || "",
      transfer_account_id: isTransfer ? values.transfer_account_id || "" : "",
      card_id: isCard ? values.card_id || "" : "",
      category_id:
        isTransfer || values.category_id === NONE ? "" : values.category_id,
      subcategory_id:
        isTransfer || values.subcategory_id === NONE
          ? ""
          : values.subcategory_id,
      payment_method:
        values.payment_method === NONE ? "" : values.payment_method,
      purchase_date: values.purchase_date,
      competence_date: values.competence_date,
      status: values.status,
      description: values.description,
      notes: values.notes,
      // Divisão aplicada na criação E na edição (o servidor re-aplica só quando muda).
      ...splitPayload,
      ...(values.type === "receita"
        ? {
            receita_classificacao: values.receita_classificacao,
            receita_minha_parte:
              values.receita_classificacao === "compartilhada"
                ? values.receita_minha_parte
                : "",
          }
        : {}),
    };

    const res = isEdit
      ? await updateTransaction(transaction!.id, payload)
      : await createTransaction(payload);

    if (res.ok) {
      toast.success(isEdit ? "Lançamento atualizado." : "Lançamento criado.");
      setOpen(false);
      router.refresh();
    } else {
      const mapeado = mapServerFieldErrors(res.fieldErrors, CAMPOS_DO_FORMULARIO);
      for (const { name, message } of mapeado.toSet) {
        setError(name as Path<FormValues>, { message });
      }
      toast.error(serverErrorMessage(res.error, mapeado));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setOrigem("padrao"); setOpen(v); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar lançamento" : "Novo lançamento"}
          </DialogTitle>
          <DialogDescription>
            Despesas, receitas, transferências e ajustes à vista ou no cartão.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      if (v === "transferencia") {
                        setValue("category_id", NONE);
                        setValue("subcategory_id", NONE);
                        setValue("parcelado", false);
                      } else {
                        // Categoria de despesa não serve a uma receita (e vice-versa): trocar o
                        // tipo limpa a escolha que deixou de servir, com a subcategoria junto.
                        const atual = categories.find((c) => c.id === getValues("category_id"));
                        if (atual && !categoriaServeAoTipo(atual.kind, v)) {
                          setValue("category_id", NONE);
                          setValue("subcategory_id", NONE);
                        }
                      }
                      reavaliarAtalho({ categoryId: v === "transferencia" ? NONE : getValues("category_id"), tipo: v as TransactionType });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TRANSACTION_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{isParcelado ? "Valor total" : "Valor"}</Label>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                {isTransfer
                  ? "Conta de origem"
                  : isCard
                    ? "Conta (opcional)"
                    : "Conta"}
              </Label>
              <Controller
                control={control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-invalid={Boolean(errors.account_id)}>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.account_id && (
                <p className="text-xs text-destructive">
                  {errors.account_id.message}
                </p>
              )}
            </div>

            {isTransfer ? (
              <div className="space-y-1.5">
                <Label>Conta de destino</Label>
                <Controller
                  control={control}
                  name="transfer_account_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-invalid={Boolean(errors.transfer_account_id)}>
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.transfer_account_id && (
                  <p className="text-xs text-destructive">
                    {errors.transfer_account_id.message}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Forma de pagamento</Label>
                <Controller
                  control={control}
                  name="payment_method"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v !== "cartao_credito") setValue("parcelado", false);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Nenhuma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Nenhuma</SelectItem>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </div>

          {isCard && (
            <div className="space-y-1.5">
              <Label>Cartão</Label>
              <Controller
                control={control}
                name="card_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={Boolean(errors.card_id)}
                    >
                      <SelectValue placeholder="Selecione o cartão" />
                    </SelectTrigger>
                    <SelectContent>
                      {cards.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.card_id && (
                <p className="text-xs text-destructive">
                  {errors.card_id.message}
                </p>
              )}
              {faturaPreview && (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground ring-1 ring-primary/10">
                  Entra na fatura de{" "}
                  <span className="font-medium capitalize text-foreground">
                    {mesAnoLabel(faturaPreview.competencia)}
                  </span>{" "}
                  · fecha {formatDate(faturaPreview.dataFechamento)} · vence{" "}
                  {formatDate(faturaPreview.dataVencimento)}
                </p>
              )}
              {cards.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum cartão cadastrado. Cadastre um em Cartões.
                </p>
              )}
            </div>
          )}

          {canParcelar && (
            <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="tx-parcelado">Essa compra é parcelada?</Label>
                  <p className="text-xs text-muted-foreground">
                    Divide o total em parcelas, cada uma na sua fatura.
                  </p>
                </div>
                <Controller
                  control={control}
                  name="parcelado"
                  render={({ field }) => (
                    <Switch
                      id="tx-parcelado"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              {isParcelado && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="tx-qtd">Nº de parcelas</Label>
                      <Input
                        id="tx-qtd"
                        type="number"
                        min={1}
                        max={60}
                        inputMode="numeric"
                        {...register("qtd_parcelas")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tx-override">
                        Última parcela (ajuste)
                      </Label>
                      <Controller
                        control={control}
                        name="override_ultima"
                        render={({ field }) => (
                          <MoneyInput
                            id="tx-override"
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder={
                              plano
                                ? String(
                                    plano[plano.length - 1].valor.toFixed(2),
                                  ).replace(".", ",")
                                : "0,00"
                            }
                          />
                        )}
                      />
                    </div>
                  </div>

                  {overrideErro && (
                    <p className="text-xs text-destructive">
                      A soma das parcelas não bate com o total. Ajuste o valor da
                      última parcela.
                    </p>
                  )}
                  {errors.override_ultima && (
                    <p className="text-xs text-destructive">
                      {errors.override_ultima.message}
                    </p>
                  )}

                  {plano && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {plano.length}x · soma{" "}
                        {formatCurrency(
                          plano.reduce((acc, p) => acc + p.valor, 0),
                        )}
                      </p>
                      <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg bg-muted/40 p-2">
                        {plano.map((p) => (
                          <div
                            key={p.numero}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="flex items-center gap-2">
                              <InstallmentBadge
                                numero={p.numero}
                                total={plano.length}
                              />
                              <span className="capitalize text-muted-foreground">
                                {mesAnoLabel(p.fatura.competencia)}
                              </span>
                            </span>
                            <span className="tabular-nums font-medium">
                              {formatCurrency(p.valor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isTransfer && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Um seletor só: categoria com pesquisa e subcategoria no mesmo lugar. Escolher
                  a subcategoria grava a categoria dela junto (nunca "Delivery" sob outra). */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Categoria</Label>
                <CategoryPicker
                  // Só as categorias do tipo do lançamento (despesa ou receita; "ambos" serve aos
                  // dois). A já escolhida fica, para um lançamento antigo não perder o rótulo.
                  categories={categoriasDoTipo(categories, type, categoryId)}
                  subcategories={subcategories}
                  value={{
                    categoryId: categoryId && categoryId !== NONE ? categoryId : null,
                    subcategoryId:
                      subcategoryId && subcategoryId !== NONE ? subcategoryId : null,
                  }}
                  onChange={(v) => {
                    const anterior = getValues("category_id");
                    const proxima = v.categoryId ?? NONE;
                    setValue("category_id", proxima, { shouldDirty: true });
                    setValue("subcategory_id", v.subcategoryId ?? NONE, { shouldDirty: true });
                    // Só reavalia o atalho quando a CATEGORIA muda — trocar só a subcategoria
                    // dentro da mesma categoria não é uma nova marcação.
                    if (proxima !== anterior) {
                      reavaliarAtalho({ categoryId: proxima, tipo: getValues("type") });
                    }
                  }}
                  aria-label="Categoria"
                />
              </div>
            </div>
          )}

          {canSplit && (
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <Controller
                control={control}
                name="parts"
                render={({ field: partsField }) => (
                  <Controller
                    control={control}
                    name="classificacao"
                    render={({ field: classField }) => (
                      <SplitEditor
                        classificacao={classField.value}
                        onClassificacaoChange={classField.onChange}
                        parts={partsField.value ?? []}
                        onPartsChange={partsField.onChange}
                        totalReais={parseCurrencyToNumber(amount)}
                        people={people}
                      />
                    )}
                  />
                )}
              />
            </div>
          )}

          {isReceita && (
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <Controller
                control={control}
                name="receita_classificacao"
                render={({ field: classField }) => (
                  <Controller
                    control={control}
                    name="receita_minha_parte"
                    render={({ field: parteField }) => (
                      <ReceitaResponsabilidadeEditor
                        classificacao={classField.value}
                        onClassificacaoChange={(v) => { classField.onChange(v); setOrigem("usuario"); }}
                        dica={origem === "atalho" ? DICA_DO_ATALHO : undefined}
                        minhaParte={parteField.value}
                        onMinhaParteChange={parteField.onChange}
                        totalReais={parseCurrencyToNumber(amount)}
                        erroMinhaParte={errors.receita_minha_parte?.message}
                      />
                    )}
                  />
                )}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-purchase">Data da compra</Label>
              <Input
                id="tx-purchase"
                type="date"
                {...register("purchase_date")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-competence">Competência</Label>
              <Input
                id="tx-competence"
                type="date"
                {...register("competence_date")}
              />
            </div>
            {!isParcelado && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSACTION_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {TRANSACTION_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-desc">Descrição</Label>
            <Input id="tx-desc" {...register("description")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-notes">Observações</Label>
            <Textarea id="tx-notes" {...register("notes")} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

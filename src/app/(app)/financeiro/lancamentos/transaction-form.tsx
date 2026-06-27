"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
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
import { MoneyInput } from "@/components/financeiro/money-input";
import { InstallmentBadge } from "@/components/financeiro/badges";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import {
  createTransaction,
  getTransactionSplit,
  updateTransaction,
} from "@/lib/actions/transactions";
import { createInstallmentPurchase } from "@/lib/actions/installments";
import {
  centavosParaReais,
  formatCurrency,
  formatDate,
  parseCurrencyToNumber,
  reaisParaCentavos,
  toDateInputValue,
} from "@/lib/format";
import { resolverFatura } from "@/lib/finance/invoice";
import {
  planejarParcelamento,
  type ParcelaPlano,
} from "@/lib/finance/installments";
import { dividirDespesa, type ParteDivisao } from "@/lib/finance/split";
import {
  CLASSIFICACAO_LABELS,
  CLASSIFICACOES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SPLIT_TYPE_LABELS,
  SPLIT_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  type Classificacao,
  type SplitType,
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

type SplitPartValue = {
  person_id: string;
  tipo: SplitType;
  valor: string;
  percentual: string;
};

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
};

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
    classificacao: tx?.classificacao ?? "pessoal",
    parts: [],
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
  categories: Pick<CategoryRow, "id" | "name" | "kind">[];
  subcategories: Pick<SubcategoryRow, "id" | "name" | "category_id">[];
  cards?: CardOption[];
  people?: PersonOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(transaction);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(transaction) });

  const {
    fields: partFields,
    append: appendPart,
    remove: removePart,
    replace: replaceParts,
  } = useFieldArray({ control, name: "parts" });

  // Ao abrir, reseta com os defaults; numa edição de despesa JÁ dividida, carrega as partes
  // gravadas (shared_expenses) para pré-preencher a divisão (Fase 05 — divisão na edição).
  React.useEffect(() => {
    if (!open) return;
    reset(defaults(transaction));
    if (!transaction || transaction.classificacao === "pessoal") return;
    let active = true;
    getTransactionSplit(transaction.id).then((res) => {
      if (!active || !res.ok) return;
      setValue("classificacao", res.data.classificacao);
      replaceParts(res.data.parts);
    });
    return () => {
      active = false;
    };
  }, [open, transaction, reset, setValue, replaceParts]);

  const type = useWatch({ control, name: "type" });
  const categoryId = useWatch({ control, name: "category_id" });
  const paymentMethod = useWatch({ control, name: "payment_method" });
  const cardId = useWatch({ control, name: "card_id" });
  const purchaseDate = useWatch({ control, name: "purchase_date" });
  const amount = useWatch({ control, name: "amount" });
  const parcelado = useWatch({ control, name: "parcelado" });
  const qtdParcelas = useWatch({ control, name: "qtd_parcelas" });
  const overrideUltima = useWatch({ control, name: "override_ultima" });
  const classificacao = useWatch({ control, name: "classificacao" });
  const parts = useWatch({ control, name: "parts" });
  const isTransfer = type === "transferencia";
  const isCard = !isTransfer && paymentMethod === "cartao_credito";
  // Parcelamento só na criação (edição de parcelamento é feita em /parcelamentos).
  const canParcelar = !isEdit && isCard;
  const isParcelado = canParcelar && parcelado;
  // Divisão de gastos (Fase 05): em despesa, na criação OU na edição de despesa simples.
  // Compra parcelada já criada é gerida em /parcelamentos, então não dividimos aqui.
  const canSplit = type === "despesa" && !(isEdit && transaction?.parcelado);
  const isShared = canSplit && classificacao !== "pessoal";

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

  // Preview reativo da divisão (minha parte × cada terceiro). Lógica pura — idêntica ao
  // servidor (dividirDespesa). Sem useMemo: o React Compiler do projeto memoiza.
  const nomePessoa = (id: string) =>
    people.find((p) => p.id === id)?.nome ?? "Pessoa";
  let splitPreview: {
    minhaParteCentavos: number;
    partesTerceiros: { personId: string; valorCentavos: number }[];
  } | null = null;
  let splitError = false;
  if (isShared) {
    const totalCentavos = reaisParaCentavos(parseCurrencyToNumber(amount));
    const partes: ParteDivisao[] = (parts ?? [])
      .filter((p) => p.person_id)
      .map((p) =>
        p.tipo === "valor"
          ? {
              personId: p.person_id,
              tipo: "valor",
              valorCentavos: reaisParaCentavos(parseCurrencyToNumber(p.valor)),
            }
          : {
              personId: p.person_id,
              tipo: "percentual",
              percentual: parseCurrencyToNumber(p.percentual),
            },
      );
    if (totalCentavos > 0 && partes.length > 0) {
      try {
        splitPreview = dividirDespesa(totalCentavos, partes);
      } catch {
        splitError = true;
      }
    }
  }

  const availableSubs = React.useMemo(
    () =>
      categoryId && categoryId !== NONE
        ? subcategories.filter((s) => s.category_id === categoryId)
        : [],
    [categoryId, subcategories],
  );

  // Monta o bloco de divisão a enviar ao servidor (vazio quando pessoal/não aplicável).
  function buildSplitPayload(values: FormValues) {
    if (!canSplit || values.classificacao === "pessoal") {
      return { classificacao: "pessoal" as Classificacao, parts: [] };
    }
    return {
      classificacao: values.classificacao,
      parts: values.parts
        .filter((p) => p.person_id)
        .map((p) => ({
          person_id: p.person_id,
          tipo: p.tipo,
          valor: p.tipo === "valor" ? p.valor : "",
          percentual: p.tipo === "percentual" ? p.percentual : "",
        })),
    };
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
    };

    const res = isEdit
      ? await updateTransaction(transaction!.id, payload)
      : await createTransaction(payload);

    if (res.ok) {
      toast.success(isEdit ? "Lançamento atualizado." : "Lançamento criado.");
      setOpen(false);
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
                      }
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
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Controller
                  control={control}
                  name="category_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setValue("subcategory_id", NONE);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sem categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem categoria</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Subcategoria</Label>
                <Controller
                  control={control}
                  name="subcategory_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={availableSubs.length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sem subcategoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem subcategoria</SelectItem>
                        {availableSubs.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          )}

          {canSplit && (
            <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
              <div className="space-y-1.5">
                <Label>Classificação</Label>
                <Controller
                  control={control}
                  name="classificacao"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === "pessoal") {
                          setValue("parts", []);
                        } else if ((parts ?? []).length === 0) {
                          appendPart({
                            person_id: "",
                            tipo: "valor",
                            valor: "",
                            percentual: "",
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASSIFICACOES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CLASSIFICACAO_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Sua parte real é o que sobra depois dos terceiros — valores de
                  terceiros não entram no seu gasto pessoal.
                </p>
              </div>

              {isShared &&
                (people.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma pessoa cadastrada. Cadastre em A Receber → Pessoas.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {partFields.map((f, idx) => {
                      const tipo = parts?.[idx]?.tipo ?? "valor";
                      return (
                        <div
                          key={f.id}
                          className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
                        >
                          <div className="space-y-1">
                            <Label className="text-xs">Pessoa</Label>
                            <Controller
                              control={control}
                              name={`parts.${idx}.person_id`}
                              render={({ field }) => (
                                <Select
                                  value={field.value}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {people.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.nome}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Tipo</Label>
                            <Controller
                              control={control}
                              name={`parts.${idx}.tipo`}
                              render={({ field }) => (
                                <Select
                                  value={field.value}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SPLIT_TYPES.map((t) => (
                                      <SelectItem key={t} value={t}>
                                        {SPLIT_TYPE_LABELS[t]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {tipo === "valor" ? "Valor" : "%"}
                            </Label>
                            {tipo === "valor" ? (
                              <Controller
                                control={control}
                                name={`parts.${idx}.valor`}
                                render={({ field }) => (
                                  <MoneyInput
                                    value={field.value}
                                    onValueChange={field.onChange}
                                  />
                                )}
                              />
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                inputMode="decimal"
                                {...register(`parts.${idx}.percentual`)}
                              />
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remover pessoa"
                            onClick={() => removePart(idx)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      );
                    })}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendPart({
                          person_id: "",
                          tipo: "valor",
                          valor: "",
                          percentual: "",
                        })
                      }
                    >
                      <Plus /> Adicionar pessoa
                    </Button>

                    {splitError && (
                      <p className="text-xs text-destructive">
                        A divisão não fecha: a soma dos terceiros passou do total
                        ou os percentuais somam mais de 100%.
                      </p>
                    )}

                    {splitPreview && (
                      <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Minha parte</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {formatCurrency(
                              centavosParaReais(splitPreview.minhaParteCentavos),
                            )}
                          </span>
                        </div>
                        {splitPreview.partesTerceiros.map((t) => (
                          <div
                            key={t.personId}
                            className="flex items-center justify-between text-muted-foreground"
                          >
                            <span className="truncate">
                              {nomePessoa(t.personId)}
                            </span>
                            <span className="tabular-nums">
                              {formatCurrency(centavosParaReais(t.valorCentavos))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
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

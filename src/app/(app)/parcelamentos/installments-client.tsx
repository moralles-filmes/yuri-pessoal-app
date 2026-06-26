"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Layers,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import {
  CategoryPill,
  InstallmentBadge,
  InstallmentPurchaseStatusBadge,
  InstallmentStatusBadge,
} from "@/components/financeiro/badges";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusEfetivo } from "@/lib/finance/invoice";
import {
  INSTALLMENT_PURCHASE_STATUSES,
  INSTALLMENT_PURCHASE_STATUS_LABELS,
  type InstallmentPurchaseStatus,
  type InstallmentStatus,
  type StatementStatus,
} from "@/lib/finance/constants";
import {
  cancelInstallmentFuture,
  deleteInstallmentPurchase,
} from "@/lib/actions/installments";
import { toast } from "sonner";
import type {
  InstallmentPurchaseWithRelations,
  InstallmentWithStatement,
} from "@/types/database";

const ALL = "all";

type Option = { id: string; name: string };

function mesAnoLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

type ParcelaView = {
  inst: InstallmentWithStatement;
  efetivo: StatementStatus | null;
  paga: boolean;
  cancelada: boolean;
  statusParcela: InstallmentStatus;
};

type Derived = {
  parcelas: ParcelaView[];
  pagasCount: number;
  aPagarCount: number;
  canceladasCount: number;
  valorRestante: number;
  valorPago: number;
  podeCancelar: boolean;
  status: InstallmentPurchaseStatus;
  primeira: string | null;
  ultima: string | null;
};

function derive(
  p: InstallmentPurchaseWithRelations,
  today: string,
): Derived {
  const parcelas: ParcelaView[] = (p.installments ?? []).map((inst) => {
    const cancelada = inst.status === "cancelada";
    const s = inst.statement;
    const efetivo = s
      ? statusEfetivo(
          {
            data_fechamento: s.data_fechamento,
            data_vencimento: s.data_vencimento,
            pago_em: s.pago_em,
          },
          today,
        )
      : null;
    const paga = !cancelada && efetivo === "paga";
    const statusParcela: InstallmentStatus = cancelada
      ? "cancelada"
      : paga
        ? "paga"
        : "ativa";
    return { inst, efetivo, paga, cancelada, statusParcela };
  });

  const ativas = parcelas.filter((x) => !x.cancelada);
  const pagas = ativas.filter((x) => x.paga);
  const aPagar = ativas.filter((x) => !x.paga);
  const canceladas = parcelas.filter((x) => x.cancelada);

  let status: InstallmentPurchaseStatus;
  if (ativas.length === 0) status = "cancelado";
  else if (aPagar.length === 0) status = "finalizado";
  else status = "ativo";

  const datas = parcelas
    .map((x) => x.inst.statement?.competencia ?? x.inst.data_competencia)
    .filter(Boolean) as string[];

  return {
    parcelas,
    pagasCount: pagas.length,
    aPagarCount: aPagar.length,
    canceladasCount: canceladas.length,
    valorRestante: aPagar.reduce((acc, x) => acc + x.inst.valor, 0),
    valorPago: pagas.reduce((acc, x) => acc + x.inst.valor, 0),
    podeCancelar: aPagar.some((x) => x.efetivo === "aberta" || x.efetivo === null),
    status,
    primeira: datas.length ? datas[0] : null,
    ultima: datas.length ? datas[datas.length - 1] : null,
  };
}

export function InstallmentsClient({
  purchases,
  cards,
  categories,
  today,
  selectedCardId,
  selectedCategoryId,
  status,
}: {
  purchases: InstallmentPurchaseWithRelations[];
  cards: Option[];
  categories: Option[];
  today: string;
  selectedCardId: string | null;
  selectedCategoryId: string | null;
  status: string | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState<string | null>(null);

  function navigate(updates: Record<string, string | null>) {
    const base: Record<string, string | null> = {
      card: selectedCardId,
      category: selectedCategoryId,
      status,
      ...updates,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `/parcelamentos?${qs}` : "/parcelamentos");
  }

  // Deriva tudo e aplica o filtro de status (derivado na leitura).
  const items = React.useMemo(() => {
    const all = purchases.map((p) => ({ p, d: derive(p, today) }));
    return status ? all.filter((it) => it.d.status === status) : all;
  }, [purchases, today, status]);

  const totais = React.useMemo(() => {
    let ativos = 0;
    let restante = 0;
    let pago = 0;
    for (const { d } of items) {
      if (d.status === "ativo") ativos += 1;
      restante += d.valorRestante;
      pago += d.valorPago;
    }
    return { ativos, restante, pago };
  }, [items]);

  async function handleCancel(parentId: string) {
    const res = await cancelInstallmentFuture(parentId);
    if (res.ok) {
      toast.success("Parcelas futuras canceladas.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
    return res;
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhum cartão cadastrado"
        description="Parcelamentos são compras no cartão de crédito. Cadastre um cartão para começar."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Parcelamentos ativos"
          value={String(totais.ativos)}
          icon={Layers}
        />
        <StatCard
          label="Valor a pagar"
          value={formatCurrency(totais.restante)}
          icon={Wallet}
          hint="Parcelas ainda não pagas"
        />
        <StatCard
          label="Já pago"
          value={formatCurrency(totais.pago)}
          icon={CalendarClock}
          hint="Parcelas em faturas pagas"
        />
      </div>

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Cartão</Label>
          <Select
            value={selectedCardId ?? ALL}
            onValueChange={(v) => navigate({ card: v === ALL ? null : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os cartões</SelectItem>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select
            value={selectedCategoryId ?? ALL}
            onValueChange={(v) => navigate({ category: v === ALL ? null : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={status ?? ALL}
            onValueChange={(v) => navigate({ status: v === ALL ? null : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {INSTALLMENT_PURCHASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {INSTALLMENT_PURCHASE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum parcelamento"
          description="Lance uma compra no cartão marcando “Essa compra é parcelada?” para distribuí-la nas faturas."
        />
      ) : (
        <div className="grid gap-3">
          {items.map(({ p, d }) => {
            const isOpen = expanded === p.id;
            const total = p.valor_total ?? p.amount;
            return (
              <Card key={p.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {p.description || "Compra parcelada"}
                        </span>
                        <InstallmentPurchaseStatusBadge status={d.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {p.card && (
                          <span className="inline-flex items-center gap-1">
                            <CreditCard className="size-3" />
                            {p.card.nome}
                          </span>
                        )}
                        {p.category && (
                          <CategoryPill
                            name={p.category.name}
                            color={p.category.color}
                          />
                        )}
                        {d.primeira && d.ultima && (
                          <span>
                            {mesAnoLabel(d.primeira)} → {mesAnoLabel(d.ultima)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.qtd_parcelas}x · {d.pagasCount} paga(s) ·{" "}
                        {d.aPagarCount} a pagar
                        {d.canceladasCount > 0 &&
                          ` · ${d.canceladasCount} cancelada(s)`}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <div className="text-right">
                        <p className="text-base font-semibold tabular-nums">
                          {formatCurrency(total)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Restam {formatCurrency(d.valorRestante)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {d.status === "ativo" && d.podeCancelar && (
                          <DeleteConfirmDialog
                            title="Cancelar parcelas futuras"
                            description="As parcelas ainda em faturas abertas serão canceladas. Parcelas já pagas ou em faturas fechadas não são afetadas."
                            confirmLabel="Cancelar futuras"
                            loadingLabel="Cancelando…"
                            successMessage="Parcelas futuras canceladas."
                            onConfirm={() => handleCancel(p.id)}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Cancelar parcelas futuras"
                                className="text-muted-foreground hover:text-amber-600"
                              >
                                <Ban />
                              </Button>
                            }
                          />
                        )}
                        <DeleteConfirmDialog
                          title="Excluir parcelamento"
                          description="Exclui a compra parcelada e todas as parcelas, inclusive as já lançadas em faturas. Esta ação não pode ser desfeita."
                          successMessage="Parcelamento excluído."
                          onConfirm={async () => {
                            const res = await deleteInstallmentPurchase(p.id);
                            if (res.ok) router.refresh();
                            return res;
                          }}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Excluir parcelamento"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={isOpen ? "Recolher" : "Ver parcelas"}
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                        >
                          {isOpen ? <ChevronUp /> : <ChevronDown />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="space-y-2 border-t pt-3">
                      {d.parcelas.map((pv) => {
                        const comp =
                          pv.inst.statement?.competencia ??
                          pv.inst.data_competencia;
                        return (
                          <div
                            key={pv.inst.id}
                            className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <InstallmentBadge
                                numero={pv.inst.numero}
                                total={pv.inst.total_parcelas}
                              />
                              <div className="min-w-0 text-xs text-muted-foreground">
                                {comp && (
                                  <span className="capitalize">
                                    {mesAnoLabel(comp)}
                                  </span>
                                )}
                                {pv.inst.statement && (
                                  <span>
                                    {" "}
                                    · vence{" "}
                                    {formatDate(
                                      pv.inst.statement.data_vencimento,
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <InstallmentStatusBadge
                                status={pv.statusParcela}
                              />
                              <span className="text-sm font-medium tabular-nums">
                                {formatCurrency(pv.inst.valor)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

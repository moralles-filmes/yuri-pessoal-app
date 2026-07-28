"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CreditCard,
  Layers,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { TransactionFormDialog } from "./transaction-form";
import { TransactionFilters } from "./transaction-filters";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import {
  CategoryPill,
  ClassificacaoBadge,
  EstornoBadge,
  SignedAmount,
  StatusBadge,
  TransactionTypeBadge,
} from "@/components/financeiro/badges";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  deleteTransaction,
  setTransactionStatus,
} from "@/lib/actions/transactions";
import { toast } from "sonner";
import type {
  CategoryRow,
  SubcategoryRow,
  TransactionRow,
  TransactionWithRelations,
} from "@/types/database";

type AccountOption = { id: string; name: string };
type CardOption = {
  id: string;
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
};
type PersonOption = { id: string; nome: string };

function signedValue(t: TransactionWithRelations): number {
  switch (t.type) {
    case "receita":
      return t.amount;
    case "despesa":
      return -t.amount;
    default:
      return t.amount;
  }
}

export function TransactionsClient({
  transactions,
  accounts,
  categories,
  subcategories,
  cards,
  people,
}: {
  transactions: TransactionWithRelations[];
  accounts: AccountOption[];
  categories: Pick<CategoryRow, "id" | "name" | "kind">[];
  subcategories: Pick<SubcategoryRow, "id" | "name" | "category_id">[];
  cards: CardOption[];
  people: PersonOption[];
}) {
  const router = useRouter();

  // Transferência é UMA linha (origem em `account_id`, destino em `transfer_account_id`).
  const rows = transactions;

  const newButton = (
    <TransactionFormDialog
      accounts={accounts}
      categories={categories}
      subcategories={subcategories}
      cards={cards}
      people={people}
      trigger={
        <Button size="sm">
          <Plus /> Novo lançamento
        </Button>
      }
    />
  );

  async function markPaid(id: string) {
    const res = await setTransactionStatus(id, "pago");
    if (res.ok) {
      toast.success("Marcado como pago.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TransactionFilters accounts={accounts} categories={categories} cards={cards} />
        <div className="shrink-0">{newButton}</div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhum lançamento"
          description="Registre despesas, receitas, transferências e ajustes. Use os filtros para refinar."
        >
          {newButton}
        </EmptyState>
      ) : (
        <div className="grid gap-2">
          {rows.map((t) => {
            const value = signedValue(t);
            const isTransfer = t.type === "transferencia";
            // Estorno = receita vinculada a uma fatura de cartão (não é entrada em conta).
            const isEstorno = t.type === "receita" && t.card_id != null;
            return (
              <Card key={t.id}>
                <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {t.description ||
                          (isTransfer ? "Transferência" : "Lançamento")}
                      </span>
                      {isEstorno ? (
                        <EstornoBadge />
                      ) : (
                        <>
                          <TransactionTypeBadge type={t.type} />
                          {t.parcelado ? (
                            <Badge
                              variant="secondary"
                              className="border-0 bg-primary/10 text-primary"
                            >
                              Parcelado {t.qtd_parcelas}x
                            </Badge>
                          ) : t.card ? (
                            // Cartão: pago/em-aberto é DERIVADO da fatura (não do status gravado).
                            <StatusBadge status={t.statement?.pago_em ? "pago" : "pendente"} />
                          ) : (
                            <StatusBadge status={t.status} />
                          )}
                        </>
                      )}
                      {!isTransfer && t.classificacao !== "pessoal" && (
                        <ClassificacaoBadge value={t.classificacao} />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatDate(t.competence_date)}</span>
                      {isTransfer ? (
                        <span className="inline-flex items-center gap-1">
                          {t.account?.name ?? "—"}
                          <ArrowRight className="size-3" />
                          {t.transfer_account?.name ?? "—"}
                        </span>
                      ) : (
                        <>
                          {t.card ? (
                            <span className="inline-flex items-center gap-1">
                              <CreditCard className="size-3" />
                              {t.card.nome}
                            </span>
                          ) : (
                            t.account?.name && <span>{t.account.name}</span>
                          )}
                          {t.category && (
                            <CategoryPill
                              name={t.category.name}
                              color={t.category.color}
                            />
                          )}
                          {t.classificacao !== "pessoal" &&
                            t.valor_pessoal != null && (
                              <span>
                                meu{" "}
                                <span className="font-medium text-foreground">
                                  {formatCurrency(t.valor_pessoal)}
                                </span>
                              </span>
                            )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    {isTransfer ? (
                      <span className="font-medium tabular-nums text-sky-600 dark:text-sky-400">
                        {formatCurrency(t.amount)}
                      </span>
                    ) : (
                      <SignedAmount
                        value={value}
                        formatted={formatCurrency(value)}
                      />
                    )}
                    <div className="flex items-center gap-1">
                      {!t.parcelado && t.status === "pendente" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Marcar como pago"
                          onClick={() => markPaid(t.id)}
                          className="text-muted-foreground hover:text-emerald-600"
                        >
                          <Check />
                        </Button>
                      )}
                      {t.parcelado ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Ver parcelamento"
                        >
                          <Link href="/parcelamentos">
                            <Layers />
                          </Link>
                        </Button>
                      ) : (
                        <TransactionFormDialog
                          transaction={t as TransactionRow}
                          accounts={accounts}
                          categories={categories}
                          subcategories={subcategories}
                          cards={cards}
                          people={people}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Editar"
                            >
                              <Pencil />
                            </Button>
                          }
                        />
                      )}
                      <DeleteConfirmDialog
                        title="Excluir lançamento"
                        description={
                          isTransfer
                            ? "Excluir esta transferência (as duas pernas)?"
                            : "Excluir este lançamento?"
                        }
                        successMessage="Lançamento excluído."
                        onConfirm={async () => {
                          const res = await deleteTransaction(t.id);
                          if (res.ok) router.refresh();
                          return res;
                        }}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Excluir"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

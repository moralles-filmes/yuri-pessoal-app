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
import { cn } from "@/lib/utils";
import { diaExtenso, formatCurrency } from "@/lib/format";
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

/** Um dia do extrato: os lançamentos daquele dia e o saldo no FIM dele. */
type DiaDoExtrato = {
  dia: string;
  itens: TransactionWithRelations[];
};

export function TransactionsClient({
  transactions,
  dailyBalances,
  balanceScope,
  accounts,
  categories,
  subcategories,
  cards,
  people,
}: {
  transactions: TransactionWithRelations[];
  /** Saldo por dia ('yyyy-MM-dd' → reais). `null` quando não há saldo a mostrar. */
  dailyBalances: Record<string, number> | null;
  balanceScope: "conta" | "todas";
  accounts: AccountOption[];
  categories: Pick<CategoryRow, "id" | "name" | "kind">[];
  subcategories: Pick<SubcategoryRow, "id" | "name" | "category_id">[];
  cards: CardOption[];
  people: PersonOption[];
}) {
  const router = useRouter();

  // Transferência é UMA linha (origem em `account_id`, destino em `transfer_account_id`).
  const rows = transactions;

  // A lista já vem ordenada por competência decrescente, então basta quebrar quando o dia
  // muda — sem reordenar nada e sem perder o desempate por created_at que o servidor fez.
  const dias = React.useMemo<DiaDoExtrato[]>(() => {
    const out: DiaDoExtrato[] = [];
    for (const t of rows) {
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.dia === t.competence_date) ultimo.itens.push(t);
      else out.push({ dia: t.competence_date, itens: [t] });
    }
    return out;
  }, [rows]);

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
        <div className="grid gap-5">
          {dias.map(({ dia, itens }) => (
            <section key={dia} className="grid gap-2">
              <DiaHeader
                dia={dia}
                saldo={dailyBalances?.[dia]}
                escopo={balanceScope}
              />
              {itens.map((t) => (
                <TransactionCard
                  key={t.id}
                  t={t}
                  accounts={accounts}
                  categories={categories}
                  subcategories={subcategories}
                  cards={cards}
                  people={people}
                  onMarkPaid={markPaid}
                  onDeleted={() => router.refresh()}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Cabeçalho de um dia do extrato: a data à esquerda, o saldo do fim do dia à direita.
 *
 * O saldo é ausente (e não zero) quando não há saldo a mostrar — filtro de cartão ligado.
 * `min-w-0` no lado do texto porque o irmão da direita é `shrink-0`: sem isso a data
 * empurraria o saldo para fora do cartão no celular.
 */
function DiaHeader({
  dia,
  saldo,
  escopo,
}: {
  dia: string;
  saldo: number | undefined;
  escopo: "conta" | "todas";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium first-letter:uppercase">
        {diaExtenso(dia)}
      </span>
      {saldo != null && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {escopo === "todas" ? "saldo total" : "saldo"}{" "}
          <span
            className={cn(
              "font-semibold tabular-nums",
              saldo < 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {formatCurrency(saldo)}
          </span>
        </span>
      )}
    </div>
  );
}

function TransactionCard({
  t,
  accounts,
  categories,
  subcategories,
  cards,
  people,
  onMarkPaid,
  onDeleted,
}: {
  t: TransactionWithRelations;
  accounts: AccountOption[];
  categories: Pick<CategoryRow, "id" | "name" | "kind">[];
  subcategories: Pick<SubcategoryRow, "id" | "name" | "category_id">[];
  cards: CardOption[];
  people: PersonOption[];
  onMarkPaid: (id: string) => void;
  onDeleted: () => void;
}) {
  const value = signedValue(t);
  const isTransfer = t.type === "transferencia";
  // Estorno = receita vinculada a uma fatura de cartão (não é entrada em conta).
  const isEstorno = t.type === "receita" && t.card_id != null;

  return (
<Card>
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
        {/* A data saiu daqui: agora é o cabeçalho do dia que a carrega. */}
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
            {/* Quem paga o quê. Até agora a lista dizia só "meu R$ X" — quem era o
                terceiro só aparecia abrindo o formulário. */}
            {t.classificacao !== "pessoal" &&
              t.valor_pessoal != null && (
                <span>
                  meu{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(t.valor_pessoal)}
                  </span>
                </span>
              )}
            {(t.shared ?? []).map((s) => (
              <span key={s.person_id} className="min-w-0">
                <span className="truncate">{s.person?.nome ?? "Pessoa"}</span>{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(s.valor)}
                </span>
              </span>
            ))}
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
            onClick={() => onMarkPaid(t.id)}
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
            if (res.ok) onDeleted();
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
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RecurringFormDialog } from "./recurring-form";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import {
  CategoryPill,
  TransactionTypeBadge,
} from "@/components/financeiro/badges";
import { FREQUENCY_LABELS } from "@/lib/finance/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  deleteRecurring,
  generateRecurringNow,
} from "@/lib/actions/recurring";
import type { CategoryRow, RecurringTransactionRow } from "@/types/database";

type Option = { id: string; name: string };
type CardOption = Option & { ativo: boolean };
type RecWithRel = RecurringTransactionRow & {
  account: { id: string; name: string } | null;
  card: { id: string; nome: string } | null;
  category: Pick<CategoryRow, "id" | "name" | "color"> | null;
};

export function RecurringClient({
  recurrences,
  accounts,
  categories,
  cards,
}: {
  recurrences: RecWithRel[];
  accounts: Option[];
  categories: Option[];
  cards: CardOption[];
}) {
  const router = useRouter();
  const [running, setRunning] = React.useState<string | null>(null);

  const newButton = (
    <RecurringFormDialog
      accounts={accounts}
      categories={categories}
      cards={cards}
      trigger={
        <Button size="sm">
          <Plus /> Nova recorrência
        </Button>
      }
    />
  );

  async function generate(id?: string) {
    setRunning(id ?? "all");
    try {
      const res = await generateRecurringNow(id);
      if (res.ok) {
        toast.success(
          res.data.generated > 0
            ? `${res.data.generated} lançamento(s) gerado(s).`
            : "Nada a gerar no momento.",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {recurrences.length} recorrência(s)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate()}
            disabled={running !== null}
          >
            <Play /> {running === "all" ? "Gerando…" : "Gerar agora"}
          </Button>
          {newButton}
        </div>
      </div>

      {recurrences.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma recorrência"
          description="Crie recorrências para gerar lançamentos automaticamente (salário, assinaturas, etc.)."
        >
          {newButton}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {recurrences.map((rec) => (
            <Card key={rec.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {rec.description || "Recorrência"}
                    </span>
                    <TransactionTypeBadge type={rec.type} />
                    <Badge variant="outline" className="font-normal">
                      {FREQUENCY_LABELS[rec.frequency]}
                      {rec.interval_count > 1 ? ` ×${rec.interval_count}` : ""}
                    </Badge>
                    {!rec.is_active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativa
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {formatCurrency(rec.amount)}
                    </span>
                    <span>Próx.: {formatDate(rec.next_due_date)}</span>
                    {rec.category && (
                      <CategoryPill
                        name={rec.category.name}
                        color={rec.category.color}
                      />
                    )}
                    {rec.card ? (
                      <span>{rec.card.nome}</span>
                    ) : (
                      rec.account && <span>{rec.account.name}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generate(rec.id)}
                    disabled={running !== null}
                  >
                    <Play />
                    {running === rec.id ? "Gerando…" : "Gerar"}
                  </Button>
                  <RecurringFormDialog
                    recurrence={rec}
                    accounts={accounts}
                    categories={categories}
                    cards={cards}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Editar">
                        <Pencil />
                      </Button>
                    }
                  />
                  <DeleteConfirmDialog
                    title="Excluir recorrência"
                    description={`Excluir "${rec.description || "recorrência"}"? Os lançamentos já gerados permanecem.`}
                    successMessage="Recorrência excluída."
                    onConfirm={async () => {
                      const res = await deleteRecurring(rec.id);
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

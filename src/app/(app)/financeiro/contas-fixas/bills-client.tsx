"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { BillFormDialog } from "./bill-form";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { CategoryPill } from "@/components/financeiro/badges";
import { FREQUENCY_LABELS } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import {
  deleteBill,
  generateBillTransaction,
  toggleBillActive,
} from "@/lib/actions/bills";
import type { BillRow, CategoryRow } from "@/types/database";

type Option = { id: string; name: string };
type BillWithRel = BillRow & {
  category: Pick<CategoryRow, "id" | "name" | "color"> | null;
  account: { id: string; name: string } | null;
};

export function BillsClient({
  bills,
  categories,
  accounts,
}: {
  bills: BillWithRel[];
  categories: Option[];
  accounts: Option[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const newButton = (
    <BillFormDialog
      categories={categories}
      accounts={accounts}
      trigger={
        <Button size="sm">
          <Plus /> Nova conta fixa
        </Button>
      }
    />
  );

  async function handleGenerate(id: string) {
    setPendingId(id);
    try {
      const res = await generateBillTransaction(id);
      if (res.ok) {
        toast.success(
          res.data.id
            ? "Lançamento do mês criado (pendente)."
            : "Este mês já foi lançado.",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggle(id: string, value: boolean) {
    const res = await toggleBillActive(id, value);
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{bills.length} conta(s) fixa(s)</p>
        {newButton}
      </div>

      {bills.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhuma conta fixa"
          description="Cadastre despesas recorrentes (aluguel, assinaturas, contas) e lance-as a cada mês."
        >
          {newButton}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {bills.map((bill) => (
            <Card key={bill.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{bill.name}</span>
                    <Badge variant="secondary" className="font-normal">
                      Dia {bill.due_day}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {FREQUENCY_LABELS[bill.frequency]}
                    </Badge>
                    {!bill.is_active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativa
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {formatCurrency(bill.amount)}
                    </span>
                    {bill.category && (
                      <CategoryPill
                        name={bill.category.name}
                        color={bill.category.color}
                      />
                    )}
                    {bill.account && <span>{bill.account.name}</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Switch
                    checked={bill.is_active}
                    onCheckedChange={(v) => handleToggle(bill.id, v)}
                    aria-label="Ativa"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerate(bill.id)}
                    disabled={pendingId === bill.id}
                  >
                    <Receipt />
                    {pendingId === bill.id ? "Lançando…" : "Lançar mês"}
                  </Button>
                  <BillFormDialog
                    bill={bill}
                    categories={categories}
                    accounts={accounts}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Editar">
                        <Pencil />
                      </Button>
                    }
                  />
                  <DeleteConfirmDialog
                    title="Excluir conta fixa"
                    description={`Excluir "${bill.name}"?`}
                    successMessage="Conta fixa excluída."
                    onConfirm={async () => {
                      const res = await deleteBill(bill.id);
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

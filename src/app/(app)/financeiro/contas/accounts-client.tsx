"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { AccountFormDialog } from "./account-form";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { AccountTypeBadge, SignedAmount } from "@/components/financeiro/badges";
import { formatCurrency } from "@/lib/format";
import { deleteAccount } from "@/lib/actions/accounts";
import type { AccountWithBalance } from "@/types/database";

export function AccountsClient({
  accounts,
}: {
  accounts: AccountWithBalance[];
}) {
  const router = useRouter();
  const total = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {accounts.length} conta(s) · saldo total{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(total)}
          </span>
        </p>
        <AccountFormDialog
          trigger={
            <Button size="sm">
              <Plus /> Nova conta
            </Button>
          }
        />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta cadastrada"
          description="Cadastre suas carteiras e contas bancárias para começar a controlar seus saldos."
        >
          <AccountFormDialog
            trigger={
              <Button size="sm">
                <Plus /> Nova conta
              </Button>
            }
          />
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="size-9 shrink-0 rounded-xl ring-1 ring-foreground/10"
                    style={{ backgroundColor: account.color ?? "#A98438" }}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">
                        {account.name}
                      </span>
                      <AccountTypeBadge type={account.type} />
                      {!account.is_active && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inativa
                        </Badge>
                      )}
                    </div>
                    {account.bank && (
                      <p className="truncate text-xs text-muted-foreground">
                        {account.bank}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-right">
                    <SignedAmount
                      value={account.current_balance ?? 0}
                      formatted={formatCurrency(account.current_balance ?? 0)}
                      className="text-base"
                    />
                    <p className="text-xs text-muted-foreground">
                      inicial {formatCurrency(account.initial_balance)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <AccountFormDialog
                      account={account}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Editar">
                          <Pencil />
                        </Button>
                      }
                    />
                    <DeleteConfirmDialog
                      title="Excluir conta"
                      description={`Excluir "${account.name}"? Os lançamentos vinculados ficarão sem conta.`}
                      successMessage="Conta excluída."
                      onConfirm={async () => {
                        const res = await deleteAccount(account.id);
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
          ))}
        </div>
      )}
    </div>
  );
}

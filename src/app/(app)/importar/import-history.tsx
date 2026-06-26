"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CreditCard,
  FileClock,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { ImportBatchStatusBadge } from "./import-badges";
import { IMPORT_FORMAT_LABELS } from "@/lib/import/constants";
import { formatDate } from "@/lib/format";
import { deleteImportBatch } from "@/lib/actions/imports";
import type { ImportBatchWithTarget } from "@/types/database";

export function ImportHistory({
  batches,
}: {
  batches: ImportBatchWithTarget[];
}) {
  const router = useRouter();

  if (batches.length === 0) {
    return (
      <EmptyState
        icon={FileClock}
        title="Nenhuma importação ainda"
        description="Os lotes que você importar aparecem aqui, com o que entrou, foi ignorado ou marcado como duplicado."
      />
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Importações recentes
      </h2>
      <div className="grid gap-2">
        {batches.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  {b.origem === "cartao" ? (
                    <CreditCard className="size-4" />
                  ) : (
                    <Wallet className="size-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{b.file_name}</span>
                    <ImportBatchStatusBadge status={b.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {IMPORT_FORMAT_LABELS[b.formato]} ·{" "}
                    {b.card?.nome ?? b.account?.name ?? "—"} ·{" "}
                    {formatDate(b.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.total_linhas} linha(s) · {b.total_importadas} importada(s) ·{" "}
                    {b.total_duplicadas} duplicada(s) · {b.total_ignoradas}{" "}
                    ignorada(s)
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/importar?batch=${b.id}`}>
                    {b.status === "importado" || b.status === "cancelado"
                      ? "Ver"
                      : "Revisar"}
                    <ArrowRight />
                  </Link>
                </Button>
                <DeleteConfirmDialog
                  title="Excluir lote de importação"
                  description="Remove o registro do lote e suas linhas. As transações já importadas NÃO são apagadas."
                  successMessage="Lote excluído."
                  onConfirm={async () => {
                    const res = await deleteImportBatch(b.id);
                    if (res.ok) router.refresh();
                    return res;
                  }}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Excluir lote"
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
    </div>
  );
}

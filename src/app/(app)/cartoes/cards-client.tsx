"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { CreditCardFormDialog } from "./credit-card-form";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { CardBrandBadge } from "@/components/financeiro/badges";
import { formatCurrency } from "@/lib/format";
import { deleteCreditCard } from "@/lib/actions/credit-cards";
import type { CreditCardRow } from "@/types/database";

export function CardsClient({ cards }: { cards: CreditCardRow[] }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {cards.length} cartão(ões) cadastrado(s)
        </p>
        <CreditCardFormDialog
          trigger={
            <Button size="sm">
              <Plus /> Novo cartão
            </Button>
          }
        />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão cadastrado"
          description="Cadastre seus cartões de crédito com limite, fechamento e vencimento para lançar compras e acompanhar as faturas."
        >
          <CreditCardFormDialog
            trigger={
              <Button size="sm">
                <Plus /> Novo cartão
              </Button>
            }
          />
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="size-9 shrink-0 rounded-xl ring-1 ring-foreground/10"
                      style={{ backgroundColor: card.cor ?? "#A98438" }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">
                          {card.nome}
                        </span>
                        {!card.ativo && (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {card.banco}
                      </p>
                    </div>
                  </div>
                  <CardBrandBadge brand={card.bandeira} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Limite</p>
                    <p className="font-medium tabular-nums">
                      {formatCurrency(card.limite_total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fecha dia</p>
                    <p className="font-medium tabular-nums">
                      {card.dia_fechamento}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vence dia</p>
                    <p className="font-medium tabular-nums">
                      {card.dia_vencimento}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/faturas?card=${card.id}`}>
                      <ReceiptText /> Ver faturas
                    </Link>
                  </Button>
                  <div className="flex items-center gap-1">
                    <CreditCardFormDialog
                      card={card}
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
                    <DeleteConfirmDialog
                      title="Excluir cartão"
                      description={`Excluir "${card.nome}"? Cartões com lançamentos não podem ser excluídos — inative-os para preservar o histórico.`}
                      successMessage="Cartão excluído."
                      onConfirm={async () => {
                        const res = await deleteCreditCard(card.id);
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

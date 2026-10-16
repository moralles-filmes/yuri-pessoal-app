"use client";

/**
 * Fase 16-D — Dieta e Alimentação · Despensa.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ SEIS CAMPOS E PONTO FINAL — ISTO NÃO É UM ERP DE ESTOQUE.                             ║
 * ║ Não há entrada, saída, lote nem histórico. Marcar um item como comprado na lista NÃO  ║
 * ║ dá baixa aqui: quem atualiza a despensa é a pessoa, quando ela quiser. Se manter o    ║
 * ║ estoque atualizado custar mais trabalho do que evitar comprar açúcar duas vezes,      ║
 * ║ ninguém usa — e o recurso morre.                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A distinção que a tela precisa deixar clara: quantidade VAZIA é "tenho, mas não sei quanto"
 * (e por isso não desconta); ZERO é "acabou", um fato medido. São coisas diferentes.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import { CalendarClock, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { cn } from "@/lib/utils";
import { diffDaysIso, shortDateLabel } from "@/lib/nutrition/calendar";
import {
  PANTRY_SCOPE_NOTE,
  PANTRY_UNKNOWN_QUANTITY_NOTE,
} from "@/lib/nutrition/constants";
import { formatShoppingQuantity } from "@/lib/nutrition/shopping";
import { normalizeText } from "@/lib/nutrition/filters";
import type { FoodListItem, MarketCategory, PantryItem } from "@/lib/nutrition/types";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const PantryFormDialog = dynamic(
  () => import("./pantry-form-dialog").then((m) => m.PantryFormDialog),
  { ssr: false },
);

export function PantryPanel({
  pantry,
  categories,
  foods,
  hoje,
  pending,
  onSave,
  onDelete,
  onSendLowStock,
}: {
  pantry: PantryItem[];
  categories: MarketCategory[];
  foods: FoodListItem[];
  hoje: string;
  pending: boolean;
  onSave: (values: Record<string, unknown>, id?: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  /** Manda para a lista o que está abaixo do mínimo. Nulo = não há lista aberta. */
  onSendLowStock: (() => void) | null;
}) {
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const pantryFormDialogMontado = useLazyDialog(formOpen);
  const [editing, setEditing] = React.useState<PantryItem | null>(null);

  const filtered = React.useMemo(() => {
    const term = normalizeText(search.trim());
    if (!term) return pantry;
    return pantry.filter((item) =>
      normalizeText(`${item.label} ${item.note ?? ""} ${item.categoryName ?? ""}`).includes(term),
    );
  }, [pantry, search]);

  const abaixoDoMinimo = pantry.filter(
    (item) => item.minQuantity !== null && item.quantity !== null && item.quantity < item.minQuantity,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar na despensa"
            className="h-11 pl-9"
            aria-label="Buscar na despensa"
          />
        </div>
        <Button
          className="h-11"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Item
        </Button>
      </div>

      <p className="rounded-md border border-dashed border-border bg-card/40 p-3 text-[11px] text-muted-foreground">
        {PANTRY_SCOPE_NOTE}
      </p>

      {abaixoDoMinimo.length > 0 && onSendLowStock && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm">
              {abaixoDoMinimo.length}{" "}
              {abaixoDoMinimo.length === 1 ? "item está" : "itens estão"} abaixo do estoque mínimo.
            </span>
            <Button size="sm" variant="outline" className="ms-auto" disabled={pending} onClick={onSendLowStock}>
              Mandar para a lista
            </Button>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={pantry.length === 0 ? "Despensa vazia" : "Nada encontrado"}
          description={
            pantry.length === 0
              ? "Cadastre o que você já tem em casa para a lista de compras descontar automaticamente — só quando a unidade converter de verdade."
              : "Ajuste a busca."
          }
        >
          {pantry.length === 0 && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Adicionar item
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const dias = item.expiresOn ? diffDaysIso(hoje, item.expiresOn) : null;
            return (
              <Card key={item.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.quantity === null ? (
                          <span title={PANTRY_UNKNOWN_QUANTITY_NOTE}>Quantidade não informada</span>
                        ) : (
                          formatShoppingQuantity(item.quantity, item.unit)
                        )}
                        {item.minQuantity !== null &&
                          ` · mínimo ${formatShoppingQuantity(item.minQuantity, item.unit)}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-9 p-0"
                      aria-label={`Editar ${item.label}`}
                      onClick={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-9 p-0"
                      aria-label={`Excluir ${item.label}`}
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Excluir “${item.label}” da despensa?`)) onDelete(item.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {item.categoryName && (
                      <Badge variant="secondary" className="text-[10px]">
                        {item.categoryName}
                      </Badge>
                    )}
                    {item.quantity === 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        Acabou
                      </Badge>
                    )}
                    {item.expiresOn && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1 text-[10px]",
                          dias !== null && dias < 0 && "border-destructive/40 text-destructive",
                        )}
                      >
                        <CalendarClock className="size-3" />
                        {dias !== null && dias < 0
                          ? `Venceu ${shortDateLabel(item.expiresOn)}`
                          : `Vence ${shortDateLabel(item.expiresOn)}`}
                      </Badge>
                    )}
                  </div>

                  {item.note && (
                    <p className="text-[11px] text-muted-foreground">{item.note}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {pantryFormDialogMontado && (
        <PantryFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          item={editing}
          categories={categories}
          foods={foods}
          onSubmit={async (values) => {
            const ok = await onSave(values, editing?.id);
            if (ok) setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Aviso de despensa vazia usado quando a lista pede desconto sem ter o que descontar. */
export function pantryToastEmpty(): void {
  toast.info("Sua despensa está vazia — não há o que descontar ainda.");
}

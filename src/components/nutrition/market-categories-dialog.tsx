"use client";

/**
 * Fase 16-F — gerenciar os CORREDORES DE MERCADO pela interface.
 *
 * As actions (`saveMarketCategory`, `deleteMarketCategory`, `reorderMarketCategories`)
 * existem desde a 16-D e nenhuma tela as chamava. Aqui só se liga o gatilho — nada de regra
 * de negócio nova.
 *
 * ⛔ CORREDOR NÃO É TAXONOMIA NUTRICIONAL (16-D). É a ordem em que a pessoa anda no mercado.
 * Por isso a reordenação existe: ela é o valor do recurso.
 *
 * ⛔ EXCLUIR NÃO APAGA ITEM. A FK é `on delete set null`: os itens da lista ficam "Sem
 * corredor". A confirmação diz isso — nenhuma exclusão silenciosa.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteMarketCategory,
  reorderMarketCategories,
  saveMarketCategory,
} from "@/lib/actions/nutrition-shopping";
import type { MarketCategory } from "@/lib/nutrition/types";

export function MarketCategoriesDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MarketCategory[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [novo, setNovo] = React.useState("");
  const [editing, setEditing] = React.useState<Record<string, string>>({});

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível concluir.");
      }
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const ids = categories.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    run(() => reorderMarketCategories(ids), "Ordem dos corredores atualizada.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Corredores do mercado</DialogTitle>
          <DialogDescription>
            A ordem aqui é a ordem em que a lista de compras é agrupada — organize do jeito que
            você anda pelo mercado. Não é uma classificação nutricional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ul className="divide-y rounded-lg border">
            {categories.length === 0 && (
              <li className="p-4 text-center text-sm text-muted-foreground">
                Nenhum corredor ainda.
              </li>
            )}
            {categories.map((category, index) => (
              <li key={category.id} className="flex items-center gap-2 p-2">
                <Input
                  aria-label={`Nome do corredor ${category.name}`}
                  value={editing[category.id] ?? category.name}
                  onChange={(e) =>
                    setEditing((current) => ({ ...current, [category.id]: e.target.value }))
                  }
                  onBlur={() => {
                    const value = (editing[category.id] ?? category.name).trim();
                    if (!value || value === category.name) {
                      setEditing((current) => {
                        const next = { ...current };
                        delete next[category.id];
                        return next;
                      });
                      return;
                    }
                    run(
                      () => saveMarketCategory({ name: value }, category.id),
                      "Corredor renomeado.",
                    );
                  }}
                  className="h-9"
                />
                {/* Setas em vez de arrasto: é o caminho que funciona no teclado e no
                    leitor de tela — e a reordenação é o ponto deste diálogo. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Mover ${category.name} para cima`}
                  disabled={pending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Mover ${category.name} para baixo`}
                  disabled={pending || index === categories.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Excluir corredor ${category.name}`}
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        `Excluir o corredor “${category.name}”? Os itens que estavam nele continuam na lista, agrupados em “Sem corredor”. Nada é apagado.`,
                      )
                    ) {
                      return;
                    }
                    run(() => deleteMarketCategory(category.id), "Corredor excluído.");
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = novo.trim();
              if (!value) return;
              run(() => saveMarketCategory({ name: value }), "Corredor criado.");
              setNovo("");
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="corredor-novo" className="text-xs">
                Novo corredor
              </Label>
              <Input
                id="corredor-novo"
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                placeholder="Ex.: Hortifrúti"
              />
            </div>
            <Button type="submit" disabled={pending || !novo.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Adicionar
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

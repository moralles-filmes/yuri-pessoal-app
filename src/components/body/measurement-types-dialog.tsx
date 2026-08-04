"use client";

/**
 * Fase 16-F — gerenciar os TIPOS DE MEDIDA pela interface.
 *
 * `saveMeasurementType`, `reorderMeasurementTypes` e `deleteMeasurementType` existem desde a
 * 16-E e nenhuma tela as chamava (a semente dos 16 tipos cobria o uso normal). Aqui só se
 * liga o gatilho.
 *
 * ⛔ NENHUMA EXCLUSÃO SILENCIOSA. Excluir um tipo com histórico pergunta o destino das
 * medições — e o schema `deleteMeasurementTypeSchema` NÃO TEM VALOR PADRÃO para essa escolha,
 * porque uma das opções é irreversível.
 *
 * ⛔ SEM PRESCRIÇÃO. Criar um tipo é organização: nada aqui sugere valor de referência, faixa
 * saudável ou alvo.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MEASUREMENT_CATEGORIES,
  MEASUREMENT_CATEGORY_LABELS,
  MEASUREMENT_UNITS,
} from "@/lib/body/constants";
import type { MeasurementType } from "@/lib/body/types";
import {
  deleteMeasurementType,
  reorderMeasurementTypes,
  saveMeasurementType,
} from "@/lib/actions/body-measurements";

type DeleteTarget = { type: MeasurementType; measurements: number };

export function MeasurementTypesDialog({
  open,
  onOpenChange,
  types,
  measurementCountByType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MeasurementType[];
  /** Quantas medições cada tipo tem — decide se a exclusão precisa perguntar o destino. */
  measurementCountByType: Map<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState<string>("cm");
  const [category, setCategory] = React.useState<string>("circunferencia");
  const [toDelete, setToDelete] = React.useState<DeleteTarget | null>(null);

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
    if (target < 0 || target >= types.length) return;
    const ids = types.map((t) => t.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    run(() => reorderMeasurementTypes({ ids }), "Ordem das medidas atualizada.");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Tipos de medida</DialogTitle>
            <DialogDescription>
              A ordem aqui é a ordem em que as medidas aparecem no registro e nos relatórios.
              Criar um tipo é organização — o sistema não sugere valor de referência nem
              classifica resultado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {types.map((type, index) => {
                const count = measurementCountByType.get(type.id) ?? 0;
                return (
                  <li key={type.id} className="flex items-center gap-2 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm">
                        {type.name}
                        <span className="text-xs text-muted-foreground">{type.unit}</span>
                        {!type.isActive && (
                          <Badge variant="outline" className="text-[10px]">
                            Desativada
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {MEASUREMENT_CATEGORY_LABELS[type.category]} ·{" "}
                        {count === 0
                          ? "sem registros"
                          : `${count} ${count === 1 ? "registro" : "registros"}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={`Mover ${type.name} para cima`}
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
                      aria-label={`Mover ${type.name} para baixo`}
                      disabled={pending || index === types.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Excluir a medida ${type.name}`}
                      disabled={pending}
                      onClick={() => setToDelete({ type, measurements: count })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>

            <form
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const value = name.trim();
                if (!value) return;
                run(
                  () =>
                    saveMeasurementType({
                      name: value,
                      unit,
                      category,
                      side: null,
                      decimals: 1,
                      isActive: true,
                      note: null,
                    }),
                  "Medida criada.",
                );
                setName("");
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="medida-nome" className="text-xs">
                  Nova medida
                </Label>
                <Input
                  id="medida-nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Panturrilha"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="medida-unidade" className="text-xs">
                  Unidade
                </Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger id="medida-unidade" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="medida-categoria" className="text-xs">
                  Categoria
                </Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="medida-categoria" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {MEASUREMENT_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Criar
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ⛔ A escolha do destino do histórico é EXPLÍCITA — sem opção pré-selecionada. */}
      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir “{toDelete?.type.name}”</DialogTitle>
            <DialogDescription>
              {toDelete && toDelete.measurements > 0
                ? `Esta medida tem ${toDelete.measurements} ${
                    toDelete.measurements === 1 ? "registro" : "registros"
                  } no histórico. Escolha o que fazer com ${
                    toDelete.measurements === 1 ? "ele" : "eles"
                  }.`
                : "Esta medida não tem nenhum registro no histórico."}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => {
                if (!toDelete) return;
                run(
                  () =>
                    deleteMeasurementType({
                      id: toDelete.type.id,
                      onMeasurements: "desativar_tipo",
                    }),
                  "Medida desativada. O histórico continua guardado.",
                );
                setToDelete(null);
              }}
            >
              Desativar e guardar o histórico
            </Button>
            <Button
              variant="destructive"
              className="w-full"
              disabled={pending}
              onClick={() => {
                if (!toDelete) return;
                if (
                  toDelete.measurements > 0 &&
                  !confirm(
                    `Apagar também ${toDelete.measurements} ${
                      toDelete.measurements === 1 ? "registro" : "registros"
                    } de “${toDelete.type.name}”? Isso não tem volta.`
                  )
                ) {
                  return;
                }
                run(
                  () =>
                    deleteMeasurementType({
                      id: toDelete.type.id,
                      onMeasurements: "excluir_medicoes",
                    }),
                  "Medida e histórico excluídos.",
                );
                setToDelete(null);
              }}
            >
              Excluir a medida e o histórico
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

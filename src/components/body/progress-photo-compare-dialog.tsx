"use client";

import * as React from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PHOTO_ANGLE_LABELS } from "@/lib/body/constants";
import { longDateLabel, shortDateLabel, diffDaysIso } from "@/lib/nutrition/calendar";
import type { SignedProgressPhoto } from "@/lib/body/types";

/**
 * Antes × depois.
 *
 * As duas imagens usam as URLs JÁ ASSINADAS que vieram da leitura — nenhuma URL nova é
 * gerada, nada é persistido, e não existe "copiar link da comparação". Quando a comparação
 * cruza ângulos diferentes, a tela AVISA: frente contra costas não é evolução, é outro
 * enquadramento.
 */
export function CompareDialog({
  open,
  onOpenChange,
  photos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: SignedProgressPhoto[];
}) {
  // Padrão útil: a mais antiga contra a mais recente.
  const sorted = React.useMemo(
    () => [...photos].sort((a, b) => a.takenOn.localeCompare(b.takenOn)),
    [photos],
  );
  const [beforeId, setBeforeId] = React.useState<string>("");
  const [afterId, setAfterId] = React.useState<string>("");

  // Ajuste durante o render (padrão adotado no projeto — nada de setState em useEffect).
  const defaultBefore = sorted[0]?.id ?? "";
  const defaultAfter = sorted[sorted.length - 1]?.id ?? "";
  const before = photos.find((p) => p.id === (beforeId || defaultBefore)) ?? null;
  const after = photos.find((p) => p.id === (afterId || defaultAfter)) ?? null;

  const days = before && after ? diffDaysIso(before.takenOn, after.takenOn) : null;
  const weightDelta =
    before?.weightKg !== null && before?.weightKg !== undefined &&
    after?.weightKg !== null && after?.weightKg !== undefined
      ? after.weightKg - before.weightKg
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Comparar fotos</DialogTitle>
          <DialogDescription>
            Escolha duas datas. A comparação existe só nesta tela — não gera link nem imagem
            combinada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: beforeId || defaultBefore, set: setBeforeId, label: "Antes" },
            { id: afterId || defaultAfter, set: setAfterId, label: "Depois" },
          ].map((side) => (
            <div key={side.label} className="space-y-1.5">
              <Label>{side.label}</Label>
              <Select value={side.id} onValueChange={side.set}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((photo) => (
                    <SelectItem key={photo.id} value={photo.id}>
                      {shortDateLabel(photo.takenOn)} · {PHOTO_ANGLE_LABELS[photo.angle]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[before, after].map((photo, index) => (
            <figure key={index} className="space-y-1">
              <div className="aspect-3/4 overflow-hidden rounded-lg border bg-muted">
                {photo?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada efêmera
                  <img
                    src={photo.url}
                    alt={`${index === 0 ? "Antes" : "Depois"}: ${longDateLabel(photo.takenOn)}`}
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    Sem imagem
                  </span>
                )}
              </div>
              <figcaption className="text-xs text-muted-foreground">
                {photo ? longDateLabel(photo.takenOn) : "—"}
                {photo?.weightKg !== null && photo?.weightKg !== undefined && (
                  <> · {photo.weightKg.toLocaleString("pt-BR")} kg</>
                )}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
          {days !== null && (
            <p>
              <strong className="tabular-nums">{Math.abs(days)}</strong> dia(s) entre as duas
              fotos.
              {weightDelta !== null && (
                <>
                  {" "}
                  Peso registrado:{" "}
                  <strong className="tabular-nums">
                    {weightDelta > 0 ? "+" : weightDelta < 0 ? "−" : ""}
                    {Math.abs(weightDelta).toLocaleString("pt-BR")} kg
                  </strong>
                  .
                </>
              )}
            </p>
          )}
          {before && after && before.angle !== after.angle && (
            <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-500">
              <Badge variant="outline" className="border-amber-500/40">
                Atenção
              </Badge>
              As fotos são de ângulos diferentes ({PHOTO_ANGLE_LABELS[before.angle]} e{" "}
              {PHOTO_ANGLE_LABELS[after.angle]}). A diferença que você vê pode ser só o
              enquadramento.
            </p>
          )}
          <p className={cn("text-xs text-muted-foreground")}>
            Iluminação, horário, postura e roupa mudam bastante a aparência de uma foto para a
            outra. Use a comparação como referência, junto das medidas.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

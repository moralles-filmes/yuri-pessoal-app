"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EditQuantityDialog({
  entry,
  onOpenChange,
  onConfirm,
}: {
  entry: { id: string; label: string; quantity: number } | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (quantity: number) => Promise<void>;
}) {
  const [quantity, setQuantity] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [lastId, setLastId] = React.useState<string | null>(entry?.id ?? null);
  if ((entry?.id ?? null) !== lastId) {
    setLastId(entry?.id ?? null);
    setQuantity(entry ? String(entry.quantity) : "");
    setSaving(false);
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar quantidade</DialogTitle>
          <DialogDescription>
            {entry?.label}. Os valores nutricionais são recalculados agora, a partir do
            catálogo atual, e congelados de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="edit-quantity">Quantidade</Label>
          <Input
            id="edit-quantity"
            autoFocus
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !Number(quantity.replace(",", "."))}
            onClick={async () => {
              setSaving(true);
              await onConfirm(Number(quantity.replace(",", ".")));
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

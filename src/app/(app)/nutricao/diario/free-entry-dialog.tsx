"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FreeEntryDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setLabel("");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Item sem valor nutricional</DialogTitle>
          <DialogDescription>
            Para o que você comeu mas não sabe a composição. O item fica registrado, e o total
            do dia passa a ser marcado como parcial — em vez de fingir que ele não existiu ou
            de inventar calorias para ele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="free-label">O que foi consumido</Label>
          <Input
            id="free-label"
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ex.: almoço na casa da minha mãe"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!label.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(label.trim());
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

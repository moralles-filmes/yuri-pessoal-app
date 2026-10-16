"use client";

import * as React from "react";
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

export function FreeItemDialog({
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
          <DialogTitle>Item livre</DialogTitle>
          <DialogDescription>
            Para o que faz parte da refeição mas não tem valor nutricional cadastrado. O item
            aparece na lista e deixa o total do modelo marcado como parcial — em vez de fingir
            que não existe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="free-item">Descrição</Label>
          <Input
            id="free-item"
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ex.: café preto sem açúcar"
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
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

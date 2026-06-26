"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmação de exclusão reutilizável (construída sobre Dialog).
 * `onConfirm` deve devolver o ActionResult da Server Action.
 */
export function DeleteConfirmDialog({
  trigger,
  title = "Excluir registro",
  description = "Esta ação não pode ser desfeita.",
  confirmLabel = "Excluir",
  loadingLabel = "Excluindo…",
  successMessage = "Excluído com sucesso.",
  onConfirm,
}: {
  trigger: React.ReactNode;
  title?: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  successMessage?: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await onConfirm();
      if (res.ok) {
        toast.success(successMessage);
        setOpen(false);
      } else {
        toast.error(res.error ?? "Não foi possível excluir.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

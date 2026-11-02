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
import {
  FRASE_DA_PREVISAO_FALHA,
  linhasDaPrevisao,
  podeConfirmar,
  type EstadoDaPrevisao,
  type PrevisaoDeExclusao,
} from "@/lib/finance/previsao-da-exclusao";

/**
 * Confirmação de exclusão reutilizável (construída sobre Dialog).
 * `onConfirm` deve devolver o ActionResult da Server Action.
 *
 * Com `carregarPrevisao` (03-G2 K3): ao abrir, o diálogo lê o que a exclusão leva junto e o botão
 * Excluir fica travado enquanto essa leitura não volta sem erro e sem bloqueio. O servidor reconfere
 * na hora de excluir. Sem a prop, o comportamento é o de sempre.
 */
export function DeleteConfirmDialog({
  trigger,
  title = "Excluir registro",
  description = "Esta ação não pode ser desfeita.",
  confirmLabel = "Excluir",
  loadingLabel = "Excluindo…",
  successMessage = "Excluído com sucesso.",
  onConfirm,
  carregarPrevisao,
}: {
  trigger: React.ReactNode;
  title?: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  successMessage?: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
  carregarPrevisao?: () => Promise<
    { ok: true; data: PrevisaoDeExclusao } | { ok: false; error?: string }
  >;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [previsao, setPrevisao] = React.useState<EstadoDaPrevisao | null>(null);
  const pedido = React.useRef(0);

  function aoMudarAbertura(aberto: boolean) {
    setOpen(aberto);
    if (aberto && carregarPrevisao) {
      const meu = ++pedido.current;
      setPrevisao({ fase: "carregando" });
      carregarPrevisao().then(
        (res) => {
          if (meu !== pedido.current) return;
          setPrevisao(res.ok ? { fase: "pronta", previsao: res.data } : { fase: "erro" });
        },
        () => {
          if (meu === pedido.current) setPrevisao({ fase: "erro" });
        },
      );
    }
  }

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
    <Dialog open={open} onOpenChange={aoMudarAbertura}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {carregarPrevisao && (
          <div className="space-y-2 text-sm">
            {previsao?.fase === "carregando" && (
              <p className="text-muted-foreground">Conferindo o que sai junto…</p>
            )}
            {previsao?.fase === "erro" && (
              <p className="text-destructive">{FRASE_DA_PREVISAO_FALHA}</p>
            )}
            {previsao?.fase === "pronta" && previsao.previsao.bloqueio && (
              <p className="text-destructive">{previsao.previsao.bloqueio}</p>
            )}
            {previsao?.fase === "pronta" && !previsao.previsao.bloqueio && (
              linhasDaPrevisao(previsao.previsao).length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {linhasDaPrevisao(previsao.previsao).map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nada mais sai junto com ele.</p>
              )
            )}
          </div>
        )}
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
            disabled={loading || (carregarPrevisao !== undefined && !podeConfirmar(previsao))}
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

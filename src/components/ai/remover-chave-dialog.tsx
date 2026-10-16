"use client";

/**
 * REDESIGN-07-D · D2 — IA · "Remover chave" confirma antes.
 *
 * Até aqui o botão apagava a credencial no clique: um toque errado no celular desativava o
 * provedor, e a chave só voltava colando-a de novo — se o dono ainda a tivesse. O diálogo diz
 * as duas coisas antes (o que some e como voltar) e não fecha no meio da remoção.
 *
 * Entra por `next/dynamic` + `useLazyDialog` em `provider-card.tsx` (regra 2 do carregamento
 * sob demanda). A action é a mesma de antes (`removeAiCredential`), sem nenhuma mudança.
 */

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeAiCredential } from "@/lib/actions/ai-providers";
import type { AiProviderId } from "@/lib/ai/core/contracts";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";

export function RemoverChaveDialog({
  aberto,
  onAbertoChange,
  provider,
  rotulo,
  onRemovida,
  focoDeVolta,
}: {
  readonly aberto: boolean;
  readonly onAbertoChange: (aberto: boolean) => void;
  readonly provider: AiProviderId;
  readonly rotulo: string;
  readonly onRemovida: () => void;
  /** O botão que abriu: sem `DialogTrigger`, o Radix não sabe para onde devolver o foco. */
  readonly focoDeVolta?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [removendo, setRemovendo] = React.useState(false);

  // Esc, clique fora e o X não fecham no meio da remoção: o dono veria o diálogo sumir sem
  // saber se a chave foi apagada.
  function aoMudarAbertura(proximo: boolean) {
    if (removendo) return;
    onAbertoChange(proximo);
  }

  async function remover() {
    setRemovendo(true);
    try {
      const r = await removeAiCredential({ provider });
      if (!r.ok) {
        toast.error(mensagemDaAction(r));
        return;
      }
      toast.success("Credencial removida e provedor desativado.");
      onRemovida();
    } catch {
      toast.error("Não deu para confirmar a remoção. Recarregue a página para ver se a chave continua lá.");
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAbertura}>
      <DialogContent
        showCloseButton={!removendo}
        onCloseAutoFocus={(e) => {
          if (!focoDeVolta?.current) return;
          e.preventDefault();
          focoDeVolta.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Remover a chave de {rotulo}?</DialogTitle>
          <DialogDescription>
            A chave de {rotulo} é apagada e o provedor é desativado.{" "}
            Para voltar, cole a chave de novo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={removendo}
            onClick={() => aoMudarAbertura(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={removendo}
            onClick={() => void remover()}
          >
            {removendo ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {removendo ? "Removendo…" : "Remover chave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

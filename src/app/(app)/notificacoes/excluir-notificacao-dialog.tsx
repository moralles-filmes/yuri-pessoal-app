"use client";

/**
 * REDESIGN-07-D · D5 — Notificações · Confirmar a exclusão, num diálogo ÚNICO da tela.
 *
 * Antes cada linha montava o próprio `DeleteConfirmDialog` (03-D, que recebe o botão por
 * `trigger` e por isso não pode ser carregado sob demanda): o diálogo entrava no primeiro
 * carregamento de `/notificacoes`, e ele não trava o `onOpenChange` durante o envio. Aqui ele é
 * um só, controlado pela tela, entra por `next/dynamic` + `useLazyDialog` e não fecha no meio da
 * exclusão. Fecha primeiro e só então recarrega a lista — a linha não some por baixo de um
 * diálogo aberto. A action é a mesma (`deleteNotification`), sem mudança.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { deleteNotification } from "@/lib/actions/notifications";

export function ExcluirNotificacaoDialog({
  notificacao,
  onFechar,
}: {
  /** A notificação a excluir; `null` = diálogo fechado. */
  readonly notificacao: { readonly id: string; readonly title: string } | null;
  readonly onFechar: () => void;
}) {
  const router = useRouter();
  const [excluindo, setExcluindo] = React.useState(false);
  /*
    Sem `DialogTrigger`, o Radix não sabe para onde devolver o foco. Ele é guardado ao abrir (o
    foco ainda está na lixeira clicada) e devolvido ao fechar — aqui, dentro do diálogo sob
    demanda, e não na tela, que paga cada byte no primeiro carregamento.
  */
  const focoDeVolta = React.useRef<HTMLElement | null>(null);
  // A última exibida segura o texto durante a animação de fechar (`notificacao` já é `null`).
  const [exibida, setExibida] = React.useState(notificacao);
  if (notificacao && notificacao !== exibida) setExibida(notificacao);

  // Esc, clique fora e o X não fecham no meio da exclusão.
  function aoMudarAbertura(proximo: boolean) {
    if (excluindo) return;
    if (!proximo) onFechar();
  }

  async function excluir() {
    if (!exibida) return;
    setExcluindo(true);
    try {
      const r = await deleteNotification(exibida.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Notificação excluída.");
      onFechar();
      router.refresh();
    } catch {
      toast.error("Não deu para confirmar a exclusão. Recarregue a página para conferir.");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Dialog open={notificacao !== null} onOpenChange={aoMudarAbertura}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={() => {
          focoDeVolta.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(e) => {
          // A linha some depois de excluir; só devolve o foco a um botão que ainda existe.
          if (!focoDeVolta.current?.isConnected) return;
          e.preventDefault();
          focoDeVolta.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Excluir notificação</DialogTitle>
          <DialogDescription>
            {exibida ? `“${exibida.title}” será removida.` : "A notificação será removida."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={excluindo} onClick={() => aoMudarAbertura(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={excluindo} onClick={() => void excluir()}>
            {excluindo && <Loader2 className="size-4 animate-spin" />}
            {excluindo ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

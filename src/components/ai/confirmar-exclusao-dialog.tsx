"use client";

/**
 * REDESIGN-07-D · D8 — IA · Confirmar uma exclusão, num diálogo ÚNICO da tela, sob demanda.
 *
 * Serve à exclusão de conversa e à de memória. Antes a memória usava o `DeleteConfirmDialog`
 * (03-D) DENTRO da linha: o `revalidatePath` da action atualizava a lista antes do
 * `setOpen(false)` dele, a linha sumia com o diálogo aberto dentro. E a conversa deixava
 * "Excluir"/"Cancelar" clicáveis e o X ativo durante o envio. Aqui:
 *
 *  • um diálogo para a tela inteira, controlado por quem o abre (`alvoId`);
 *  • `onOpenChange` travado, sem X e com os botões desabilitados enquanto a action roda;
 *  • fecha PRIMEIRO e só então recarrega a lista;
 *  • o erro passa por `mensagemDaAction` (regra 2 de formulário);
 *  • o foco volta ao botão que abriu, se ele ainda existir.
 *
 * Entra por `next/dynamic` + `useLazyDialog`: não pesa no primeiro carregamento das listas.
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
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";

type ResultadoDaAction =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export function ConfirmarExclusaoDialog({
  alvoId,
  onFechar,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloEnviando,
  mensagemDeSucesso,
  acao,
}: {
  /** O registro a excluir; `null` = diálogo fechado. */
  readonly alvoId: string | null;
  readonly onFechar: () => void;
  readonly titulo: string;
  readonly descricao: string;
  readonly rotuloConfirmar: string;
  readonly rotuloEnviando: string;
  readonly mensagemDeSucesso: string;
  readonly acao: (id: string) => Promise<ResultadoDaAction>;
}) {
  const router = useRouter();
  const [excluindo, setExcluindo] = React.useState(false);
  // O último alvo segura o id durante a animação de fechar (`alvoId` já é `null`).
  const [id, setId] = React.useState(alvoId);
  if (alvoId && alvoId !== id) setId(alvoId);
  // Sem `DialogTrigger`, o Radix não sabe para onde devolver o foco: guardado ao abrir.
  const focoDeVolta = React.useRef<HTMLElement | null>(null);

  function aoMudarAbertura(proximo: boolean) {
    if (excluindo) return;
    if (!proximo) onFechar();
  }

  async function excluir() {
    if (!id) return;
    setExcluindo(true);
    try {
      const r = await acao(id);
      if (!r.ok) {
        toast.error(mensagemDaAction(r));
        return;
      }
      toast.success(mensagemDeSucesso);
      onFechar();
      router.refresh();
    } catch {
      toast.error("Não deu para confirmar a exclusão. Recarregue a página para conferir.");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Dialog open={alvoId !== null} onOpenChange={aoMudarAbertura}>
      {/* `sm:max-w-lg`: um `max-w-*` sem prefixo não vence o `sm:max-w-sm` da primitiva. */}
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!excluindo}
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
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={excluindo} onClick={() => aoMudarAbertura(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={excluindo} onClick={() => void excluir()}>
            {excluindo && <Loader2 className="size-4 animate-spin" />}
            {excluindo ? rotuloEnviando : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

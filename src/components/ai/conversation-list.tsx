"use client";

/**
 * Fase 18-A — IA · Lista de conversas com as ações de manutenção.
 *
 * ⚠️ Excluir uma conversa leva junto mensagens, execuções e o HISTÓRICO DE CUSTO delas (as
 * FKs são `on delete cascade`). A tela diz isso ANTES, porque a alternativa — descobrir
 * depois que o relatório do mês encolheu — é bem pior.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deleteConversation,
  setConversationFavorite,
  setConversationStatus,
} from "@/lib/actions/ai-conversations";
import type { ConversationListItem } from "@/lib/ai/types";

/**
 * REDESIGN-07-D · D8 — a confirmação de exclusão é um diálogo único, sob demanda, com trava de
 * `onOpenChange`, botões desabilitados durante o envio e "fecha, depois recarrega". Objeto
 * literal escrito aqui: o compilador do Next o lê estaticamente.
 */
const ConfirmarExclusaoDialog = dynamic(
  () => import("@/components/ai/confirmar-exclusao-dialog").then((m) => m.ConfirmarExclusaoDialog),
  { ssr: false, loading: () => null },
);

export function ConversationList({
  conversas,
}: {
  /** Com o `href` de cada uma já montado pelo construtor, no servidor (REDESIGN-07-D · D7). */
  conversas: readonly (ConversationListItem & { readonly href: string })[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<string | null>(null);
  const exclusaoMontada = useLazyDialog(paraExcluir !== null);

  /**
   * Favoritar e arquivar: recebem só o id e o estado da própria linha. ⚠️ Exceção declarada em
   * `ia-sistema-formularios.test.ts` — erro de campo aqui só nasce de defeito de programação, e o
   * mapa custaria ~0,45 KB gz a esta rota. A exclusão passa pelo mapa no diálogo sob demanda.
   */
  async function executar(id: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setOcupado(id);
    const r = await fn();
    setOcupado(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <ul className="space-y-2">
        {conversas.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
          >
            <Link
              href={c.href}
              className="min-w-0 flex-1 hover:text-primary"
            >
              <p className="truncate font-medium">{c.title ?? "Conversa sem título"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.lastMessageAt
                  ? `última mensagem em ${formatDate(c.lastMessageAt)}`
                  : `criada em ${formatDate(c.createdAt)}`}
                {c.status === "arquivada" && " · arquivada"}
              </p>
            </Link>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                // D8 — alternância com nome FIXO e estado em `aria-pressed`: um rótulo que troca
                // de sentido a cada clique deixa quem ouve sem saber o que está valendo.
                aria-label="Favorita"
                aria-pressed={c.isFavorite}
                disabled={ocupado === c.id}
                onClick={() =>
                  void executar(c.id, () =>
                    setConversationFavorite({
                      conversationId: c.id,
                      isFavorite: !c.isFavorite,
                    }),
                  )
                }
              >
                <Star
                  className={cn(
                    "size-4",
                    c.isFavorite && "fill-amber-400 text-amber-400",
                  )}
                />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                aria-label={c.status === "ativa" ? "Arquivar" : "Reativar"}
                disabled={ocupado === c.id}
                onClick={() =>
                  void executar(c.id, () =>
                    setConversationStatus({
                      conversationId: c.id,
                      status: c.status === "ativa" ? "arquivada" : "ativa",
                    }),
                  )
                }
              >
                {c.status === "ativa" ? (
                  <Archive className="size-4" />
                ) : (
                  <ArchiveRestore className="size-4" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                aria-label="Excluir"
                disabled={ocupado === c.id}
                aria-haspopup="dialog"
                onClick={() => setParaExcluir(c.id)}
                className="text-destructive hover:text-destructive"
              >
                {ocupado === c.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {exclusaoMontada && (
        <ConfirmarExclusaoDialog
          alvoId={paraExcluir}
          onFechar={() => setParaExcluir(null)}
          titulo="Excluir esta conversa?"
          descricao="Isso apaga as mensagens, as execuções e o histórico de custo desta conversa. O consumo já registrado nos relatórios do período deixará de aparecer. Não há como desfazer."
          rotuloConfirmar="Excluir"
          rotuloEnviando="Excluindo…"
          mensagemDeSucesso="Conversa excluída."
          acao={(id) => deleteConversation({ conversationId: id })}
        />
      )}
    </>
  );
}

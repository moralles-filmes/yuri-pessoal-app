"use client";

/**
 * Fase 18-A — IA · Lista de conversas com as ações de manutenção.
 *
 * ⚠️ Excluir uma conversa leva junto mensagens, execuções e o HISTÓRICO DE CUSTO delas (as
 * FKs são `on delete cascade`). A tela diz isso ANTES, porque a alternativa — descobrir
 * depois que o relatório do mês encolheu — é bem pior.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  MessagesSquare,
  Star,
  Trash2,
} from "lucide-react";
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
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deleteConversation,
  setConversationFavorite,
  setConversationStatus,
} from "@/lib/actions/ai-conversations";
import type { ConversationListItem } from "@/lib/ai/types";

export function ConversationList({
  conversas,
}: {
  conversas: readonly ConversationListItem[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<ConversationListItem | null>(null);

  async function executar(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setOcupado(id);
    const r = await fn();
    setOcupado(null);
    if (!r.ok) {
      toast.error(r.error ?? "Não foi possível concluir a ação.");
      return false;
    }
    router.refresh();
    return true;
  }

  if (conversas.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Nenhuma conversa ainda"
        description="Comece uma conversa na aba Conversar."
      />
    );
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
              href={`/ia/conversas/${c.id}`}
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
                aria-label={c.isFavorite ? "Desfavoritar" : "Favoritar"}
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
                onClick={() => setParaExcluir(c)}
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

      <Dialog
        open={paraExcluir !== null}
        onOpenChange={(aberto) => !aberto && setParaExcluir(null)}
      >
        {/* `sm:max-w-lg` porque em `DialogContent` um `max-w-*` sem prefixo não vence o
            `sm:max-w-sm` da primitiva — o twMerge deixa a classe da base ganhar de `sm` para
            cima. O limite do celular já vem da primitiva. */}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir esta conversa?</DialogTitle>
            <DialogDescription>
              Isso apaga as mensagens, as execuções e o histórico de custo desta conversa.
              O consumo já registrado nos relatórios do período deixará de aparecer. Não há
              como desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParaExcluir(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!paraExcluir) return;
                const ok = await executar(paraExcluir.id, () =>
                  deleteConversation({ conversationId: paraExcluir.id }),
                );
                if (ok) {
                  toast.success("Conversa excluída.");
                  setParaExcluir(null);
                }
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

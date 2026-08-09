"use client";

/**
 * Fase 18-D · Bloco 5 — IA · O botão que faz o arquivo SAIR do sistema.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ É O ÚNICO CLIQUE DO SISTEMA QUE TRANSMITE UM ARQUIVO DO DONO PARA FORA — E ELE DIZ    ║
 * ║ ISSO ANTES, NÃO DEPOIS.                                                                ║
 * ║                                                                                       ║
 * ║ Nenhum `undo` alcança um arquivo já transmitido. Por isso o texto vem junto do botão   ║
 * ║ e não num aviso que dá para não ler: quem clica precisa ter lido.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ A leitura pode demorar — é uma chamada de visão, sem streaming. O estado de espera é
 * explícito, e o botão não aceita segundo clique: um duplo dispararia um SEGUNDO run, com
 * reserva de orçamento própria, e o dono pagaria duas leituras do mesmo arquivo.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { extrairComprovante } from "@/lib/actions/ai-documents";

export function ReceiptExtractButton({
  documentoId,
  desligado,
}: {
  readonly documentoId: string;
  readonly desligado: boolean;
}) {
  const router = useRouter();
  const [lendo, setLendo] = React.useState(false);

  async function extrair() {
    if (lendo) return;
    setLendo(true);
    const r = await extrairComprovante({ documentoId });
    setLendo(false);

    if (!r.ok) {
      toast.error(r.error);
      // ⚠️ `refresh` também na FALHA: ela virou linha em `ai_document_extractions`, e a tela
      // precisa mostrá-la. Uma falha sem rastro é indistinguível de um botão que não fez nada.
      router.refresh();
      return;
    }
    toast.success("Comprovante lido. Confira campo a campo antes de lançar.");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button onClick={extrair} disabled={desligado || lendo} className="min-w-0">
        {lendo ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
        <span className="truncate">
          {lendo ? "Lendo o comprovante…" : "Ler este comprovante"}
        </span>
      </Button>
      <p className="text-xs text-muted-foreground">
        Ao clicar, o arquivo é enviado ao provedor de IA que você configurou.{" "}
        <strong className="text-foreground">Isso não tem como ser desfeito</strong> — o custo
        estimado entra no seu orçamento e aparece em Consumo.
      </p>
    </div>
  );
}

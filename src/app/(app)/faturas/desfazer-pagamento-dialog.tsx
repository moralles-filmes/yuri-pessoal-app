"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { markStatementUnpaid, preverDesfazerPagamento } from "@/lib/actions/statements";
import {
  MSG_LEITURA_DO_PAGAMENTO_FALHOU,
  textoDoDesfazer,
  type PrevisaoDoDesfazer,
} from "@/lib/finance/desfazer-pagamento";

type Leitura =
  | { tipo: "erro"; mensagem: string }
  | { tipo: "lido"; previsao: PrevisaoDoDesfazer };

/**
 * REDESIGN-03-F · A3 — desfazer o pagamento de uma fatura com confirmação.
 *
 * Abre LENDO o pagamento (`preverDesfazerPagamento`), diz o que vai acontecer e só desfaz no
 * clique de confirmação — e esse clique manda o `lancamentoId` DA LEITURA, nunca um relido: a
 * RPC recusa se o pagamento mudou entre a leitura e o clique.
 *
 * `statementId` nulo = fechado. O diálogo é carregado sob demanda e fica montado depois da
 * primeira abertura (useLazyDialog, no pai), por isso a leitura é reiniciada a cada nova fatura.
 */
export default function DesfazerPagamentoDialog({
  statementId,
  onOpenChange,
}: {
  statementId: string | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const router = useRouter();
  // `null` = ainda lendo. Só é preenchido DEPOIS da resposta (assíncrono), então o efeito abaixo
  // não faz setState síncrono; o reinício a cada abertura é o ajuste durante o render.
  const [leitura, setLeitura] = React.useState<Leitura | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [fatura, setFatura] = React.useState<string | null>(statementId);
  // Sobe a cada recusa da RPC: a leitura é refeita, e o diálogo passa a mostrar o estado ATUAL
  // (sem o botão, se o pagamento foi editado ou desfeito por fora) em vez do texto velho.
  const [releitura, setReleitura] = React.useState(0);

  // Estado derivado de prop (padrão de use-lazy-dialog.ts): ao abrir uma fatura, descarta a
  // leitura da anterior. Ao fechar (nulo) o conteúdo fica, para não piscar na animação de saída.
  if (statementId !== fatura) {
    setFatura(statementId);
    if (statementId !== null) {
      setLeitura(null);
      setEnviando(false);
    }
  }

  React.useEffect(() => {
    if (statementId === null) return;
    let cancelado = false;
    preverDesfazerPagamento(statementId)
      .then((res) => {
        if (cancelado) return;
        setLeitura(
          res.ok ? { tipo: "lido", previsao: res.data } : { tipo: "erro", mensagem: res.error },
        );
      })
      .catch(() => {
        if (!cancelado) setLeitura({ tipo: "erro", mensagem: MSG_LEITURA_DO_PAGAMENTO_FALHOU });
      });
    return () => {
      cancelado = true;
    };
  }, [statementId, releitura]);

  const texto = leitura?.tipo === "lido" ? textoDoDesfazer(leitura.previsao) : null;
  const podeConfirmar = texto?.podeConfirmar === true;

  async function handleConfirm() {
    if (statementId === null || leitura?.tipo !== "lido" || !podeConfirmar) return;
    // O lançamento DA PREVISÃO LIDA, nunca relido.
    const lancamentoId =
      leitura.previsao.estado === "com-lancamento" ? leitura.previsao.lancamentoId : null;
    setEnviando(true);
    try {
      const res = await markStatementUnpaid(statementId, lancamentoId);
      if (res.ok) {
        toast.success("Pagamento desfeito.");
        onOpenChange(false);
      } else {
        // O estado mudou por fora: o diálogo fica aberto e LÊ DE NOVO, para o dono decidir sobre
        // o pagamento atual — confirmar outra vez com o lançamento velho só repetiria a recusa.
        toast.error(res.error);
        setLeitura(null);
        setReleitura((n) => n + 1);
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={statementId !== null}
      onOpenChange={(v) => {
        if (!v && !enviando) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desfazer pagamento da fatura</DialogTitle>
          {/* aria-live: o texto chega depois da leitura; sem isso o leitor de tela anuncia só "Lendo…". */}
          <DialogDescription className="break-words" aria-live="polite">
            {leitura === null
              ? "Lendo o pagamento…"
              : leitura.tipo === "erro"
                ? leitura.mensagem
                : texto?.texto}
            {texto?.linkLancamentos && (
              <>
                {" "}
                <Link href="/financeiro/lancamentos" className="underline">
                  Abrir Lançamentos
                </Link>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          {podeConfirmar && (
            <Button variant="destructive" onClick={handleConfirm} disabled={enviando}>
              {enviando ? "Desfazendo…" : "Desfazer pagamento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

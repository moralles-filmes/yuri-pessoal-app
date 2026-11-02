"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markStatementPaid } from "@/lib/actions/statements";
import { desfechoDoPagamento } from "@/lib/finance/statement-payment";
import { formatCurrency, formatDate } from "@/lib/format";

/** O que o diálogo precisa saber da fatura; `titulo` já vem pronto do pai. */
export type FaturaAPagar = {
  statementId: string;
  titulo: string;
  totalReais: number;
  meuReais: number;
  terceirosReais: number;
  /** 'yyyy-MM-dd' */
  vencimento: string;
};

/** Aviso que substitui o formulário depois de uma resposta que não é "pago" nem recusa. */
type Aviso = "ja-paga" | "incerto" | null;

/**
 * REDESIGN-05-B — pagar uma fatura de cartão.
 *
 * `fatura` nulo = fechado. O diálogo é carregado sob demanda e fica montado depois da primeira
 * abertura (useLazyDialog, no pai), por isso o estado é reiniciado a cada nova fatura.
 *
 * Reenvio sem mentir: a RPC de pagamento é idempotente, então "já estava paga" não é erro para
 * quem clicou, e uma resposta que não chegou é dita como INCERTA — a lista é recarregada para o
 * dono conferir, e tentar de novo é seguro porque o sistema não paga a mesma fatura duas vezes.
 */
export default function PagarFaturaDialog({
  fatura,
  accounts,
  today,
  onOpenChange,
}: {
  fatura: FaturaAPagar | null;
  accounts: { id: string; name: string }[];
  today: string;
  onOpenChange: (aberto: boolean) => void;
}) {
  const router = useRouter();
  const [contaId, setContaId] = React.useState<string | undefined>(undefined);
  // Data em que o pagamento saiu da conta — editável para bater com o extrato do banco.
  const [data, setData] = React.useState(today);
  // Recusa de data: a mensagem fica sob o campo.
  const [erroData, setErroData] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<Aviso>(null);
  const [loading, setLoading] = React.useState(false);
  // Fatura mostrada: ao fechar (nulo) o conteúdo fica, para não piscar na animação de saída.
  const [exibida, setExibida] = React.useState<FaturaAPagar | null>(fatura);
  const [idAtual, setIdAtual] = React.useState<string | null>(fatura?.statementId ?? null);
  // O `disabled` por estado chega um render atrasado: a ref barra o segundo clique já no primeiro.
  const enviando = React.useRef(false);

  // Estado derivado de prop (padrão de use-lazy-dialog.ts): fechar e abrir de novo, ou abrir
  // outra fatura, descarta conta, data, erro e aviso da anterior.
  const idDaProp = fatura?.statementId ?? null;
  if (idDaProp !== idAtual) {
    setIdAtual(idDaProp);
    if (fatura !== null) {
      setExibida(fatura);
      setContaId(undefined);
      setData(today);
      setErroData(null);
      setAviso(null);
      setLoading(false);
    }
  }

  async function enviar() {
    if (enviando.current) return;
    if (!exibida || !contaId || !data) return;
    enviando.current = true;
    setLoading(true);
    let res: Awaited<ReturnType<typeof markStatementPaid>> | { excecao: true };
    try {
      res = await markStatementPaid(exibida.statementId, contaId, data);
    } catch {
      res = { excecao: true };
    } finally {
      enviando.current = false;
      setLoading(false);
    }

    const desfecho = desfechoDoPagamento(res);
    switch (desfecho.tipo) {
      case "pago":
        toast.success("Fatura paga e debitada da conta.");
        onOpenChange(false);
        router.refresh();
        break;
      case "ja-paga":
        setAviso("ja-paga");
        router.refresh();
        break;
      case "incerto":
        setAviso("incerto");
        router.refresh();
        break;
      case "data":
        setErroData(desfecho.mensagem);
        toast.error(desfecho.mensagem);
        break;
      case "recusado":
        toast.error(desfecho.mensagem);
        break;
    }
  }

  const aberto = fatura !== null;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v && !loading) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {aviso === "ja-paga" ? (
          <>
            <DialogHeader>
              <DialogTitle>Esta fatura já estava paga</DialogTitle>
              <DialogDescription role="status" className="break-words">
                Ela já constava como paga (talvez em outra aba). Nada foi debitado de novo. A
                lista foi atualizada.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Entendi</Button>
            </DialogFooter>
          </>
        ) : aviso === "incerto" ? (
          <>
            <DialogHeader>
              <DialogTitle>Não deu para confirmar o pagamento</DialogTitle>
              <DialogDescription role="status" className="break-words">
                A resposta não chegou. A lista foi recarregada: se a fatura aparecer como paga,
                deu certo. Tentar de novo é seguro — o sistema não paga a mesma fatura duas
                vezes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Fechar
              </Button>
              <Button onClick={enviar} disabled={loading || !contaId || !data}>
                {loading ? "Pagando…" : "Tentar de novo"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="break-words">{exibida?.titulo ?? "Pagar fatura"}</DialogTitle>
              <DialogDescription>
                Debita {formatCurrency(exibida?.totalReais ?? 0)} da conta escolhida. O pagamento
                entra como transferência (não conta como nova despesa).
              </DialogDescription>
            </DialogHeader>
            {exibida && (
              <dl className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="min-w-0 text-muted-foreground">Total da fatura</dt>
                  <dd className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(exibida.totalReais)}
                  </dd>
                </div>
                {exibida.terceirosReais !== 0 && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <dt className="min-w-0 text-muted-foreground">Minha parte · terceiros</dt>
                    <dd className="shrink-0 tabular-nums">
                      {formatCurrency(exibida.meuReais)} · {formatCurrency(exibida.terceirosReais)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 text-xs">
                  <dt className="min-w-0 text-muted-foreground">Vencimento</dt>
                  <dd className="shrink-0 tabular-nums">{formatDate(exibida.vencimento)}</dd>
                </div>
              </dl>
            )}
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta cadastrada.{" "}
                <Link href="/financeiro/contas" className="underline">
                  Cadastre uma conta
                </Link>{" "}
                para pagar a fatura.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Debitar da conta</Label>
                  <Select value={contaId} onValueChange={setContaId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fatura-data-pagamento">Data do pagamento</Label>
                  <Input
                    id="fatura-data-pagamento"
                    type="date"
                    max={today}
                    value={data}
                    aria-invalid={erroData ? true : undefined}
                    aria-describedby={erroData ? "fatura-data-pagamento-erro" : undefined}
                    onChange={(e) => {
                      setData(e.target.value);
                      setErroData(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a data em que o valor saiu da conta, para bater com o extrato.
                  </p>
                  {erroData && (
                    <p id="fatura-data-pagamento-erro" className="text-xs text-destructive">
                      {erroData}
                    </p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button
                onClick={enviar}
                disabled={loading || !contaId || !data || accounts.length === 0}
              >
                {loading ? "Pagando…" : `Pagar ${formatCurrency(exibida?.totalReais ?? 0)}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

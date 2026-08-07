"use client";

/**
 * Divisão de uma compra parcelada JÁ CRIADA — trocar o terceiro, refazer as partes ou remover
 * a divisão. Usa o MESMO editor do lançamento à vista e da revisão de importação, e o mesmo
 * núcleo no servidor (`reapplySplit`), então a regra não pode divergir entre as telas.
 *
 * A base divisível é a soma das parcelas ATIVAS, que difere do total contratado quando há
 * parcela cancelada — por isso ela é declarada na tela em vez de suposta pelo usuário.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SplitEditor,
  usableSplitParts,
  type PersonOption,
  type SplitPartValue,
} from "@/components/financeiro/split-editor";
import {
  getTransactionSplit,
} from "@/lib/actions/transactions";
import { updateInstallmentSplit } from "@/lib/actions/installments";
import { formatCurrency } from "@/lib/format";
import type { Classificacao } from "@/lib/finance/constants";

export function InstallmentSplitDialog({
  parentId,
  descricao,
  classificacao: initialClassificacao,
  totalAtivoReais,
  valorTotalReais,
  qtdParcelasAtivas,
  people,
  trigger,
}: {
  parentId: string;
  descricao: string;
  classificacao: Classificacao;
  /** Soma das parcelas ATIVAS — a base que o servidor vai dividir. */
  totalAtivoReais: number;
  /** Total contratado da compra. Difere do anterior quando há parcela cancelada. */
  valorTotalReais: number;
  qtdParcelasAtivas: number;
  people: PersonOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [classificacao, setClassificacao] =
    React.useState<Classificacao>(initialClassificacao);
  const [parts, setParts] = React.useState<SplitPartValue[]>([]);

  // Abrir recomeça do estado gravado e busca as partes. A leitura acontece no handler, não
  // num efeito: o projeto proíbe setState síncrono dentro de useEffect (cascading renders), e
  // é o mesmo caminho do diálogo de divisão da importação.
  //
  // A compra parcelada É uma transação, então `getTransactionSplit` serve aqui sem código
  // novo. `loadId` descarta a resposta de uma abertura anterior que chegue atrasada.
  const loadId = React.useRef(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    const id = ++loadId.current;
    setClassificacao(initialClassificacao);
    setParts([]);
    if (initialClassificacao === "pessoal") {
      setLoading(false);
      return;
    }
    setLoading(true);
    getTransactionSplit(parentId)
      .then((res) => {
        if (id !== loadId.current || !res.ok) return;
        setClassificacao(res.data.classificacao);
        setParts(res.data.parts);
      })
      .finally(() => {
        if (id === loadId.current) setLoading(false);
      });
  }

  const isShared = classificacao !== "pessoal";
  const temParcelaCancelada = valorTotalReais !== totalAtivoReais;

  async function save() {
    setSaving(true);
    try {
      const res = await updateInstallmentSplit(parentId, {
        classificacao,
        parts: isShared
          ? usableSplitParts(parts).map((p) => ({
              person_id: p.person_id,
              tipo: p.tipo,
              valor: p.tipo === "valor" ? p.valor : "",
              percentual: p.tipo === "percentual" ? p.percentual : "",
            }))
          : [],
      });
      if (res.ok) {
        toast.success(
          isShared
            ? "Divisão salva — os recebíveis das parcelas foram refeitos."
            : "Divisão removida do parcelamento.",
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dividir compra parcelada</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {descricao || "Compra parcelada"} ·{" "}
            {formatCurrency(totalAtivoReais)} em {qtdParcelasAtivas} parcela(s)
            ativa(s)
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Carregando a divisão…
          </p>
        ) : (
          <SplitEditor
            classificacao={classificacao}
            onClassificacaoChange={setClassificacao}
            parts={parts}
            onPartsChange={setParts}
            totalReais={totalAtivoReais}
            people={people}
            disabled={saving}
            baseHint={
              <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground ring-1 ring-primary/10">
                A parte de cada pessoa é distribuída entre as{" "}
                {qtdParcelasAtivas} parcela(s) ativa(s), uma cobrança por parcela,
                na fatura de cada uma.
                {temParcelaCancelada && (
                  <>
                    {" "}
                    A base é {formatCurrency(totalAtivoReais)} — o que resta em
                    fatura — e não o total contratado de{" "}
                    {formatCurrency(valorTotalReais)}, porque há parcela
                    cancelada.
                  </>
                )}
              </p>
            }
          />
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="animate-spin" /> : <Users />}
            Salvar divisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

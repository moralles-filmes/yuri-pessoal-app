"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, Loader2 } from "lucide-react";
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
  type SplitPartValue,
} from "@/components/financeiro/split-editor";
import { setImportRowSplit } from "@/lib/actions/imports";
import { formatCurrency } from "@/lib/format";
import type { Classificacao } from "@/lib/finance/constants";
import type { ImportSplitPart } from "@/types/database";

type PersonOption = { id: string; nome: string };

/** Converte as partes gravadas (jsonb) nas strings que os inputs do diálogo usam. */
function partsFromStored(stored: ImportSplitPart[]): SplitPartValue[] {
  return stored.map((p) =>
    p.tipo === "percentual"
      ? {
          person_id: p.person_id,
          tipo: "percentual",
          valor: "",
          percentual: p.percentual != null ? String(p.percentual) : "",
        }
      : {
          person_id: p.person_id,
          tipo: "valor",
          valor: p.valor != null ? String(p.valor).replace(".", ",") : "",
          percentual: "",
        },
  );
}

export function ImportRowSplitDialog({
  rowId,
  descricao,
  valor,
  classificacao: initialClassificacao,
  splitParts,
  people,
  trigger,
}: {
  rowId: string;
  descricao: string;
  valor: number;
  classificacao: Classificacao;
  splitParts: ImportSplitPart[];
  people: PersonOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [classificacao, setClassificacao] =
    React.useState<Classificacao>(initialClassificacao);
  const [parts, setParts] = React.useState<SplitPartValue[]>(() =>
    partsFromStored(splitParts),
  );

  // Reabrir o diálogo recomeça do estado gravado (sem useEffect — evita setState em efeito).
  function handleOpenChange(next: boolean) {
    if (next) {
      setClassificacao(initialClassificacao);
      setParts(partsFromStored(splitParts));
    }
    setOpen(next);
  }

  const isShared = classificacao !== "pessoal";

  async function save() {
    setSaving(true);
    try {
      const res = await setImportRowSplit(rowId, {
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
          isShared ? "Divisão salva nesta linha." : "Divisão removida.",
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
          <DialogTitle>Dividir lançamento</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {descricao || "Lançamento"} · {formatCurrency(valor)}
          </DialogDescription>
        </DialogHeader>

        <SplitEditor
          classificacao={classificacao}
          onClassificacaoChange={setClassificacao}
          parts={parts}
          onPartsChange={setParts}
          totalReais={valor}
          people={people}
          disabled={saving}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Users />}
            Salvar divisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

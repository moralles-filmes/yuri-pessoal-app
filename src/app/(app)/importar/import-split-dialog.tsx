"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/financeiro/money-input";
import { setImportRowSplit } from "@/lib/actions/imports";
import {
  centavosParaReais,
  formatCurrency,
  parseCurrencyToNumber,
  reaisParaCentavos,
} from "@/lib/format";
import { dividirDespesa, type ParteDivisao } from "@/lib/finance/split";
import {
  CLASSIFICACAO_LABELS,
  CLASSIFICACOES,
  SPLIT_TYPE_LABELS,
  SPLIT_TYPES,
  type Classificacao,
  type SplitType,
} from "@/lib/finance/constants";
import type { ImportSplitPart } from "@/types/database";

type PersonOption = { id: string; nome: string };
type PartValue = {
  person_id: string;
  tipo: SplitType;
  valor: string;
  percentual: string;
};

/** Converte as partes gravadas (jsonb) nas strings que os inputs do diálogo usam. */
function partsFromStored(stored: ImportSplitPart[]): PartValue[] {
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
  const [parts, setParts] = React.useState<PartValue[]>(() =>
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
  const nomePessoa = (id: string) =>
    people.find((p) => p.id === id)?.nome ?? "Pessoa";

  // Preview reativo (lógica pura, igual ao servidor).
  let preview: {
    minhaParteCentavos: number;
    partesTerceiros: { personId: string; valorCentavos: number }[];
  } | null = null;
  let previewError = false;
  if (isShared) {
    const totalCentavos = reaisParaCentavos(valor);
    const partes: ParteDivisao[] = parts
      .filter((p) => p.person_id)
      .map((p) =>
        p.tipo === "valor"
          ? {
              personId: p.person_id,
              tipo: "valor",
              valorCentavos: reaisParaCentavos(parseCurrencyToNumber(p.valor)),
            }
          : {
              personId: p.person_id,
              tipo: "percentual",
              percentual: parseCurrencyToNumber(p.percentual),
            },
      );
    if (totalCentavos > 0 && partes.length > 0) {
      try {
        preview = dividirDespesa(totalCentavos, partes);
      } catch {
        previewError = true;
      }
    }
  }

  function setClassif(v: Classificacao) {
    setClassificacao(v);
    if (v === "pessoal") setParts([]);
    else if (parts.length === 0)
      setParts([{ person_id: "", tipo: "valor", valor: "", percentual: "" }]);
  }

  function updatePart(idx: number, patch: Partial<PartValue>) {
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await setImportRowSplit(rowId, {
        classificacao,
        parts: isShared
          ? parts
              .filter((p) => p.person_id)
              .map((p) => ({
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Classificação</Label>
            <Select
              value={classificacao}
              onValueChange={(v) => setClassif(v as Classificacao)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICACOES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CLASSIFICACAO_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sua parte real é o que sobra depois dos terceiros — valores de
              terceiros não entram no seu gasto pessoal.
            </p>
          </div>

          {isShared &&
            (people.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma pessoa cadastrada. Cadastre em A Receber → Pessoas.
              </p>
            ) : (
              <div className="space-y-3">
                {parts.map((p, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">Pessoa</Label>
                      <Select
                        value={p.person_id}
                        onValueChange={(v) => updatePart(idx, { person_id: v })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {people.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={p.tipo}
                        onValueChange={(v) =>
                          updatePart(idx, { tipo: v as SplitType })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SPLIT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {SPLIT_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {p.tipo === "valor" ? "Valor" : "%"}
                      </Label>
                      {p.tipo === "valor" ? (
                        <MoneyInput
                          value={p.valor}
                          onValueChange={(v) => updatePart(idx, { valor: v })}
                        />
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          inputMode="decimal"
                          value={p.percentual}
                          onChange={(e) =>
                            updatePart(idx, { percentual: e.target.value })
                          }
                        />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover pessoa"
                      onClick={() =>
                        setParts((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setParts((prev) => [
                      ...prev,
                      { person_id: "", tipo: "valor", valor: "", percentual: "" },
                    ])
                  }
                >
                  <Plus /> Adicionar pessoa
                </Button>

                {previewError && (
                  <p className="text-xs text-destructive">
                    A divisão não fecha: a soma dos terceiros passou do total ou
                    os percentuais somam mais de 100%.
                  </p>
                )}

                {preview && (
                  <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Minha parte</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {formatCurrency(
                          centavosParaReais(preview.minhaParteCentavos),
                        )}
                      </span>
                    </div>
                    {preview.partesTerceiros.map((t) => (
                      <div
                        key={t.personId}
                        className="flex items-center justify-between text-muted-foreground"
                      >
                        <span className="truncate">{nomePessoa(t.personId)}</span>
                        <span className="tabular-nums">
                          {formatCurrency(centavosParaReais(t.valorCentavos))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>

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

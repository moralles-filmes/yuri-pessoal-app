"use client";

/**
 * Editor de divisão de despesa (Fase 05) — classificação, partes por pessoa e o preview
 * reativo de "minha parte × cada terceiro".
 *
 * COMPONENTE CONTROLADO, de propósito. O bloco nasceu duplicado em `transaction-form.tsx`
 * (react-hook-form) e em `import-split-dialog.tsx` (estado local), e ganhou um terceiro
 * chamador em /parcelamentos. Três cópias do mesmo formulário divergem — e divergir aqui
 * significa a mesma divisão ser oferecida de jeitos diferentes conforme a tela. Recebendo
 * `value`/`onChange`, ele serve tanto o RHF (via Controller) quanto um `useState`.
 *
 * O preview usa `dividirDespesa` — a MESMA função pura que o servidor roda antes de gravar.
 */
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { MoneyInput } from "@/components/financeiro/money-input";
import { centavosParaReais, formatCurrency, parseCurrencyToNumber, reaisParaCentavos } from "@/lib/format";
import { dividirDespesa, type ParteDivisao } from "@/lib/finance/split";
import {
  CLASSIFICACAO_LABELS,
  CLASSIFICACOES,
  SPLIT_TYPE_LABELS,
  SPLIT_TYPES,
  type Classificacao,
  type SplitType,
} from "@/lib/finance/constants";

export type SplitPartValue = {
  person_id: string;
  tipo: SplitType;
  valor: string;
  percentual: string;
};

export type PersonOption = { id: string; nome: string };

/** Uma linha em branco — o que "Adicionar pessoa" acrescenta. */
export function emptySplitPart(): SplitPartValue {
  return { person_id: "", tipo: "valor", valor: "", percentual: "" };
}

/** Só as partes com pessoa escolhida (o que vai ao servidor). */
export function usableSplitParts(parts: SplitPartValue[]): SplitPartValue[] {
  return parts.filter((p) => p.person_id);
}

export function SplitEditor({
  classificacao,
  onClassificacaoChange,
  parts,
  onPartsChange,
  totalReais,
  people,
  baseHint,
  disabled,
}: {
  classificacao: Classificacao;
  onClassificacaoChange: (value: Classificacao) => void;
  parts: SplitPartValue[];
  onPartsChange: (parts: SplitPartValue[]) => void;
  /** Base da divisão em reais. O preview só aparece quando ela é > 0. */
  totalReais: number;
  people: PersonOption[];
  /** Explicação opcional da base (ex.: "soma das parcelas ativas"), quando não é óbvia. */
  baseHint?: React.ReactNode;
  disabled?: boolean;
}) {
  const isShared = classificacao !== "pessoal";
  const nomePessoa = (id: string) =>
    people.find((p) => p.id === id)?.nome ?? "Pessoa";

  // Preview reativo. Sem useMemo: o React Compiler do projeto memoiza automaticamente.
  let preview: {
    minhaParteCentavos: number;
    partesTerceiros: { personId: string; valorCentavos: number }[];
  } | null = null;
  let previewError = false;
  if (isShared) {
    const totalCentavos = reaisParaCentavos(totalReais);
    const partes: ParteDivisao[] = usableSplitParts(parts).map((p) =>
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

  function handleClassificacao(value: Classificacao) {
    onClassificacaoChange(value);
    if (value === "pessoal") onPartsChange([]);
    else if (parts.length === 0) onPartsChange([emptySplitPart()]);
  }

  function updatePart(idx: number, patch: Partial<SplitPartValue>) {
    onPartsChange(parts.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Classificação</Label>
        <Select
          value={classificacao}
          onValueChange={(v) => handleClassificacao(v as Classificacao)}
          disabled={disabled}
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
          Sua parte real é o que sobra depois dos terceiros — valores de terceiros
          não entram no seu gasto pessoal.
        </p>
        {isShared && baseHint}
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
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">Pessoa</Label>
                  <Select
                    value={p.person_id}
                    onValueChange={(v) => updatePart(idx, { person_id: v })}
                    disabled={disabled}
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
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select
                    value={p.tipo}
                    onValueChange={(v) => updatePart(idx, { tipo: v as SplitType })}
                    disabled={disabled}
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
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">
                    {p.tipo === "valor" ? "Valor" : "%"}
                  </Label>
                  {p.tipo === "valor" ? (
                    <MoneyInput
                      value={p.valor}
                      onValueChange={(v) => updatePart(idx, { valor: v })}
                      disabled={disabled}
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
                      disabled={disabled}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover pessoa"
                  disabled={disabled}
                  onClick={() =>
                    onPartsChange(parts.filter((_, i) => i !== idx))
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
              disabled={disabled}
              onClick={() => onPartsChange([...parts, emptySplitPart()])}
            >
              <Plus /> Adicionar pessoa
            </Button>

            {previewError && (
              <p className="text-xs text-destructive">
                A divisão não fecha: a soma dos terceiros passou do total ou os
                percentuais somam mais de 100%.
              </p>
            )}

            {preview && (
              <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">Minha parte</span>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">
                    {formatCurrency(centavosParaReais(preview.minhaParteCentavos))}
                  </span>
                </div>
                {preview.partesTerceiros.map((t) => (
                  <div
                    key={t.personId}
                    className="flex items-center justify-between gap-2 text-muted-foreground"
                  >
                    <span className="min-w-0 truncate">
                      {nomePessoa(t.personId)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrency(centavosParaReais(t.valorCentavos))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

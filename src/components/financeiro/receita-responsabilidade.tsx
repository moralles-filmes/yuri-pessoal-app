"use client";

import { MoneyInput } from "@/components/financeiro/money-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLASSIFICACOES,
  CLASSIFICACAO_LABELS,
  type Classificacao,
} from "@/lib/finance/constants";
import { decidirResponsabilidadeDaReceita } from "@/lib/finance/responsabilidade-da-receita";
import {
  centavosParaReais,
  formatCurrency,
  parseCurrencyToNumber,
  reaisParaCentavos,
} from "@/lib/format";

/**
 * Editor controlado: receita não usa a máquina de divisão (sem pessoa, sem recebível).
 * A prévia usa decidirResponsabilidadeDaReceita, a MESMA função que o servidor roda
 * antes de gravar. A categoria não decide nada (D8).
 */
export function ReceitaResponsabilidadeEditor({
  classificacao,
  onClassificacaoChange,
  minhaParte,
  onMinhaParteChange,
  totalReais,
  erroMinhaParte,
  disabled,
  dica,
}: {
  classificacao: Classificacao;
  onClassificacaoChange: (v: Classificacao) => void;
  minhaParte: string;
  onMinhaParteChange: (v: string) => void;
  totalReais: number;
  erroMinhaParte?: string;
  disabled?: boolean;
  dica?: string;
}) {
  const decisao = decidirResponsabilidadeDaReceita({
    classificacao,
    minhaParteCentavos: minhaParte.trim()
      ? reaisParaCentavos(parseCurrencyToNumber(minhaParte))
      : null,
    valorCentavos: reaisParaCentavos(totalReais),
  });

  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="tx-receita-classificacao">De quem é esta entrada?</Label>
        <Select
          value={classificacao}
          onValueChange={(v) => {
            onClassificacaoChange(v as Classificacao);
            if (v !== "compartilhada") onMinhaParteChange("");
          }}
          disabled={disabled}
        >
          <SelectTrigger id="tx-receita-classificacao" className="w-full">
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
        {dica && <p className="text-xs font-medium text-primary">{dica}</p>}
        <p className="text-xs text-muted-foreground">
          Pessoal entra na sua renda. O que é de terceiros passa pela sua conta,
          mas não é renda sua.
        </p>
      </div>

      {classificacao === "compartilhada" && (
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="tx-receita-minha-parte">Minha parte</Label>
          <MoneyInput
            id="tx-receita-minha-parte"
            value={minhaParte}
            onValueChange={onMinhaParteChange}
            disabled={disabled}
            aria-invalid={Boolean(erroMinhaParte)}
          />
          {erroMinhaParte && (
            <p className="text-xs text-destructive">{erroMinhaParte}</p>
          )}
        </div>
      )}

      {totalReais > 0 && (
        decisao.ok ? (
          classificacao !== "pessoal" && (
            <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">Minha parte</span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">
                  {formatCurrency(centavosParaReais(decisao.responsabilidade.valorPessoalCentavos ?? 0))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="min-w-0 truncate">De terceiros</span>
                <span className="shrink-0 tabular-nums">
                  {formatCurrency(centavosParaReais(decisao.terceirosCentavos))}
                </span>
              </div>
            </div>
          )
        ) : (
          classificacao === "compartilhada" && minhaParte.trim() && !erroMinhaParte && (
            <p className="text-xs text-destructive">{decisao.mensagem}</p>
          )
        )
      )}
    </div>
  );
}

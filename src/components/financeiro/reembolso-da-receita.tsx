"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lerPreviaDoReembolso } from "@/lib/actions/transactions";
import {
  frasesDoReembolso,
  type EscolhaDaSobra,
  type PreviaDoReembolso,
  type previaDoReembolso,
} from "@/lib/finance/reembolso";
import { centavosParaReais, formatCurrency } from "@/lib/format";
import { MATERIAL_LADRILHO } from "@/components/ui/materiais";

const NENHUMA = "none";

/** O que a prévia precisa da pessoa — tudo o que `previaDoReembolso` pede, menos o valor digitado. */
export type EntradaDaPessoa = Omit<Parameters<typeof previaDoReembolso>[0], "valorCentavos">;

export type SituacaoDoReembolso =
  | { estado: "ocioso" }
  | { estado: "carregando" }
  | { estado: "erro"; mensagem: string }
  | { estado: "ok"; dados: EntradaDaPessoa };

type Lida = { chave: string; resultado: { dados: EntradaDaPessoa } | { erro: string } };

/**
 * Lê UMA vez por pessoa (e por lançamento em edição) o que ela deve; a prévia é recalculada na
 * tela a cada valor digitado, sem nova ida ao servidor. `ativo` falso (diálogo fechado, tipo que
 * não é receita de terceiro) não lê nada. `versao` força nova leitura depois de uma recusa do
 * servidor por dívida que mudou.
 */
export function useSituacaoDoReembolso(a: {
  ativo: boolean;
  pessoaId: string;
  transactionId: string | null;
  versao: number;
}): SituacaoDoReembolso {
  const { ativo, pessoaId, transactionId, versao } = a;
  const chave = ativo && pessoaId ? `${pessoaId}|${transactionId ?? ""}|${versao}` : "";
  const [lida, setLida] = React.useState<Lida | null>(null);

  React.useEffect(() => {
    if (!chave) return;
    let vivo = true;
    lerPreviaDoReembolso({ pessoaId, transactionId })
      .then((res) => {
        if (!vivo) return;
        setLida({ chave, resultado: res.ok ? { dados: res.data } : { erro: res.error } });
      })
      // Falha inesperada (rede, erro que a action relança): sem isto o estado ficaria em
      // "carregando" e o Salvar desabilitado, sem frase nenhuma (revisão final, P3).
      .catch(() => {
        if (!vivo) return;
        setLida({ chave, resultado: { erro: "Não foi possível ler o que esta pessoa deve. Feche e abra de novo." } });
      });
    return () => {
      vivo = false;
    };
  }, [chave, pessoaId, transactionId]);

  if (!chave) return { estado: "ocioso" };
  if (!lida || lida.chave !== chave) return { estado: "carregando" };
  return "erro" in lida.resultado
    ? { estado: "erro", mensagem: lida.resultado.erro }
    : { estado: "ok", dados: lida.resultado.dados };
}

const brl = (centavos: number): string => formatCurrency(centavosParaReais(centavos));

/**
 * "De quem?" numa receita de terceiro (04-C). Apresentação pura: a prévia vem pronta de
 * `previaDoReembolso` (a MESMA regra que o servidor roda antes de gravar) e as frases, de
 * `frasesDoReembolso`. A pergunta da sobra NÃO tem opção padrão — sem escolha, o formulário
 * não salva.
 */
export function ReembolsoDaReceita({
  people,
  pessoaId,
  onPessoaChange,
  sobra,
  onSobraChange,
  situacao,
  previa,
  valorCentavos,
  pendente,
  erroPessoa,
  erroSobra,
  disabled,
}: {
  people: { id: string; nome: string }[];
  /** '' = ninguém. */
  pessoaId: string;
  onPessoaChange: (id: string) => void;
  /** '' = ainda sem escolha. */
  sobra: "" | EscolhaDaSobra;
  onSobraChange: (v: EscolhaDaSobra) => void;
  situacao: SituacaoDoReembolso;
  previa: PreviaDoReembolso | null;
  valorCentavos: number;
  /** Receita ainda não recebida: não abate até ser marcada como recebida. */
  pendente: boolean;
  erroPessoa?: string;
  erroSobra?: string;
  disabled?: boolean;
}) {
  const grupo = React.useId();
  const nome = people.find((p) => p.id === pessoaId)?.nome ?? "Esta pessoa";
  const frases = previa ? frasesDoReembolso({ nome, previa, valorCentavos, pendente }) : null;

  return (
    <div className={`${MATERIAL_LADRILHO} min-w-0 space-y-3 rounded-[14px] p-3`}>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="tx-reembolso-pessoa">De quem?</Label>
        <Select
          value={pessoaId || NENHUMA}
          onValueChange={(v) => onPessoaChange(v === NENHUMA ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger
            id="tx-reembolso-pessoa"
            className="w-full"
            aria-invalid={Boolean(erroPessoa)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NENHUMA}>Ninguém em especial (não abate nada)</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erroPessoa ? (
          <p className="text-xs text-destructive">{erroPessoa}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Se alguém está te reembolsando, escolha quem: o valor abate o que a pessoa deve.
          </p>
        )}
      </div>

      {pessoaId && situacao.estado === "carregando" && (
        <p className="text-xs text-muted-foreground">Lendo o que {nome} deve…</p>
      )}

      {pessoaId && situacao.estado === "erro" && (
        <p className="text-xs text-destructive">{situacao.mensagem}</p>
      )}

      {pessoaId && previa && valorCentavos <= 0 && (
        <p className="text-xs text-muted-foreground">
          {nome} deve {brl(previa.devidoAntesCentavos)}. Informe o valor para ver a prévia.
        </p>
      )}

      {pessoaId && previa && frases && valorCentavos > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
          <p className="min-w-0 font-medium text-foreground">{frases.resumo}</p>
          {frases.foraDaRenda && <p className="min-w-0 text-muted-foreground">{frases.foraDaRenda}</p>}
        </div>
      )}

      {pessoaId && frases?.sobra && valorCentavos > 0 && (
        <fieldset className="min-w-0 space-y-2" aria-invalid={Boolean(erroSobra)}>
          <legend className="text-xs font-medium text-foreground">{frases.sobra}</legend>
          {(
            [
              { valor: "receita", titulo: "Receita minha", texto: frases.opcaoReceita },
              { valor: "saldo", titulo: `Saldo a favor de ${nome}`, texto: frases.opcaoSaldo },
            ] as const
          ).map((o) => (
            <label
              key={o.valor}
              className={`${MATERIAL_LADRILHO} flex cursor-pointer items-start gap-2 rounded-[14px] p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5`}
            >
              <input
                type="radio"
                name={grupo}
                value={o.valor}
                checked={sobra === o.valor}
                onChange={() => onSobraChange(o.valor)}
                disabled={disabled}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{o.titulo}</span>
                <span className="block text-xs text-muted-foreground">{o.texto}</span>
              </span>
            </label>
          ))}
          {erroSobra ? (
            <p className="text-xs text-destructive">{erroSobra}</p>
          ) : (
            !sobra && (
              <p className="text-xs text-muted-foreground">
                Escolha o que fazer com a sobra para salvar.
              </p>
            )
          )}
        </fieldset>
      )}

      {/* Recusa do servidor sem sobra a perguntar (ex.: a dívida mudou): o texto não some. */}
      {erroSobra && !(pessoaId && frases?.sobra && valorCentavos > 0) && (
        <p className="text-xs text-destructive">{erroSobra}</p>
      )}
    </div>
  );
}

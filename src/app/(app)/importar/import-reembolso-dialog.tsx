"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Loader2 } from "lucide-react";
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
  ReembolsoDaReceita,
  type SituacaoDoReembolso,
} from "@/components/financeiro/reembolso-da-receita";
import { setImportRowReembolso } from "@/lib/actions/imports";
import { MSG_ESCOLHA_A_SOBRA, type EscolhaDaSobra } from "@/lib/finance/reembolso";
import { formatCurrency, reaisParaCentavos } from "@/lib/format";
import {
  previasDoReembolsoNoLote,
  type LinhaDoReembolso,
  type SituacaoDaPessoa,
} from "@/lib/import/reembolso-do-lote";

type PersonOption = { id: string; nome: string };

const FRASE_SEM_LEITURA = "Não foi possível ler o que as pessoas devem.";

/**
 * Reembolso de UMA linha de entrada do extrato (04-C · T7). Só guarda a escolha — o `commitImport`
 * grava pelo caminho do formulário e refaz a conta no servidor. A prévia aqui vem do MESMO motor
 * (`previaDoLote`): a linha considera as OUTRAS linhas do lote que são da mesma pessoa e vêm antes
 * dela no arquivo, e a pessoa escolhida no diálogo substitui a gravada para esta linha.
 */
export function ImportRowReembolsoDialog({
  rowId,
  descricao,
  valor,
  ordem,
  classificacao: classificacaoGravada,
  pessoaId: pessoaGravada,
  sobra: sobraGravada,
  people,
  situacoes,
  outrasLinhas,
  trigger,
}: {
  rowId: string;
  descricao: string;
  /** Reais, como a linha guarda. */
  valor: number;
  /** `linha_index` da linha: é a ordem em que o commit grava. */
  ordem: number;
  classificacao: "pessoal" | "terceiro";
  pessoaId: string | null;
  sobra: EscolhaDaSobra | null;
  people: PersonOption[];
  /** O que cada pessoa deve. `null` = a leitura falhou: sem prévia, com a frase dizendo isso. */
  situacoes: Record<string, SituacaoDaPessoa> | null;
  /** As demais linhas do lote que entram na sequência (com pessoa). */
  outrasLinhas: LinhaDoReembolso[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [classificacao, setClassificacao] = React.useState(classificacaoGravada);
  const [pessoa, setPessoa] = React.useState(pessoaGravada ?? "");
  const [sobra, setSobra] = React.useState<"" | EscolhaDaSobra>(sobraGravada ?? "");

  // Reabrir o diálogo recomeça do estado gravado (sem useEffect — evita setState em efeito).
  function handleOpenChange(next: boolean) {
    if (next) {
      setClassificacao(classificacaoGravada);
      setPessoa(pessoaGravada ?? "");
      setSobra(sobraGravada ?? "");
    }
    setOpen(next);
  }

  const deTerceiro = classificacao === "terceiro";
  const valorCentavos = reaisParaCentavos(valor);
  const previa =
    deTerceiro && pessoa && situacoes
      ? (previasDoReembolsoNoLote(
          [...outrasLinhas, { id: rowId, valorCentavos, pessoaId: pessoa, ordem }],
          situacoes,
        ).get(rowId) ?? null)
      : null;
  const situacao: SituacaoDoReembolso = !situacoes
    ? { estado: "erro", mensagem: FRASE_SEM_LEITURA }
    : {
        estado: "ok",
        dados: {
          devidoCentavos: situacoes[pessoa]?.devidoCentavos ?? 0,
          saldoAFavorCentavos: situacoes[pessoa]?.saldoAFavorCentavos ?? 0,
          parteAtualDestaCentavos: 0,
          alocadoDestaCentavos: 0,
        },
      };
  // Passa do que a pessoa deve e o dono ainda não disse o que fazer com a sobra: não salva.
  const faltaEscolher = deTerceiro && Boolean(pessoa) && (previa?.sobraCentavos ?? 0) > 0 && sobra === "";

  async function save() {
    setSaving(true);
    try {
      const res = await setImportRowReembolso(rowId, {
        receita_classificacao: classificacao,
        reembolso_pessoa_id: deTerceiro ? pessoa : "",
        // Sem sobra a perguntar, a escolha antiga não vale mais.
        reembolso_sobra: deTerceiro && pessoa && previa?.sobraCentavos !== 0 ? sobra : "",
      });
      if (res.ok) {
        toast.success(
          deTerceiro && pessoa ? "Reembolso salvo nesta linha." : "Entrada marcada como sua.",
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
          <DialogTitle>Reembolso</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {descricao || "Entrada"} · {formatCurrency(valor)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <div
            role="radiogroup"
            aria-label="De quem é esta entrada"
            className="grid grid-cols-2 gap-2"
          >
            {(
              [
                { valor: "pessoal", titulo: "Pessoal" },
                { valor: "terceiro", titulo: "De terceiro" },
              ] as const
            ).map((o) => (
              <Button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={classificacao === o.valor}
                variant={classificacao === o.valor ? "default" : "outline"}
                disabled={saving}
                onClick={() => setClassificacao(o.valor)}
                className="min-w-0 truncate"
              >
                {o.titulo}
              </Button>
            ))}
          </div>

          {deTerceiro ? (
            <ReembolsoDaReceita
              people={people}
              pessoaId={pessoa}
              onPessoaChange={(id) => {
                setPessoa(id);
                // A escolha da sobra é sobre a situação DESTA pessoa: trocar de pessoa a desfaz.
                setSobra("");
              }}
              sobra={sobra}
              onSobraChange={setSobra}
              situacao={situacao}
              previa={previa}
              valorCentavos={valorCentavos}
              pendente={false}
              erroSobra={faltaEscolher ? MSG_ESCOLHA_A_SOBRA : undefined}
              disabled={saving}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Entrada sua: não abate o que ninguém deve.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving || faltaEscolher}>
            {saving ? <Loader2 className="animate-spin" /> : <HandCoins />}
            Salvar reembolso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

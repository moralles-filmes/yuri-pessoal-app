"use client";

/**
 * Fase 18-F · Bloco 1 — IA · Apagar dados.
 *
 * ⛔ NÃO HÁ RETENÇÃO AUTOMÁTICA. Nada some sozinho: descartar é clique do dono. Este card é
 * a única porta de exclusão em massa do módulo.
 *
 * ⛔ O QUE PERMANECE E O QUE SAI JUNTO APARECEM ANTES DE CONFIRMAR, na própria tela, e não
 * atrás de um "saiba mais". `ai_action_executions` não tem FK para conversa (invariante 38)
 * justamente para sobreviver a esta exclusão; e apagar conversa leva junto a medição de
 * custo delas. Esconder qualquer um dos dois daria uma tela mais limpa e uma auditoria
 * mentirosa.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { apagarDadosDaIa, contarDadosDaIa } from "@/lib/actions/ai-retention";
import {
  ESCOPOS_DE_EXCLUSAO,
  oQuePermanece,
  oQueTambemSai,
  resumoDaExclusao,
  type EscopoDeExclusao,
} from "@/lib/ai/retention";

const ROTULO: Record<EscopoDeExclusao, string> = {
  conversas: "Todas as conversas",
  conversas_antigas: "Conversas anteriores a uma data",
  documentos: "Comprovantes enviados",
  insights: "Análises geradas",
};

export function RetentionCard() {
  const router = useRouter();
  const [escopo, setEscopo] = React.useState<EscopoDeExclusao>("conversas_antigas");
  const [anteriorA, setAnteriorA] = React.useState("");
  const [aberto, setAberto] = React.useState(false);
  const [contando, setContando] = React.useState(false);
  const [quantidade, setQuantidade] = React.useState<number | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  // `useLazyDialog`: monta na primeira abertura e não desmonta. `{aberto && <Dialog/>}`
  // sozinho quebraria a animação de fechamento do Radix.
  const montado = useLazyDialog(aberto);

  const semData = escopo === "conversas_antigas" && !anteriorA;
  const alvo = {
    escopo,
    anteriorA: escopo === "conversas_antigas" ? anteriorA || null : null,
  };

  /**
   * A contagem é pedida ao servidor ao abrir, pelo MESMO seletor que a exclusão usa. Um
   * número montado no cliente prometeria uma coisa e o banco executaria outra.
   */
  async function abrir() {
    setQuantidade(null);
    setAberto(true);
    setContando(true);
    const r = await contarDadosDaIa(alvo);
    setContando(false);
    if (r.ok) setQuantidade(r.data.quantidade);
    else toast.error(r.error);
  }

  async function confirmar() {
    setEnviando(true);
    const r = await apagarDadosDaIa({ ...alvo, confirmar: true });
    setEnviando(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setAberto(false);
    toast.success(
      r.data.apagados === 0
        ? "Nada foi apagado: não havia registro neste filtro."
        : resumoDaExclusao(escopo, r.data.apagados, "passado"),
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apagar dados da IA</CardTitle>
        <CardDescription>
          Nada é apagado automaticamente — nem conversa antiga, nem comprovante, nem análise.
          O que sai daqui sai porque você pediu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="escopo-exclusao">O que apagar</Label>
          <Select
            value={escopo}
            onValueChange={(v) => {
              setEscopo(v as EscopoDeExclusao);
              setQuantidade(null);
            }}
          >
            <SelectTrigger id="escopo-exclusao" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESCOPOS_DE_EXCLUSAO.map((e) => (
                <SelectItem key={e} value={e}>
                  {ROTULO[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {escopo === "conversas_antigas" && (
          <div className="space-y-2">
            <Label htmlFor="anterior-a">Apagar o que for anterior a</Label>
            <Input
              id="anterior-a"
              type="date"
              value={anteriorA}
              onChange={(e) => setAnteriorA(e.target.value)}
            />
          </div>
        )}

        {/* Densidade pela largura DO CARD, não da viewport (regra 4 do layout). */}
        <div className="@container">
          <div className="grid gap-3 @md:grid-cols-2">
            <div className="min-w-0 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">O que permanece</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {oQuePermanece(escopo).map((linha) => (
                  <li key={linha} className="min-w-0">
                    {linha}
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4 shrink-0 text-amber-500" />
                <span className="min-w-0">O que sai junto</span>
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {oQueTambemSai(escopo).map((linha) => (
                  <li key={linha} className="min-w-0">
                    {linha}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <Button variant="destructive" onClick={abrir} disabled={semData}>
          <Trash2 className="size-4" />
          Apagar…
        </Button>
        {semData && (
          <p className="text-xs text-muted-foreground">
            Escolha a data de corte para continuar.
          </p>
        )}

        {montado && (
          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>{ROTULO[escopo]}</DialogTitle>
                <DialogDescription>
                  {contando
                    ? "Conferindo quantos registros estão neste filtro…"
                    : quantidade === null
                      ? "Não foi possível conferir a quantidade."
                      : `${resumoDaExclusao(escopo, quantidade)} Esta ação não pode ser desfeita.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAberto(false)}
                  disabled={enviando}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmar}
                  disabled={enviando || contando || quantidade === null || quantidade === 0}
                >
                  {enviando ? "Apagando…" : "Apagar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * REDESIGN-03-E · T4b — O bloco do caixa na tela (§5.4; K2, K4).
 *
 * Componente de APRESENTAÇÃO: sem "use client" e sem import de runtime do motor (`@/lib/finance/
 * caixa` / `caixa-leitura`) — só `import type`. Cada número declara a própria base (K2) e as
 * ENTRADAS ficam em TRÊS linhas separadas, nunca somadas num número único (K4).
 *
 * ⛔ Falha de leitura NUNCA vira zero: com `{ estado: 'erro' }` a tela diz que não leu.
 */
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";

function Linha({ rotulo, valor, secundaria }: { rotulo: string; valor: number; secundaria?: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm break-words text-muted-foreground">{rotulo}</span>
        <span className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(valor)}</span>
      </div>
      {secundaria && <p className="text-xs break-words text-muted-foreground">{secundaria}</p>}
    </div>
  );
}

export function BlocoDoCaixa({ mesRotulo, caixa }: { mesRotulo: string; caixa: EstadoDoCaixa }) {
  if (caixa.estado === "erro") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Caixa realizado · {mesRotulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="min-w-0 text-sm break-words text-muted-foreground">
              Os números de caixa não puderam ser lidos agora. Nada aqui é zero — tente recarregar.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const n = caixa.atual;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caixa realizado · {mesRotulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ArrowDownLeft className="size-4 shrink-0" />
            <span className="min-w-0 break-words">Entradas</span>
          </div>
          <Linha rotulo="Renda pessoal recebida" valor={n.rendaPessoalRecebida} />
          <Linha rotulo="Reembolsos recebidos" valor={n.reembolsosRecebidos} />
          <Linha rotulo="Outras entradas de terceiros" valor={n.outrasEntradasDeTerceiros} />
        </div>

        <div className="space-y-2.5 border-t pt-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ArrowUpRight className="size-4 shrink-0" />
            <span className="min-w-0 break-words">Saídas</span>
          </div>
          <Linha
            rotulo="Saídas de caixa"
            valor={n.saidasDeCaixa}
            secundaria={
              n.pagamentosDeFatura > 0
                ? `inclui pagamentos de fatura ${formatCurrency(n.pagamentosDeFatura)}`
                : undefined
            }
          />
        </div>

        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Wallet className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 text-sm font-medium break-words">Resultado de caixa</span>
          </div>
          <span className="shrink-0 text-lg font-semibold tracking-tight tabular-nums">
            {formatCurrency(n.resultadoDeCaixa)}
          </span>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {n.aproximados > 0 && (
            <p className="break-words">
              {n.aproximados} lançamento(s) com data aproximada pela competência
            </p>
          )}
          {n.semConta > 0 && (
            <p className="break-words">{n.semConta} lançamento(s) sem conta ficaram fora</p>
          )}
          {n.transferenciasSemVinculo.quantidade > 0 && (
            <p className="break-words">
              {n.transferenciasSemVinculo.quantidade} transferência(s) sem destino e sem vínculo com
              fatura contadas como saída ({formatCurrency(n.transferenciasSemVinculo.total)})
            </p>
          )}
          {n.transferenciasEntreContas > 0 && (
            <p className="break-words">
              Transferências entre suas contas: {formatCurrency(n.transferenciasEntreContas)} — não
              entram no resultado
            </p>
          )}
          {caixa.parcial && (
            <p className="break-words">Leitura parcial: há mais lançamentos do que o teto lido</p>
          )}
        </div>

        <p className="border-t pt-3 text-xs break-words text-muted-foreground">
          Caixa realizado: o que entrou e saiu das contas pela data do pagamento. Compra no cartão sai
          no pagamento da fatura.
        </p>
      </CardContent>
    </Card>
  );
}

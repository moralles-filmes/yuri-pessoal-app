"use client";

/**
 * Fase 18-C · Bloco 4 — IA · O cartão de confirmação. É AQUI QUE O DONO DECIDE.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTA TELA PRECISA GARANTIR, E POR QUÊ                                           ║
 * ║                                                                                       ║
 * ║  • A PREVISÃO É COMPLETA. Campo a campo, com as ressalvas. O dono confirma o que ele  ║
 * ║    leu — e o `hash` que este componente devolve é a prova disso, conferida pela FK     ║
 * ║    composta do banco. Esconder uma linha aqui tornaria a prova falsa.                  ║
 * ║  • O TEXTO DA IA NÃO SUBSTITUI A PREVISÃO. O que aparece nas linhas vem do command,   ║
 * ║    não do modelo. Um resumo escrito pelo modelo poderia descrever outra coisa.         ║
 * ║  • O PRAZO É VISÍVEL. Dez minutos, e a contagem aparece: uma proposta que expira em    ║
 * ║    silêncio faz o dono clicar e receber uma recusa sem entender por quê.               ║
 * ║  • NADA ACONTECEU AINDA, e a tela diz isso com todas as letras.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ Este componente não sabe executar nada. Ele chama a Server Action, que é a única porta
 * do Approval Engine.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  ShieldQuestion,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmarAcaoDaIa, recusarAcaoDaIa } from "@/lib/actions/ai-actions";
import { rotuloDaFerramenta } from "@/lib/ai/constants";

export type PropostaNaTela = {
  readonly id: string;
  readonly effectHash: string;
  readonly expiresAt: string;
  readonly toolName: string;
  /**
   * 18-C · Bloco 5 — o rótulo já resolvido, quando quem monta o cartão sabe nomeá-lo melhor.
   *
   * A proposta de DESFAZER não nasce de ferramenta nenhuma (ela nasce do botão da tela), então
   * `toolName` vale `tela.desfazer` e `rotuloDaFerramenta` cairia no identificador cru. Pôr
   * esse nome no mapa de ferramentas seria pior: há teste — e ele está certo — exigindo que
   * todo rótulo de lá aponte para uma ferramenta REAL do registry.
   */
  readonly rotulo?: string;
  readonly risco: number;
  readonly resumo: string;
  readonly linhas: readonly { readonly rotulo: string; readonly valor: string }[];
  readonly ressalvas: readonly string[];
};

type Desfecho =
  | { readonly tipo: "pendente" }
  | { readonly tipo: "confirmando" }
  | { readonly tipo: "feita"; readonly rota: string | null; readonly parcial: boolean }
  | { readonly tipo: "recusada" }
  | { readonly tipo: "erro"; readonly mensagem: string };

/**
 * Quanto falta, em minutos inteiros. `null` quando já passou.
 *
 * ⚠️ `Date.now()` aqui é o relógio DO NAVEGADOR, e ele pode estar errado. Por isso este
 * número é **informativo e só**: quem decide o prazo é o banco, comparando `expires_at` com
 * `now()` do servidor. A tela pode dizer "faltam 2 min" e o servidor recusar — e é assim
 * mesmo, porque a alternativa (a tela decidir) poria a janela de replay no cliente.
 */
function minutosRestantes(expiresAt: string, agora: number): number | null {
  const fim = new Date(expiresAt).getTime();
  if (Number.isNaN(fim)) return null;
  const restante = fim - agora;
  return restante <= 0 ? null : Math.max(1, Math.ceil(restante / 60_000));
}

export function ProposalCard({
  proposta,
  aoAplicar,
}: {
  readonly proposta: PropostaNaTela;
  /**
   * 18-D — chamado DEPOIS de a execução ter dado certo, com o registro que ela criou.
   *
   * Existe para um caso só: a tela de comprovantes precisa anexar o arquivo ao lançamento
   * recém-criado, e anexo NÃO é efeito financeiro — ele não entra em `changed_fields` (§3.6)
   * e não pode virar responsabilidade do Approval Engine. Por isso a segunda escrita é
   * disparada por quem sabe que existe um arquivo esperando, e não pelo motor de ações.
   */
  readonly aoAplicar?: (registro: {
    readonly targetId: string | null;
    readonly targetRoute: string | null;
  }) => void | Promise<void>;
}) {
  const router = useRouter();
  const [desfecho, setDesfecho] = React.useState<Desfecho>({ tipo: "pendente" });
  const [agora, setAgora] = React.useState<number>(() => Date.now());

  // Um tique por minuto só para a contagem não congelar. Nada aqui decide nada.
  React.useEffect(() => {
    if (desfecho.tipo !== "pendente") return;
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [desfecho.tipo]);

  const restante = minutosRestantes(proposta.expiresAt, agora);
  const expirada = restante === null;

  async function confirmar() {
    setDesfecho({ tipo: "confirmando" });
    const r = await confirmarAcaoDaIa({
      proposalId: proposta.id,
      // ⚠️ O hash que sobe é o que ESTE cartão recebeu junto da previsão que está desenhada
      // acima. Não é recalculado no cliente e não vem de outro lugar da tela.
      hash: proposta.effectHash,
    });

    if (!r.ok) {
      setDesfecho({ tipo: "erro", mensagem: r.error });
      toast.error(r.error);
      return;
    }
    setDesfecho({
      tipo: "feita",
      rota: r.data.targetRoute,
      parcial: r.data.status !== "sucesso",
    });
    if (r.data.status === "sucesso") toast.success("Feito.");
    else toast.warning("A ação foi executada, mas nem tudo deu certo.");

    // ⚠️ Só depois do sucesso, e antes do `refresh`: quem escutar precisa da chance de
    // escrever o que falta (o anexo) antes de a tela reler o servidor.
    if (r.data.status === "sucesso" && aoAplicar) {
      await aoAplicar({ targetId: r.data.targetId, targetRoute: r.data.targetRoute });
    }
    router.refresh();
  }

  async function recusar() {
    setDesfecho({ tipo: "confirmando" });
    const r = await recusarAcaoDaIa({ proposalId: proposta.id, hash: proposta.effectHash });
    if (!r.ok) {
      setDesfecho({ tipo: "erro", mensagem: r.error });
      toast.error(r.error);
      return;
    }
    setDesfecho({ tipo: "recusada" });
    router.refresh();
  }

  if (desfecho.tipo === "feita") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{proposta.resumo}</p>
            <p className="text-muted-foreground">
              {desfecho.parcial
                ? "Executado com falha em parte dos itens. Confira o registro antes de repetir."
                : "Feito. A alteração já está no módulo."}
            </p>
            {desfecho.rota && (
              <Link
                href={desfecho.rota}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Ver o registro <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (desfecho.tipo === "recusada") {
    return (
      <div className="mt-3 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Recusada.</span> Nada foi alterado, e a
        recusa ficou registrada.
      </div>
    );
  }

  const bloqueado = desfecho.tipo === "confirmando" || expirada;

  return (
    <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldQuestion className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 font-medium">Confirmar antes de aplicar</span>
        <Badge variant="outline" className="text-[11px] font-normal">
          {proposta.rotulo ?? rotuloDaFerramenta(proposta.toolName)}
        </Badge>
      </div>

      {/*
        A frase mais importante do cartão, e ela vem ANTES da previsão de propósito: quem lê
        rápido precisa saber que nada aconteceu antes de olhar os campos.
      */}
      <p className="mt-2 text-muted-foreground">
        O assistente preparou esta alteração e <strong>não aplicou nada</strong>. Ela só
        acontece se você confirmar aqui.
      </p>

      <p className="mt-2 font-medium">{proposta.resumo}</p>

      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {proposta.linhas.map((l) => (
          <React.Fragment key={l.rotulo}>
            <dt className="text-xs text-muted-foreground sm:text-sm">{l.rotulo}</dt>
            {/* `min-w-0` + `break-words`: título longo não empurra o cartão na horizontal. */}
            <dd className="min-w-0 break-words font-medium">{l.valor}</dd>
          </React.Fragment>
        ))}
      </dl>

      {proposta.ressalvas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {proposta.ressalvas.map((r) => (
            <li key={r} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
              <span className="min-w-0">{r}</span>
            </li>
          ))}
        </ul>
      )}

      {desfecho.tipo === "erro" && (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {desfecho.mensagem}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={confirmar} disabled={bloqueado} className="min-w-0">
          {desfecho.tipo === "confirmando" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          <span className="truncate">Confirmar</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={recusar}
          disabled={desfecho.tipo === "confirmando"}
          className="min-w-0"
        >
          <X className="size-4" />
          <span className="truncate">Recusar</span>
        </Button>

        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          <span className="truncate">
            {expirada
              ? "O prazo de confirmação passou. Peça de novo ao assistente."
              : `Expira em ${restante} min`}
          </span>
        </span>
      </div>
    </div>
  );
}

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
 * ║  • O PRAZO É VISÍVEL. A contagem aparece: uma proposta que expira em silêncio faz o    ║
 * ║    dono clicar e receber uma recusa sem entender por quê.                              ║
 * ║  • NADA ACONTECEU AINDA, e a tela diz isso com todas as letras.                        ║
 * ║  • (REDESIGN-07-D · D1) O ESTADO É O DO APPROVAL ENGINE — `estadoDoCartao`, com os     ║
 * ║    rótulos de `/ia/acoes`. Vencido não oferece Recusar; `falhou` não é "em parte"; a   ║
 * ║    resposta que não volta é "sem desfecho registrado", nunca um spinner eterno.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ Este componente não sabe executar nada. Ele chama a Server Action, que é a única porta
 * do Approval Engine.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Clock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconeDoEstado, TOM_DO_ESTADO } from "@/components/ai/estado-da-acao";
import { confirmarAcaoDaIa, recusarAcaoDaIa } from "@/lib/actions/ai-actions";
import { rotuloDaFerramenta } from "@/lib/ai/constants";
import {
  DESFECHO_INICIAL,
  desfechoDaConfirmacao,
  estadoDoCartao,
  type DesfechoDoCartao,
} from "@/lib/ai/cartao";
import { actionsLink, stuckActionsLink } from "@/lib/search/ai-links";
import { cn } from "@/lib/utils";

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

/**
 * Quanto falta, em minutos inteiros (mínimo 1 — o vencido não chega aqui).
 *
 * ⚠️ `agora` é o relógio DO NAVEGADOR, e ele pode estar errado. Por isso este número é
 * **informativo e só**: quem decide o prazo é o banco, comparando `expires_at` com `now()` do
 * servidor. A tela pode dizer "faltam 2 min" e o servidor recusar — e é assim mesmo, porque a
 * alternativa (a tela decidir) poria a janela de replay no cliente.
 */
function minutosRestantes(expiresAt: string, agora: number): number {
  return Math.max(1, Math.ceil((Date.parse(expiresAt) - agora) / 60_000));
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function LinkComSeta({
  href,
  children,
}: {
  readonly href: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {children} <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

export function ProposalCard({
  proposta,
  aoAplicar,
  desfecho: desfechoControlado,
  onDesfecho,
  onDecidiu,
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
  /**
   * REDESIGN-07-D · D1 — o desfecho CONTROLADO por quem hospeda o cartão.
   *
   * ⛔ No chat ele vem de `useConversaDaIa`, que mora ACIMA da gaveta do painel: o
   * `SheetContent` desmonta tudo ao fechar (invariante 95), e com o desfecho aqui dentro
   * reabrir o painel mostrava "aguardando você" de novo — e confirmar dava "já foi decidida".
   * Sem estas duas props (comprovantes, insights, desfazer), o cartão guarda o próprio estado,
   * como sempre guardou: ali nada desmonta por baixo dele.
   */
  readonly desfecho?: DesfechoDoCartao;
  readonly onDesfecho?: (desfecho: DesfechoDoCartao) => void;
  /** Chamado quando não há mais nada a decidir — o painel tira a proposta do selo. */
  readonly onDecidiu?: (proposalId: string) => void;
}) {
  const router = useRouter();
  const [desfechoLocal, setDesfechoLocal] = React.useState<DesfechoDoCartao>(DESFECHO_INICIAL);
  const desfecho = desfechoControlado ?? desfechoLocal;
  const [agora, setAgora] = React.useState<number>(() => Date.now());

  // Um tique a cada 30 s só para a contagem não congelar. Nada aqui decide nada.
  React.useEffect(() => {
    if (desfecho.tipo !== "pendente") return;
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [desfecho.tipo]);

  const vista = estadoDoCartao(desfecho, proposta.expiresAt, agora);
  const tom = TOM_DO_ESTADO[vista.estado];

  function registrar(proximo: DesfechoDoCartao) {
    if (onDesfecho) onDesfecho(proximo);
    else setDesfechoLocal(proximo);
    if (estadoDoCartao(proximo, proposta.expiresAt, Date.now()).final) onDecidiu?.(proposta.id);
  }

  async function confirmar() {
    registrar({ tipo: "enviando", acao: "confirmar" });
    let r: Awaited<ReturnType<typeof confirmarAcaoDaIa>>;
    try {
      r = await confirmarAcaoDaIa({
        proposalId: proposta.id,
        // ⚠️ O hash que sobe é o que ESTE cartão recebeu junto da previsão que está desenhada
        // abaixo. Não é recalculado no cliente e não vem de outro lugar da tela.
        hash: proposta.effectHash,
      });
    } catch {
      // ⛔ A resposta não voltou: a decisão pode ou não ter sido gravada, e a execução pode ou
      // não ter acontecido. O claim-first erra para "pode não ter acontecido" — e a tela também.
      registrar({ tipo: "sem_desfecho" });
      toast.error("A resposta não voltou. Confira em Ações antes de pedir de novo.");
      return;
    }

    const proximo = desfechoDaConfirmacao(
      r.ok
        ? { ok: true, status: r.data.status, rota: r.data.targetRoute }
        : { ok: false, mensagem: r.error },
    );
    registrar(proximo);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (proximo.tipo === "executada") toast.success("Feito.");
    else if (proximo.tipo === "parcial") toast.warning("Aplicada em parte: alguns itens falharam.");
    else toast.error("A alteração não terminou. Confira em Ações antes de pedir de novo.");

    // ⚠️ Só depois do sucesso, e antes do `refresh`: quem escutar precisa da chance de
    // escrever o que falta (o anexo) antes de a tela reler o servidor.
    if (r.data.status === "sucesso" && aoAplicar) {
      await aoAplicar({ targetId: r.data.targetId, targetRoute: r.data.targetRoute });
    }
    router.refresh();
  }

  async function recusar() {
    registrar({ tipo: "enviando", acao: "recusar" });
    let r: Awaited<ReturnType<typeof recusarAcaoDaIa>>;
    try {
      r = await recusarAcaoDaIa({ proposalId: proposta.id, hash: proposta.effectHash });
    } catch {
      // Nada é aplicado numa recusa, chegando ou não — e repetir é seguro: no pior caso o
      // servidor responde que a proposta já foi decidida.
      registrar(DESFECHO_INICIAL);
      toast.error("Não foi possível enviar a recusa. Nada foi aplicado; tente de novo.");
      return;
    }
    if (!r.ok) {
      registrar({ tipo: "nao_aplicada", mensagem: r.error });
      toast.error(r.error);
      return;
    }
    registrar({ tipo: "recusada" });
    router.refresh();
  }

  return (
    <div className={cn("mt-3 rounded-xl border p-3 text-sm", tom.fundo)}>
      <div className="flex flex-wrap items-center gap-2">
        <IconeDoEstado estado={vista.estado} className={tom.cor} />
        <span className="min-w-0 flex-1 font-medium">{maiuscula(vista.rotulo)}</span>
        {/* `max-w-full min-w-0 truncate`: rótulo longo de ferramenta não empurra a tela a 390. */}
        <Badge variant="outline" className="max-w-full min-w-0 truncate text-[11px] font-normal">
          {proposta.rotulo ?? rotuloDaFerramenta(proposta.toolName)}
        </Badge>
      </div>

      {vista.estado === "pendente" && (
        <>
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
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning-ink" aria-hidden />
                  <span className="min-w-0">{r}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={confirmar}
              disabled={!vista.podeConfirmar}
              aria-busy={vista.girando === "confirmar" || undefined}
              className="min-w-0"
            >
              {vista.girando === "confirmar" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              <span className="truncate">
                {vista.girando === "confirmar" ? "Confirmando…" : "Confirmar"}
              </span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={recusar}
              disabled={!vista.podeRecusar}
              aria-busy={vista.girando === "recusar" || undefined}
              className="min-w-0"
            >
              {vista.girando === "recusar" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <X className="size-4" aria-hidden />
              )}
              <span className="truncate">
                {vista.girando === "recusar" ? "Recusando…" : "Recusar"}
              </span>
            </Button>

            {vista.girando === null && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3 shrink-0" aria-hidden />
                <span className="truncate">
                  Expira em {minutosRestantes(proposta.expiresAt, agora)} min
                </span>
              </span>
            )}
          </div>
        </>
      )}

      {vista.estado === "expirada" && (
        <>
          <p className="mt-2 text-muted-foreground">
            <strong className="text-foreground">Nada foi aplicado.</strong> O prazo de confirmação
            terminou sem decisão. Peça de novo ao assistente — a previsão é recalculada com os
            dados de agora.
          </p>
          <p className="mt-2 font-medium text-muted-foreground">{proposta.resumo}</p>
        </>
      )}

      {desfecho.tipo === "executada" && (
        <>
          <p className="mt-2 font-medium">{proposta.resumo}</p>
          <p className="text-muted-foreground">A alteração já está no módulo.</p>
          {desfecho.rota && <LinkComSeta href={desfecho.rota}>Ver o registro</LinkComSeta>}
        </>
      )}

      {desfecho.tipo === "parcial" && (
        <>
          <p className="mt-2 font-medium">{proposta.resumo}</p>
          <p className="text-muted-foreground">
            Parte dos itens falhou. Confira o que entrou antes de pedir de novo.
          </p>
          <LinkComSeta href={stuckActionsLink()}>Ver o que foi aplicado em Ações</LinkComSeta>
        </>
      )}

      {desfecho.tipo === "falhou" && (
        <>
          <p className="mt-2 font-medium">{proposta.resumo}</p>
          <p className="text-muted-foreground">
            A alteração começou e <strong className="text-foreground">não terminou</strong>. Algo
            pode ter sido gravado — confira em Ações antes de pedir de novo.
          </p>
          <LinkComSeta href={stuckActionsLink()}>Ver em Ações</LinkComSeta>
        </>
      )}

      {desfecho.tipo === "recusada" && (
        <p className="mt-2 text-muted-foreground">
          <strong className="text-foreground">Nada foi alterado</strong>, e a recusa ficou
          registrada.
        </p>
      )}

      {desfecho.tipo === "nao_aplicada" && (
        <>
          <p className="mt-2 text-muted-foreground">{desfecho.mensagem}</p>
          <LinkComSeta href={actionsLink()}>Ver em Ações</LinkComSeta>
        </>
      )}

      {desfecho.tipo === "sem_desfecho" && (
        <>
          <p className="mt-2 text-muted-foreground">
            A confirmação foi enviada e{" "}
            <strong className="text-foreground">a resposta não voltou</strong>. Ela pode ter sido
            aplicada ou não — confira em Ações antes de pedir de novo.
          </p>
          <LinkComSeta href={stuckActionsLink()}>Ver em Ações</LinkComSeta>
        </>
      )}
    </div>
  );
}

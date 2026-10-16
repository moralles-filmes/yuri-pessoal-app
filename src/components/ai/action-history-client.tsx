"use client";

/**
 * Fase 18-C · Bloco 5 — IA · A lista de "Ações realizadas pela IA".
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ TRÊS COISAS QUE ESTA TELA TEM DE DIZER, E UMA QUE ELA NÃO PODE DIZER                  ║
 * ║                                                                                       ║
 * ║  1. O ESTADO, derivado na leitura — nunca lido de coluna.                              ║
 * ║  2. O QUE SERIA FEITO (a previsão que o dono leu) e O QUE FOI FEITO (os campos que a   ║
 * ║     allowlist do command deixou passar). São coisas diferentes e ficam separadas.      ║
 * ║  3. POR QUE não há desfazer, quando não há — a explicação vem do descriptor (§3.7).    ║
 * ║                                                                                       ║
 * ║ ⛔ E ela NÃO pode chamar de sucesso (nem de falha) uma execução que ficou `executando`. ║
 * ║    A vaga foi reservada e o desfecho não voltou; quem sabe é o módulo.                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Todo o texto vem PRONTO do servidor. Este componente não deriva estado, não recalcula
 * disponibilidade de desfazer e não conhece command nenhum — se conhecesse, teria de importar
 * `approval/commands`, que carrega as funções que gravam.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  History,
  Loader2,
  MessageSquare,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import type { PropostaNaTela } from "@/components/ai/proposal-card";
import { ProposalCardSobDemanda } from "@/components/ai/proposal-card-sob-demanda";
import { IconeDoEstado, classeDoSelo } from "@/components/ai/estado-da-acao";
import { rotuloDoCampo, textoDoCampo } from "@/components/ai/texto-do-campo";
import { prepararDesfazerDaIa } from "@/lib/actions/ai-actions";
import { ROTULO_DO_ESTADO_DA_ACAO } from "@/lib/ai/constants";
import { formatDate, timeInSaoPaulo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { actionsLink, conversationLink } from "@/lib/search/ai-links";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";
import {
  FILTROS_DO_HISTORICO,
  filtrarHistorico,
  type AcaoDaIa,
  type FiltroDoHistorico,
} from "@/lib/ai/approval/history";

/**
 * ⚠️ INSTANTE LIDO EM BRASÍLIA, nunca `.slice(0,10)` de `timestamptz`. `started_at`,
 * `decided_at` e `created_at` são instantes: entre 21h e 00h BRT o dia em UTC já virou.
 */
function momentoLegivel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(d)} às ${timeInSaoPaulo(d)}`;
}

const ROTULO_DO_FILTRO: Record<FiltroDoHistorico, string> = {
  todas: "Todas",
  aplicadas: "Aplicadas",
  aguardando: "Aguardando você",
  problemas: "Precisam de atenção",
};

// ══════════════════════════════════════════════════════════════════════════════════════
// O desfazer — dois cliques, e o segundo é o mesmo de qualquer outra alteração
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O BOTÃO NÃO DESFAZ. Ele PREPARA, e o que aparece em seguida é o cartão de confirmação —
 * o MESMO componente que o chat usa, com o mesmo hash, o mesmo prazo e a mesma Server Action.
 *
 * Um desfazer de um clique só seria a única escrita do sistema sem o dono ler o que vai
 * acontecer. E o inverso de uma ação não é inofensivo: ele exclui tarefa, apaga registro de
 * diário e cancela compromisso que já foi para o calendário do dono lá fora.
 */
function BotaoDesfazer({
  execucaoId,
  rotuloDoInverso,
}: {
  readonly execucaoId: string;
  readonly rotuloDoInverso: string;
}) {
  const [preparando, setPreparando] = React.useState(false);
  const [proposta, setProposta] = React.useState<PropostaNaTela | null>(null);

  async function preparar() {
    setPreparando(true);
    const r = await prepararDesfazerDaIa({ executionId: execucaoId });
    setPreparando(false);

    if (!r.ok) {
      toast.error(mensagemDaAction(r));
      return;
    }
    setProposta({
      id: r.data.id,
      effectHash: r.data.effectHash,
      expiresAt: r.data.expiresAt,
      // Proposta de desfazer não vem de ferramenta: o rótulo vem pronto do servidor.
      toolName: "",
      rotulo: r.data.rotulo,
      risco: 0,
      resumo: r.data.previsao.resumo,
      linhas: r.data.previsao.linhas,
      ressalvas: r.data.previsao.ressalvas,
    });
  }

  if (proposta) return <ProposalCardSobDemanda proposta={proposta} />;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={preparar}
      disabled={preparando}
      className="min-w-0"
    >
      {preparando ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Undo2 className="size-4" />
      )}
      <span className="truncate">Desfazer · {rotuloDoInverso}</span>
    </Button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════
// A linha
// ══════════════════════════════════════════════════════════════════════════════════════

function LinhaDaAcao({ acao }: { readonly acao: AcaoDaIa }) {
  const campos = acao.execucao ? Object.entries(acao.execucao.campos) : [];

  /**
   * A proposta ainda pendente é decidida AQUI, pelo mesmo cartão do chat — e ele já desenha a
   * previsão inteira. Repeti-la acima faria o dono ler duas vezes a mesma coisa e ter de
   * descobrir sozinho que são a mesma.
   */
  const decidirAqui =
    acao.estado === "pendente" &&
    acao.previsao !== null &&
    acao.effectHash !== null &&
    acao.expiraEm !== null &&
    acao.propostaId !== null;

  return (
    <li className="rounded-xl border bg-card p-3 text-sm">
      {/* `min-w-0` no lado texto: rótulo longo não empurra os selos para fora do card. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn("gap-1 text-[11px] font-normal", classeDoSelo(acao.estado))}
        >
          <IconeDoEstado estado={acao.estado} />
          {ROTULO_DO_ESTADO_DA_ACAO[acao.estado]}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-medium">{acao.rotuloDoCommand}</span>
        {acao.ehDesfazer && (
          <Badge variant="outline" className="text-[11px] font-normal">
            desfazer
          </Badge>
        )}
        {acao.semTrilha && (
          <Badge variant="outline" className="text-[11px] font-normal">
            sem trilha
          </Badge>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {momentoLegivel(acao.momento)}
        </span>
      </div>

      {/*
        ⚠️ A PREVISÃO É O QUE O DONO LEU ANTES DE CONFIRMAR. Ela fica mesmo depois de aplicada:
        é a prova do que foi autorizado, e sem ela a linha diria só que "algo aconteceu".
      */}
      {acao.previsao && !decidirAqui && <p className="mt-2">{acao.previsao.resumo}</p>}

      {acao.previsao && !decidirAqui && acao.previsao.linhas.length > 0 && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          {acao.previsao.linhas.map((l) => (
            <React.Fragment key={l.rotulo}>
              <dt className="text-xs text-muted-foreground sm:text-sm">{l.rotulo}</dt>
              <dd className="min-w-0 break-words">{l.valor}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {!decidirAqui &&
        acao.previsao?.ressalvas.map((r) => (
          <p
            key={r}
            className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground"
          >
            <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
            <span className="min-w-0">{r}</span>
          </p>
        ))}

      {/*
        REDESIGN-07-D · D1 — a confirmada SEM execução registrada. Ela não espera mais nada de
        ninguém (por isso saiu de "Aguardando você"), e o selo sozinho não diz o que houve.
        "Não há execução registrada", e não "não foi executada": a lista lê propostas e execuções
        em janelas independentes, e a frase não afirma mais do que o registro diz.
      */}
      {acao.estado === "confirmada" && !acao.execucao && (
        <p className="mt-2 rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
          Você confirmou e <strong className="text-foreground">não há execução registrada</strong>{" "}
          — pelo registro, nada foi aplicado. Isso acontece quando os dados mudaram ou o prazo
          terminou entre a previsão e a confirmação. Peça de novo na conversa.
        </p>
      )}

      {acao.semTrilha && (
        <p className="mt-2 rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
          A conversa que originou esta ação foi excluída, então a previsão que você confirmou
          não está mais disponível. O registro do que foi feito continua aqui — ele não some
          com a conversa.
        </p>
      )}

      {/* ─── O que FOI feito. Separado da previsão de propósito: são fatos diferentes. ─── */}
      {acao.execucao && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-2">
          {acao.execucao.status === "executando" ? (
            <p className="text-xs text-warning-ink">
              Esta execução começou e <strong>não registrou o desfecho</strong>. Ela pode ter
              sido aplicada ou não — confira o registro no módulo antes de refazer qualquer
              coisa.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {acao.execucao.status === "sucesso"
                ? "Aplicada nos seus dados."
                : acao.execucao.status === "parcial"
                  ? "Aplicada em parte: alguns itens falharam."
                  : acao.execucao.status === "falhou"
                    ? "Não foi aplicada. Nada mudou nos seus dados."
                    : "O desfecho foi gravado num formato que esta versão não reconhece."}
            </p>
          )}

          {campos.length > 0 && (
            <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              {campos.map(([chave, valor]) => (
                <React.Fragment key={chave}>
                  <dt className="text-muted-foreground">{rotuloDoCampo(chave)}</dt>
                  <dd className="min-w-0 break-words">{textoDoCampo(valor)}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}

          {/*
            §3.6 — o serviço alterou algo fora da allowlist do command. Registrar que houve é
            honesto; o NOME do campo não é registrado, e por isso a tela também não o nomeia.
          */}
          {acao.execucao.undetailed && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Houve também alteração que esta trilha não detalha.
            </p>
          )}

          {acao.execucao.itens.length > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {acao.execucao.itens.filter((i) => i.ok).length} de{" "}
              {acao.execucao.itens.length} itens aplicados.
            </p>
          )}

          {acao.execucao.targetRoute && (
            <Link
              href={acao.execucao.targetRoute}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver o registro <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      )}

      {/* ─── A decisão em aberto: o mesmo cartão do chat, com o mesmo hash. ─── */}
      {decidirAqui && acao.previsao && (
        <ProposalCardSobDemanda
          proposta={{
            id: acao.propostaId as string,
            effectHash: acao.effectHash as string,
            expiresAt: acao.expiraEm as string,
            toolName: "",
            rotulo: acao.rotuloDoCommand,
            risco: acao.risco ?? 0,
            resumo: acao.previsao.resumo,
            linhas: acao.previsao.linhas,
            ressalvas: acao.previsao.ressalvas,
          }}
        />
      )}

      {/* ─── O desfazer, ou a explicação de por que não há. ─── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {acao.desfazer.tipo === "disponivel" && (
          <BotaoDesfazer
            execucaoId={acao.desfazer.execucaoId}
            rotuloDoInverso={acao.desfazer.rotuloDoInverso}
          />
        )}
        {acao.desfazer.tipo === "ja-desfeita" && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Undo2 className="size-3 shrink-0" />
            <span className="min-w-0">
              Desfeita em {momentoLegivel(acao.desfazer.em)}.
            </span>
          </span>
        )}
        {/*
          §3.7 — quando não há desfazer, a tela EXPLICA. Esconder o botão em silêncio deixaria
          o dono achando que o sistema esqueceu de oferecê-lo.
        */}
        {acao.desfazer.tipo === "indisponivel" && acao.execucao && (
          <span className="min-w-0 text-xs text-muted-foreground">
            {acao.desfazer.porque}
          </span>
        )}

        {acao.conversationId && (
          <Link
            href={conversationLink(acao.conversationId)}
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <MessageSquare className="size-3" /> Ver a conversa
          </Link>
        )}
      </div>
    </li>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════
// A tela
// ══════════════════════════════════════════════════════════════════════════════════════

export function ActionHistoryClient({
  linhas,
  filtro,
  teto,
  saturado,
}: {
  readonly linhas: readonly AcaoDaIa[];
  readonly filtro: FiltroDoHistorico;
  readonly teto: number;
  readonly saturado: boolean;
}) {
  const visiveis = filtrarHistorico(linhas, filtro);

  return (
    <div className="space-y-3">
      {/*
        Filtro na URL — é CLIQUE, não digitação, então a regra do projeto vale no sentido
        normal: o estado mora na URL e sobrevive a link, voltar e recarregar. `Link` em vez de
        `router.push` para a tela não depender de `useSearchParams`.

        `flex-wrap` + `min-w-0`: quatro rótulos longos não empurram a página na horizontal.
      */}
      <div className="flex flex-wrap gap-2">
        {FILTROS_DO_HISTORICO.map((f) => (
          <Button
            key={f}
            asChild
            size="sm"
            variant={f === filtro ? "default" : "outline"}
            className="min-w-0"
          >
            <Link
              href={actionsLink(f)}
              aria-current={f === filtro ? "page" : undefined}
            >
              <span className="truncate">{ROTULO_DO_FILTRO[f]}</span>
            </Link>
          </Button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={History}
          title={
            linhas.length === 0
              ? "O assistente ainda não preparou nenhuma alteração"
              : "Nada neste filtro"
          }
          description={
            linhas.length === 0
              ? "Quando ele preparar uma alteração e você confirmar, ela aparece aqui — com o que foi feito e o que dá para desfazer."
              : "Troque o filtro para ver as demais."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visiveis.map((acao) => (
            <LinhaDaAcao key={acao.chave} acao={acao} />
          ))}
        </ul>
      )}

      {/*
        ⚠️ O TETO É DECLARADO, não escondido — invariante 29 da 18-C, aplicada à própria tela
        de auditoria. "As 100 mais recentes" é uma janela; apresentá-la como "todas" seria a
        mesma mentira que a subfase existe para impedir.
      */}
      {saturado && (
        <p className="text-xs text-muted-foreground">
          Esta tela mostra as {teto} ações mais recentes. Pode haver mais no histórico.
        </p>
      )}
    </div>
  );
}

"use client";

/**
 * Fase 18-B — IA · De onde veio a resposta.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA TELA SÓ AFIRMA O QUE ESTÁ GRAVADO.                                               ║
 * ║                                                                                       ║
 * ║ `ai_tool_calls` guarda o PEDIDO (ferramenta, argumentos), QUANTO foi encontrado e as  ║
 * ║ `refs` — nunca o resultado. Então aqui não existe "dado completo" nem "dado           ║
 * ║ incompleto": `completude` (do adapter) e `itens_truncados` (do executor) não estão no  ║
 * ║ banco, e são coisas DIFERENTES entre si. Inventar qualquer um dos dois seria a mesma  ║
 * ║ mentira que a subfase inteira combate — ver `AVISO_DA_TRILHA`.                         ║
 * ║                                                                                       ║
 * ║ E `registros` é `records_read` = QUANTOS EXISTIAM no período, não quantos itens        ║
 * ║ chegaram ao modelo (a poda por tamanho encurta a lista, nunca os totais). Por isso o   ║
 * ║ rótulo é "registros encontrados".                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Responsividade: todo lado "texto" de flex com irmão `shrink-0` leva `min-w-0`, e a lista de
 * chips quebra linha (`flex-wrap`) — chip de nome longo em tela estreita não empurra a bolha.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Database, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AVISO_DA_TRILHA,
  ROTULO_DO_STATUS_DE_FERRAMENTA,
  ROTULO_REGISTROS_ENCONTRADOS,
  rotuloDaFerramenta,
} from "@/lib/ai/constants";
import {
  resumirFontes,
  versaoVisivel,
  type RunSources,
  type ToolCallRecord,
} from "@/lib/ai/tools/sources";
import type { ToolCallStatus } from "@/lib/ai/tools/contracts";

/**
 * A chamada como a tela do STREAMING a conhece: o evento SSE `tool` traz só nome, desfecho e
 * contagem. É de propósito que ela seja mais pobre que a linha do banco — o evento não carrega
 * `refs` nem argumentos, e a tela não os inventa: eles aparecem quando a página relê a
 * conversa do servidor.
 */
export type FerramentaAoVivo = {
  readonly toolName: string;
  readonly status: ToolCallStatus;
  readonly registros: number;
};

const CLASSE_DO_STATUS: Record<ToolCallStatus, string> = {
  executada: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  rejeitada: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  falhou: "border-destructive/40 text-destructive",
  timeout: "border-destructive/40 text-destructive",
};

/** Um chip por consulta. Serve ao vivo e à trilha gravada — o desenho é o mesmo. */
function ChipDeFerramenta({
  toolName,
  status,
  registros,
}: {
  toolName: string;
  status: ToolCallStatus;
  registros: number | null;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("max-w-full gap-1 text-[11px] font-normal", CLASSE_DO_STATUS[status])}
    >
      <Database className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{rotuloDaFerramenta(toolName)}</span>
      <span className="shrink-0 text-muted-foreground">
        · {ROTULO_DO_STATUS_DE_FERRAMENTA[status]}
        {status === "executada" && registros !== null && ` · ${registros}`}
      </span>
    </Badge>
  );
}

/** Os chips que aparecem DURANTE a resposta, a partir do evento SSE `tool`. */
export function SourceChipsAoVivo({
  ferramentas,
  emAndamento,
}: {
  ferramentas: readonly FerramentaAoVivo[];
  emAndamento: boolean;
}) {
  if (ferramentas.length === 0) return null;

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      {ferramentas.map((f, i) => (
        <ChipDeFerramenta
          key={`${f.toolName}-${i}`}
          toolName={f.toolName}
          status={f.status}
          registros={f.registros}
        />
      ))}
      {emAndamento && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden /> consultando…
        </span>
      )}
    </div>
  );
}

/**
 * A trilha DURÁVEL de uma resposta: sobrevive ao recarregamento porque sai de `ai_tool_calls`.
 *
 * ⚠️ O que NÃO sobrevive: o contexto de página enviado no envio. Ele não é persistido em lugar
 * nenhum (nem `ai_runs` nem `ai_conversations` têm coluna para ele), então o selo "enviada com
 * o contexto de …" some ao recarregar — e isto aqui não o substitui. Está declarado, não
 * disfarçado.
 */
export function SourceChips({
  fontes,
  emAndamento,
}: {
  fontes: RunSources | undefined;
  emAndamento: boolean;
}) {
  const [aberto, setAberto] = React.useState(false);
  const chamadas = fontes?.chamadas ?? [];

  if (chamadas.length === 0) return null;

  const resumo = resumirFontes(chamadas);
  const comRefs = chamadas.filter((c) => c.refs.length > 0);

  return (
    <div className="mt-2 space-y-1.5 border-t pt-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {chamadas.map((c, i) => (
          <ChipDeFerramenta
            key={`${c.toolName}-${i}`}
            toolName={c.toolName}
            status={c.status}
            registros={c.recordsRead}
          />
        ))}
        {emAndamento && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> consultando…
          </span>
        )}
      </div>

      <p className="min-w-0 text-[11px] text-muted-foreground">
        {resumo.executadas} de {resumo.chamadas}{" "}
        {resumo.chamadas === 1 ? "consulta" : "consultas"} concluída
        {resumo.executadas === 1 ? "" : "s"}
        {resumo.registrosEncontrados !== null && (
          <>
            {" · "}
            {resumo.registrosEncontrados} {ROTULO_REGISTROS_ENCONTRADOS}
            {resumo.parcial && " (alguma consulta não informou a contagem)"}
          </>
        )}
      </p>

      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        {aberto ? (
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="size-3 shrink-0" aria-hidden />
        )}
        Ver dados usados
      </button>

      {aberto && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          {chamadas.map((c, i) => (
            <DetalheDaChamada key={`${c.toolName}-detalhe-${i}`} chamada={c} />
          ))}

          {comRefs.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Nenhuma consulta apontou para um registro específico — o que voltou foram
              totais calculados pelo sistema sobre o período.
            </p>
          )}

          <ClassificacaoDasFontes />

          <p className="text-[11px] text-muted-foreground">{AVISO_DA_TRILHA}</p>
        </div>
      )}
    </div>
  );
}

function DetalheDaChamada({ chamada }: { chamada: ToolCallRecord }) {
  const versao = versaoVisivel(chamada.toolVersion);

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-xs font-medium">
          {rotuloDaFerramenta(chamada.toolName)}
        </span>
        {/*
          `"-"` é MARCADOR de "a chamada nem chegou a uma ferramenta" (a coluna é NOT NULL),
          não uma versão. `versaoVisivel` devolve `null` nesse caso e o selo some.
        */}
        {versao && (
          <span className="shrink-0 text-[11px] text-muted-foreground">v{versao}</span>
        )}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {dataEHoraCurta(chamada.createdAt)}
        </span>
      </div>

      {chamada.argumentos.length > 0 && (
        <p className="min-w-0 break-words text-[11px] text-muted-foreground">
          Pedido:{" "}
          {chamada.argumentos.map((a) => `${a.chave} = ${a.valor}`).join(" · ")}
        </p>
      )}

      {chamada.status !== "executada" && (
        <p className="min-w-0 text-[11px] text-muted-foreground">
          Nada foi lido nesta consulta ({ROTULO_DO_STATUS_DE_FERRAMENTA[chamada.status]}).
        </p>
      )}

      {chamada.refs.length > 0 && (
        <ul className="min-w-0 space-y-0.5">
          {chamada.refs.map((r) => (
            <li key={`${r.tipo}-${r.id}`} className="min-w-0">
              {/* Rota INTERNA, validada em `parseRefs` — nunca URL externa. */}
              <Link
                href={r.rota}
                className="text-[11px] text-primary underline-offset-2 hover:underline"
              >
                {rotuloDoTipo(r.tipo)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * ⚠️ A legenda separa o que o SISTEMA pode provar do que ele não pode.
 *
 * "Fato" e "cálculo do sistema" têm evidência gravada: os `refs` apontam para o registro, e os
 * agregados saíram das mesmas funções que as telas usam. "Inferência" e "sugestão" são texto
 * do assistente — o sistema não lê a prosa dele e não marcaria isso sem adivinhar, então diz
 * que não marca em vez de fingir que marca. E "informação ausente" é o caso concreto que ESTA
 * tela mostra: consulta que não foi executada não trouxe dado nenhum.
 */
function ClassificacaoDasFontes() {
  const ITENS: readonly { readonly marca: string; readonly texto: string }[] = [
    {
      marca: "Fato",
      texto:
        "registro seu, lido do sistema. Os links acima levam ao registro original.",
    },
    {
      marca: "Cálculo do sistema",
      texto:
        "total somado pelo backend, pelas mesmas regras das telas do módulo — não pelo assistente.",
    },
    {
      marca: "Inferência e sugestão",
      texto:
        "opinião ou recomendação do assistente. O sistema não classifica o texto dele: o que não estiver amparado por uma consulta acima não vem dos seus registros.",
    },
    {
      marca: "Informação ausente",
      texto:
        "consulta não autorizada, que falhou ou que expirou — nada foi lido, e nenhum número dela é confiável.",
    },
  ];

  return (
    <dl className="space-y-1 border-t pt-2">
      {ITENS.map((i) => (
        <div key={i.marca} className="min-w-0 text-[11px]">
          <dt className="inline font-medium">{i.marca}:</dt>{" "}
          <dd className="inline text-muted-foreground">{i.texto}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `sessao_de_treino` → "Sessão de treino". Sem tabela: o vocabulário dos `refs` é nosso. */
function rotuloDoTipo(tipo: string): string {
  const limpo = tipo.replace(/_/g, " ").trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

/**
 * ⚠️ `createdAt` é `timestamptz` — INSTANTE. Formatado em Brasília, nunca com `.slice(0,10)`,
 * que devolveria o dia em UTC e "viraria o dia" entre 21h e meia-noite.
 */
function dataEHoraCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

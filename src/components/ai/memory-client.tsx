"use client";

/**
 * Fase 18-F · Bloco 3 — IA · A lista de memórias e os quatro botões.
 *
 * ⛔ O FORMULÁRIO ENTRA POR `next/dynamic` + `useLazyDialog` (regra 2 do carregamento sob
 * demanda): ele arrasta `zod` + `react-hook-form`, uns 62 KB gz. Antes do primeiro clique em
 * "Nova preferência", nada disso é baixado.
 *
 * ⚠️ E ESTE ARQUIVO NÃO IMPORTA `@/lib/validators/ai` NEM `memory/state.ts`. O primeiro começa
 * com `import { z } from "zod"`; o segundo puxa `@/lib/format`, e `date-fns` atrás dele. O
 * estado já chega resolvido do servidor, como rótulo.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Brain, Pencil, Plus, Power, Trash2, UserPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
/**
 * ⚠️ O componente de confirmação que o projeto JÁ TEM (Financeiro). Reusá-lo é a regra do
 * projeto — e aqui tem um efeito concreto: a frase de confirmação, o estado de carregamento e
 * o toast de erro saem do mesmo lugar em que saem para transação, cartão e conta.
 *
 * ⛔ Ele recebe o próprio botão por `trigger`, então NÃO pode entrar por `next/dynamic`: o
 * botão sumiria da tela. É a exceção declarada na regra 2 do carregamento sob demanda.
 */
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import {
  alternarMemoriaAction,
  esquecerMemoriaAction,
  excluirMemoriaAction,
} from "@/lib/actions/ai-memory";
import { ROTULO_DA_PERMISSAO } from "@/lib/ai/constants";
import { cn } from "@/lib/utils";
import type { MemoriaNaLista } from "./memory-types";

/**
 * ⛔ Objeto literal escrito AQUI — o compilador do Next o lê estaticamente e recusa constante
 * compartilhada (`next/dynamic options must be an object literal`). A repetição é exigida.
 */
const MemoryFormDialog = dynamic(
  () => import("./memory-form-dialog").then((m) => m.MemoryFormDialog),
  { ssr: false, loading: () => null },
);

/**
 * Os três filtros. `sem uso` junta expirada, desativada e esquecida: para o dono são a mesma
 * pergunta ("o que o assistente não está levando?"), e o selo de cada linha diz qual é qual.
 */
const FILTROS = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "em-uso", rotulo: "Em uso" },
  { chave: "sem-uso", rotulo: "Sem uso" },
] as const;

type Filtro = (typeof FILTROS)[number]["chave"];

/** O rótulo do módulo sai do MESMO lugar que a tela de preferências usa. */
function rotuloDoModulo(modulo: string): string {
  const chave = `allow_${modulo}` as keyof typeof ROTULO_DA_PERMISSAO;
  return ROTULO_DA_PERMISSAO[chave]?.titulo ?? modulo;
}

export function MemoryClient({ memorias }: { readonly memorias: readonly MemoriaNaLista[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [pendente, startTransition] = React.useTransition();

  const [aberto, setAberto] = React.useState(false);
  const montado = useLazyDialog(aberto);
  const [emEdicao, setEmEdicao] = React.useState<MemoriaNaLista | null>(null);

  const visiveis = memorias.filter((m) => {
    if (filtro === "todas") return true;
    const emUso = m.estado === "vigente";
    return filtro === "em-uso" ? emUso : !emUso;
  });

  function abrirNova() {
    setEmEdicao(null);
    setAberto(true);
  }

  function abrirEdicao(m: MemoriaNaLista) {
    setEmEdicao(m);
    setAberto(true);
  }

  /** As três ações que só precisam do id. Uma função, três chamadores. */
  function executar(
    acao: () => Promise<{ ok: boolean; error?: string }>,
    sucesso: string,
  ) {
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) {
        toast.error(r.error ?? "Não foi possível concluir.");
        return;
      }
      toast.success(sucesso);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/*
        ⚠️ `min-w-0` no lado dos filtros e `shrink-0` no botão: com uma frase longa em volta,
        item de flex não encolhe abaixo do conteúdo e empurra o irmão para fora do card.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {FILTROS.map((f) => (
            <Button
              key={f.chave}
              type="button"
              size="sm"
              variant={filtro === f.chave ? "default" : "outline"}
              onClick={() => setFiltro(f.chave)}
              aria-pressed={filtro === f.chave}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" className="ml-auto shrink-0" onClick={abrirNova}>
          <Plus className="size-4" />
          Nova preferência
        </Button>
      </div>

      {/*
        ⚠️ O TEXTO QUE COBRE O LIMITE DA FERRAMENTA. O orquestrador não alcança `memory.lembrar`
        (ele afirma no próprio prompt que não cria nada), então preferência dita numa conversa
        geral NÃO vira proposta. Dizer isso aqui é o que impede o dono de achar que o
        assistente ignorou o pedido dele.
      */}
      <p className="text-xs text-muted-foreground">
        Preferências gerais — como você quer ser chamado, que formato prefere — escreva aqui. O
        assistente só propõe memória dentro de uma conversa de módulo.
      </p>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={
            memorias.length === 0
              ? "Nenhuma preferência salva"
              : "Nada nesse filtro"
          }
          description={
            memorias.length === 0
              ? "Escreva uma frase curta dizendo como você quer ser atendido. O assistente a leva para toda conversa, como preferência sua."
              : "Troque o filtro para ver as outras preferências."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visiveis.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-xl border p-3",
                m.estado !== "vigente" && "bg-muted/30",
              )}
            >
              <div className="flex items-start gap-3">
                {/* ⚠️ `min-w-0`: a frase é longa e o irmão da direita é `shrink-0`. */}
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="break-words text-sm">{m.conteudo}</p>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant={m.estado === "vigente" ? "default" : "secondary"}>
                      {m.rotuloDoEstado}
                    </Badge>
                    <Badge variant="outline">
                      {m.modulo ? rotuloDoModulo(m.modulo) : "Todas as conversas"}
                    </Badge>
                    {/*
                      ⛔ EXPIRAR NÃO APAGA — e a tela diz QUANDO venceu, em vez de só marcar a
                      linha como morta. Quem tem prazo e ainda vale mostra até quando.
                    */}
                    {m.expirouEm ? (
                      <span className="text-muted-foreground">
                        venceu em {m.expirouEm}
                      </span>
                    ) : m.prazo ? (
                      <span className="text-muted-foreground">vale até {m.prazo}</span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      {m.origem === "ia" ? (
                        <>
                          <Bot className="size-3.5 shrink-0" />
                          proposta pelo assistente, confirmada por você
                        </>
                      ) : (
                        <>
                          <UserPen className="size-3.5 shrink-0" />
                          escrita por você
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/*
                ⚠️ Grade apertada no celular: `Button` é `whitespace-nowrap`, e quatro rótulos
                em quatro colunas empurrariam a página na horizontal. Duas colunas até `sm`.
              */}
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-w-0"
                  disabled={pendente}
                  onClick={() => abrirEdicao(m)}
                >
                  <Pencil className="size-4 shrink-0" />
                  <span className="truncate">Editar</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-w-0"
                  disabled={pendente}
                  onClick={() =>
                    executar(
                      () =>
                        alternarMemoriaAction({ id: m.id, ligar: m.estado !== "vigente" }),
                      m.estado === "vigente"
                        ? "Preferência desativada."
                        : "Preferência reativada.",
                    )
                  }
                >
                  <Power className="size-4 shrink-0" />
                  <span className="truncate">
                    {m.estado === "vigente" ? "Desativar" : "Reativar"}
                  </span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-w-0"
                  disabled={pendente || m.estado === "esquecida"}
                  onClick={() =>
                    executar(
                      () => esquecerMemoriaAction({ id: m.id }),
                      "O assistente para de usar essa preferência. Ela continua aqui.",
                    )
                  }
                >
                  <span className="truncate">Esquecer</span>
                </Button>

                {/*
                  ⛔ APAGAR PEDE CONFIRMAÇÃO, e o texto diz o que sobrevive e qual é a
                  alternativa. É o único dado do sistema que o dono escreveu à mão e que não
                  tem como recuperar de lugar nenhum — nem do backup de outro módulo, nem de
                  um registro que o sistema tenha produzido.
                */}
                <DeleteConfirmDialog
                  trigger={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-w-0 text-destructive"
                      disabled={pendente}
                    >
                      <Trash2 className="size-4 shrink-0" />
                      <span className="truncate">Apagar</span>
                    </Button>
                  }
                  title="Apagar esta preferência?"
                  description={
                    "A frase sai daqui e não volta. Fica registrado que ela existiu e quando foi apagada — sem o texto. " +
                    'Se você só quer que o assistente pare de usá-la, use "Esquecer": ela continua legível nesta tela.'
                  }
                  confirmLabel="Apagar"
                  loadingLabel="Apagando…"
                  successMessage="Preferência apagada."
                  onConfirm={async () => {
                    const r = await excluirMemoriaAction({ id: m.id });
                    if (r.ok) router.refresh();
                    return r;
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {montado && (
        <MemoryFormDialog
          aberto={aberto}
          onAbertoChange={setAberto}
          memoria={emEdicao}
          onSalvo={() => {
            setAberto(false);
            router.refresh();
          }}
        />
      )}

    </div>
  );
}

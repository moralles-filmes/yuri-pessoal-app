"use client";

/**
 * REDESIGN-04-A2 · T8 — a barra de filtros do relatório financeiro (D-A2-1..4).
 *
 * Período, base e responsabilidade ficam sempre à vista. Os quatro recortes (Conta, Cartão, Pessoa,
 * Categoria) são `<select>` nativos — não há campo de texto, então `useUrlText` não se aplica.
 *
 * ⚠️ OS QUATRO SELECTS SÃO RENDERIZADOS EM DOIS LUGARES, DE PROPÓSITO. `<details>` fechado não tem
 * como ser forçado a mostrar o conteúdo só com CSS (o conteúdo é escondido pelo navegador, não por
 * `display`), e o D-A2-4 quer os quatro sempre abertos do `sm` para cima. Então: dentro do
 * `<details>` só no celular (`sm:hidden`, ids com sufixo `-m`) e numa grade fora dele do `sm` para
 * cima (`hidden sm:grid`, ids sem sufixo). `display: none` tira do DOM acessível, e os ids nunca se
 * repetem. O par rótulo/select é escrito UMA vez, em `CamposDeRecorte`.
 *
 * Navegação: período por `router.push` (entra no histórico, como o relatório de hoje); base,
 * responsabilidade e recortes por `router.replace` com `scroll: false` (é refino da mesma tela).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { SeletorDeVisao } from "@/components/shared/seletor-de-visao";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ROTULO_DA_BASE, type BaseFinanceira } from "@/lib/finance/base";
import type { Recorte, TipoDeRecorte } from "@/lib/finance/recorte";
import { ROTULO_DA_RESPONSABILIDADE, type Responsabilidade } from "@/lib/finance/responsabilidade";
import { comRecorte, semFiltros, urlDoRelatorio } from "@/lib/reports/url-do-relatorio";
import { cn } from "@/lib/utils";

type Opcao = { id: string; nome: string };

export type FiltrosDoRelatorio = {
  mes: string;
  base: BaseFinanceira;
  resp: Responsabilidade;
  recorte: Recorte;
  opcoes: { contas: Opcao[]; cartoes: Opcao[]; pessoas: Opcao[]; categorias: Opcao[] };
};

const BASES = ["competencia", "caixa"] as const;
const RESPONSABILIDADES = ["meu", "terceiros", "consolidado"] as const;

const CAMPOS: {
  tipo: TipoDeRecorte;
  id: string;
  rotulo: string;
  todas: string;
  lista: keyof FiltrosDoRelatorio["opcoes"];
}[] = [
  { tipo: "conta", id: "rel-conta", rotulo: "Conta", todas: "Todas as contas", lista: "contas" },
  { tipo: "cartao", id: "rel-cartao", rotulo: "Cartão", todas: "Todos os cartões", lista: "cartoes" },
  { tipo: "pessoa", id: "rel-pessoa", rotulo: "Pessoa", todas: "Todas as pessoas", lista: "pessoas" },
  { tipo: "categoria", id: "rel-categoria", rotulo: "Categoria", todas: "Todas as categorias", lista: "categorias" },
];

const ROTULO_DO_TIPO: Record<TipoDeRecorte, string> = {
  conta: "Conta",
  cartao: "Cartão",
  pessoa: "Pessoa",
  categoria: "Categoria",
};

/** Mesmo desenho dos inputs do projeto; ligado, a borda vira primária (e não só a cor: há o chip). */
const SELECT_BASE =
  "h-9 w-full min-w-0 campo-nativo px-3 text-sm [&>option]:bg-background [&>option]:text-foreground";
const SELECT_LIGADO = "border-primary ring-1 ring-primary";

function CamposDeRecorte({
  filtros,
  sufixo,
  aoEscolher,
}: {
  filtros: FiltrosDoRelatorio;
  /** `""` fora do `<details>`; `"-m"` dentro dele — os ids não podem se repetir. */
  sufixo: string;
  aoEscolher: (tipo: TipoDeRecorte, id: string | null) => void;
}) {
  return (
    <>
      {CAMPOS.map((campo) => {
        const id = `${campo.id}${sufixo}`;
        const atual = filtros.recorte[campo.tipo];
        return (
          <div key={campo.tipo} className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{campo.rotulo}</Label>
            <select
              id={id}
              value={atual ?? ""}
              onChange={(e) => aoEscolher(campo.tipo, e.target.value || null)}
              className={cn(SELECT_BASE, atual !== null && SELECT_LIGADO)}
            >
              <option value="">{campo.todas}</option>
              {filtros.opcoes[campo.lista].map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </>
  );
}

/**
 * O seletor do mês de referência. Mora aqui para valer nas DUAS abas que leem o mês (Financeiro e
 * Cartões): troca o período por `router.push` (entra no histórico) preservando base, responsabilidade
 * e recorte via `urlDoRelatorio`. O `id` é de quem usa — os dois nunca aparecem ao mesmo tempo, mas
 * o rótulo ligado ao campo não pode depender disso.
 */
export function SeletorDoMes({ filtros, id }: { filtros: FiltrosDoRelatorio; id: string }) {
  const router = useRouter();
  const { mes, base, resp, recorte } = filtros;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:w-52">
      <Label htmlFor={id}>Período (mês de referência)</Label>
      <input
        id={id}
        type="month"
        value={mes}
        onChange={(e) => router.push(urlDoRelatorio({ mes: e.target.value || mes, base, resp, recorte }))}
        className="h-9 w-full min-w-0 campo-nativo px-3 text-sm"
      />
    </div>
  );
}

type Chip = { chave: string; texto: string; rotulo: string; remover: () => void };

export function BarraDeFiltros({ filtros }: { filtros: FiltrosDoRelatorio }) {
  const router = useRouter();
  const { mes, base, resp, recorte } = filtros;

  const irPara = (proximo: Partial<Pick<FiltrosDoRelatorio, "base" | "resp" | "recorte">>) =>
    router.replace(urlDoRelatorio({ mes, base, resp, recorte, ...proximo }), { scroll: false });

  const escolherRecorte = (tipo: TipoDeRecorte, id: string | null) =>
    irPara({ recorte: comRecorte(recorte, tipo, id) });

  const chips: Chip[] = [];
  if (resp !== "meu") {
    chips.push({
      chave: "resp",
      texto: `Responsabilidade: ${ROTULO_DA_RESPONSABILIDADE[resp]}`,
      rotulo: "Responsabilidade",
      remover: () => irPara({ resp: "meu" }),
    });
  }
  for (const campo of CAMPOS) {
    const id = recorte[campo.tipo];
    if (id === null) continue;
    const nome = filtros.opcoes[campo.lista].find((o) => o.id === id)?.nome ?? id;
    chips.push({
      chave: campo.tipo,
      texto: `${ROTULO_DO_TIPO[campo.tipo]}: ${nome}`,
      rotulo: ROTULO_DO_TIPO[campo.tipo],
      remover: () => escolherRecorte(campo.tipo, null),
    });
  }

  // O número do "Mais filtros (n)" conta só os recortes: é o que mora dentro do <details>.
  const recortesLigados = CAMPOS.filter((c) => recorte[c.tipo] !== null).length;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <SeletorDoMes filtros={filtros} id="rel-mes" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium">Base:</span>
            <SeletorDeVisao
              rotulo="Base dos números"
              visoes={BASES}
              rotulos={ROTULO_DA_BASE}
              atual={base}
              aoEscolher={(b) => irPara({ base: b })}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium">Responsabilidade:</span>
            <SeletorDeVisao
              rotulo="Responsabilidade dos números"
              visoes={RESPONSABILIDADES}
              rotulos={ROTULO_DA_RESPONSABILIDADE}
              atual={resp}
              aoEscolher={(r) => irPara({ resp: r })}
            />
          </div>
        </div>

        {/* Celular: os quatro recortes num <details>, aberto quando já há recorte ligado. */}
        <details open={recortesLigados > 0 || undefined} className="group sm:hidden">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-input px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 truncate">
              Mais filtros{recortesLigados > 0 ? ` (${recortesLigados})` : ""}
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-1 gap-3 pt-3">
            <CamposDeRecorte filtros={filtros} sufixo="-m" aoEscolher={escolherRecorte} />
          </div>
        </details>

        {/* Do `sm` para cima: sempre à vista, fora do <details> (ver o aviso no topo do arquivo). */}
        <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          <CamposDeRecorte filtros={filtros} sufixo="" aoEscolher={escolherRecorte} />
        </div>

        {chips.length > 0 && (
          <div role="group" aria-label="Filtros ativos" className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Filtros ativos:</span>
            {chips.map((chip) => (
              <span
                key={chip.chave}
                className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-primary bg-primary/10 py-0.5 pr-1 pl-3 text-sm"
              >
                <span className="min-w-0 truncate">{chip.texto}</span>
                <button
                  type="button"
                  aria-label={`Remover filtro de ${chip.rotulo}`}
                  onClick={chip.remover}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => router.replace(semFiltros(mes), { scroll: false })}
              className="rounded-md px-2 py-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

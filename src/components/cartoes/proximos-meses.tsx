import Link from "next/link";
import { CreditCard } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { BotaoDoOlho } from "@/components/shared/painel/olho-dos-valores";
import { Bloco } from "@/components/shared/painel/bloco";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { CartaoDaCentral } from "@/lib/finance/central-cartoes";
import type { CelulaDoMes, ProximosMeses, TotalDoMes } from "@/lib/finance/proximos-meses";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MATERIAL_LADRILHO } from "@/components/ui/materiais";
import { CLASSE_DO_TOM, rotuloDoEstado } from "./estado-da-fatura";

/*
 * REDESIGN-05-C — Próximos meses da central de cartões (componente de SERVIDOR, sem JS de cliente).
 * Todo número e todo estado vêm de `montarProximosMeses`; aqui só se formata. Dinheiro chega em
 * CENTAVOS. O selo sai SÓ de `rotuloDoEstado`. Cada célula com fatura só NAVEGA (um <Link>): nenhum
 * botão de ação, nenhum onClick. Prevista e mês sem fatura nunca viram "R$ 0,00".
 *
 * O olho dos valores age só por CSS (`group-data-[ocultar=true]/olho`): o valor real e o "R$ ••••"
 * saem os dois do servidor, e a ilha cliente (`OlhoDosValores`, na página) escolhe qual aparece.
 */

const SEM_LANCAMENTOS = "sem lançamentos conhecidos";
/** O mesmo fallback de `cards-client.tsx`. */
const COR_PADRAO = "#A98438";
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const moeda = (cent: number) => formatCurrency(cent / 100);

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** 'yyyy-MM-dd' → 'dd/MM' (data pura, como texto). */
function diaMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/** 'yyyy-MM' → "novembro de 2026" (minúsculo, para frase corrida). */
export function mesPorExtenso(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

/** "Novembro de 2026": a inicial maiúscula é feita aqui, em JS — nunca por CSS. */
function tituloDoMes(competencia: string): string {
  const t = mesPorExtenso(competencia);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** 'yyyy-MM' → "Nov 2026". */
function mesCurto(competencia: string): string {
  return `${MESES_CURTOS[Number(competencia.slice(5, 7)) - 1] ?? ""} ${competencia.slice(0, 4)}`;
}

/* ───────────────────────────── Peças ───────────────────────────── */

/** O valor e o "R$ ••••" saem os dois do servidor; o CSS do olho escolhe. */
function Valor({ texto }: { texto: string }) {
  return (
    <>
      <span className="group-data-[ocultar=true]/olho:hidden">{texto}</span>
      <span aria-hidden="true" className="hidden group-data-[ocultar=true]/olho:inline">
        R$ ••••
      </span>
    </>
  );
}

function Selo({ texto, tom }: { texto: string; tom: keyof typeof CLASSE_DO_TOM }) {
  return (
    <Badge variant="outline" className={CLASSE_DO_TOM[tom]}>
      {texto}
    </Badge>
  );
}

function SeloDaCelula({ celula }: { celula: Extract<CelulaDoMes, { tipo: "real" | "prevista" }> }) {
  const { texto, tom } =
    celula.tipo === "real"
      ? rotuloDoEstado(
          { credito: celula.credito, estado: celula.estado, pagoEm: celula.pagoEm },
          celula.tabela,
        )
      : rotuloDoEstado({ credito: false, estado: "prevista", pagoEm: null }, "abertas");
  return <Selo texto={texto} tom={tom} />;
}

function MarcadorDoCartao({ cor }: { cor: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-sm"
      style={{ backgroundColor: cor ?? COR_PADRAO }}
    />
  );
}

/** "vence 15/11" · "venceu 15/11" — só para o que está a pagar. */
function textoDoVencimento(c: Extract<CelulaDoMes, { tipo: "real" }>): string {
  return `${c.estado === "atrasada" ? "venceu" : "vence"} ${diaMes(c.dataVencimento)}`;
}

function notaDoTotal(total: NonNullable<TotalDoMes>): string[] {
  return [
    total.qtdPagas > 0 ? `inclui ${plural(total.qtdPagas, "já paga", "já pagas")}` : null,
  ].filter((t): t is string => t !== null);
}

function textoParcial(total: NonNullable<TotalDoMes>): string | null {
  return total.qtdPrevistas > 0
    ? `parcial: ${plural(total.qtdPrevistas, "cartão", "cartões")} sem lançamentos`
    : null;
}

/* ───────────────────────────── Desktop: mês × cartão ───────────────────────────── */

const TH =
  "px-2 py-2.5 text-left align-bottom text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const CEL =
  `${MATERIAL_LADRILHO} block min-h-16 rounded-[14px] px-2.5 py-2 text-inherit no-underline hover:border-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none`;
const MES_STICKY = "sticky left-0 z-[1] bg-glass-solid";
/** O total do mês fica sempre à vista: com muitos cartões a grade rola entre as duas colunas fixas. */
const TOTAL_STICKY = "sticky right-0 z-[1] border-l";

function CelulaDaTabela({ celula }: { celula: CelulaDoMes }) {
  if (celula.tipo === "nao-projeta") {
    return <span className="block px-2.5 py-2 text-xs text-muted-foreground">— não projeta</span>;
  }
  if (celula.tipo === "fechou-sem-lancamentos") {
    return (
      <span className="block px-2.5 py-2 text-xs text-muted-foreground italic">
        fechou sem lançamentos
      </span>
    );
  }
  if (celula.tipo === "prevista") {
    return (
      <Link href={celula.href} className={cn(CEL, "border-dashed border-border bg-transparent shadow-none")}>
        <span className="block text-xs leading-snug text-muted-foreground italic">
          {SEM_LANCAMENTOS}
        </span>
        <span className="mt-1.5 block">
          <SeloDaCelula celula={celula} />
        </span>
      </Link>
    );
  }
  const paga = celula.estado === "paga";
  const zero = celula.totalCent === 0;
  return (
    <Link href={celula.href} className={cn(CEL, celula.aPagar && "border-l-4 border-l-destructive")}>
      <span
        className={cn(
          "block text-sm font-semibold whitespace-nowrap tabular-nums",
          paga && "font-medium text-muted-foreground line-through",
        )}
      >
        <Valor texto={moeda(celula.totalCent)} />
      </span>
      <span className="mt-0.5 block text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
        {zero ? (
          "nada a pagar"
        ) : (
          <>
            meu <Valor texto={moeda(celula.meuCent)} />
          </>
        )}
      </span>
      {celula.aPagar && (
        <span className="block text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
          {textoDoVencimento(celula)}
        </span>
      )}
      <span className="mt-1.5 block">
        <SeloDaCelula celula={celula} />
      </span>
    </Link>
  );
}

function CelulaDoTotal({ total }: { total: TotalDoMes }) {
  if (!total) {
    return <span className="text-xs text-muted-foreground italic">{SEM_LANCAMENTOS}</span>;
  }
  const parcial = textoParcial(total);
  const notas = notaDoTotal(total);
  return (
    <span className="block space-y-0.5">
      <span className="block text-sm font-semibold whitespace-nowrap tabular-nums">
        <Valor texto={moeda(total.totalCent)} />
      </span>
      <span className="block text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
        meu <Valor texto={moeda(total.meuCent)} />
      </span>
      {notas.map((n) => (
        <span key={n} className="block text-[11px] text-muted-foreground">
          {n}
        </span>
      ))}
      {parcial && <span className="block text-[11px] text-warning-ink">{parcial}</span>}
    </span>
  );
}

function CabecalhoDoCartao({ cartao }: { cartao: CartaoDaCentral }) {
  return (
    <th className={cn(TH, "min-w-32 normal-case")}>
      <span className="flex min-w-0 items-center gap-1.5">
        <MarcadorDoCartao cor={cartao.cor} />
        <span className="min-w-0 truncate text-foreground">{cartao.nome}</span>
      </span>
      <span className="block text-[10px] font-medium tracking-normal text-muted-foreground normal-case">
        {cartao.ativo
          ? `fecha dia ${cartao.dia_fechamento} · vence ${cartao.dia_vencimento}`
          : "desativado · não projeta"}
      </span>
    </th>
  );
}

function Tabela({ dados, mesAtual }: { dados: ProximosMeses; mesAtual: string }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table
        className="w-full border-collapse"
        style={{ minWidth: 90 + 150 + dados.cartoes.length * 132 }}
      >
        <thead>
          <tr className="border-b">
            <th className={cn(TH, MES_STICKY, "w-20")}>Mês</th>
            {dados.cartoes.map((c) => (
              <CabecalhoDoCartao key={c.id} cartao={c} />
            ))}
            <th className={cn(TH, TOTAL_STICKY, "min-w-36 bg-glass-solid")}>
              Total conhecido
              <span className="block text-[10px] font-medium tracking-normal normal-case">
                só faturas que existem
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {dados.meses.map((mes) => (
            <tr key={mes} className="border-b align-top last:border-b-0">
              <td className={cn("px-2 py-3 text-sm font-semibold whitespace-nowrap", MES_STICKY)}>
                {mesCurto(mes)}
                {mes === mesAtual && (
                  <span className="block text-xs font-normal text-muted-foreground">atual</span>
                )}
              </td>
              {dados.cartoes.map((c) => (
                <td key={c.id} className="p-1.5 align-top">
                  <CelulaDaTabela celula={dados.celulas[c.id][mes]} />
                </td>
              ))}
              <td className={cn(TOTAL_STICKY, "bg-muted px-2.5 py-3 align-top")}>
                <CelulaDoTotal total={dados.totais[mes]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── Abaixo de md: um bloco por mês ───────────────────────────── */

function LinhaDoCartao({ cartao, celula }: { cartao: CartaoDaCentral; celula: CelulaDoMes }) {
  const nome = (
    <span className="flex min-w-0 items-center gap-2">
      <MarcadorDoCartao cor={cartao.cor} />
      <span className="min-w-0 truncate">{cartao.nome}</span>
      {!cartao.ativo && (
        <Badge variant="outline" className="text-muted-foreground">
          desativado
        </Badge>
      )}
    </span>
  );
  const BASE = "flex items-center justify-between gap-2.5 px-4 py-2";

  if (celula.tipo === "nao-projeta") {
    return (
      <div className={cn(BASE, "text-muted-foreground")}>
        {nome}
        <span className="shrink-0 text-xs">— não projeta</span>
      </div>
    );
  }
  if (celula.tipo === "fechou-sem-lancamentos") {
    return (
      <div className={cn(BASE, "text-muted-foreground")}>
        {nome}
        <span className="shrink-0 text-xs italic">fechou sem lançamentos</span>
      </div>
    );
  }
  if (celula.tipo === "prevista") {
    return (
      <Link href={celula.href} className={cn(BASE, "text-inherit no-underline hover:bg-muted/50")}>
        {nome}
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground italic">
          {SEM_LANCAMENTOS}
          <SeloDaCelula celula={celula} />
        </span>
      </Link>
    );
  }
  const paga = celula.estado === "paga";
  const zero = celula.totalCent === 0;
  return (
    <Link
      href={celula.href}
      className={cn(
        BASE,
        "text-inherit no-underline hover:bg-muted/50",
        celula.aPagar && "border-l-4 border-l-destructive pl-3",
      )}
    >
      {nome}
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            paga && "font-medium text-muted-foreground line-through",
          )}
        >
          <Valor texto={moeda(celula.totalCent)} />
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {zero ? (
            "nada a pagar"
          ) : (
            <>
              meu <Valor texto={moeda(celula.meuCent)} />
              {celula.aPagar ? ` · ${textoDoVencimento(celula)}` : ""}
            </>
          )}
        </span>
        <SeloDaCelula celula={celula} />
      </span>
    </Link>
  );
}

function ListaPorMes({ dados, mesAtual }: { dados: ProximosMeses; mesAtual: string }) {
  return (
    <div className="md:hidden">
      {dados.meses.map((mes) => {
        const total = dados.totais[mes];
        const notas = total ? [...notaDoTotal(total), textoParcial(total)].filter(Boolean) : [];
        return (
          <section key={mes} className="border-b last:border-b-0">
            <div className="flex items-baseline justify-between gap-2.5 px-4 pt-3 pb-1.5">
              <h4 className="min-w-0 text-sm font-semibold">
                {tituloDoMes(mes)}
                {mes === mesAtual && (
                  <span className="text-xs font-normal text-muted-foreground"> · atual</span>
                )}
              </h4>
              <span className="shrink-0 text-xs tabular-nums">
                {total ? (
                  <>
                    <b className="text-sm">
                      <Valor texto={moeda(total.totalCent)} />
                    </b>{" "}
                    conhecido
                  </>
                ) : (
                  <i className="text-muted-foreground">{SEM_LANCAMENTOS}</i>
                )}
              </span>
            </div>
            {dados.cartoes.map((c) => (
              <LinhaDoCartao key={c.id} cartao={c} celula={dados.celulas[c.id][mes]} />
            ))}
            {total && (
              <p className="px-4 pt-1 pb-2.5 text-xs text-muted-foreground">
                meu <Valor texto={moeda(total.meuCent)} />
                {notas.length > 0 ? ` · ${notas.join(" · ")}` : ""}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Legenda ───────────────────────────── */

function Amostra({ className }: { className?: string }) {
  return <i aria-hidden className={cn("inline-block size-3 shrink-0 rounded-sm border", className)} />;
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Amostra /> fatura que existe
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Amostra className="border-l-4 border-l-destructive" /> fechada ou atrasada (a pagar)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <s>valor</s> paga
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Amostra /> R$ 0,00 = zero medido
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Amostra className="border-dashed" /> prevista: {SEM_LANCAMENTOS} (nunca R$ 0,00)
      </span>
      <span>fechou sem lançamentos = o ciclo já fechou sem compra</span>
      <span>— cartão desativado não projeta</span>
    </div>
  );
}

/* ───────────────────────────── Tela ───────────────────────────── */

export function ProximosMesesTela({
  dados,
  mesAtual,
}: {
  dados: ProximosMeses;
  mesAtual: string;
}) {
  if (dados.vazio) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Nenhum cartão ativo"
        description="Cadastre um cartão para ver, mês a mês, as faturas que já existem e as que ainda não têm compra."
      >
        <Link href="/cartoes/meus" className={buttonVariants({ size: "sm" })}>
          Cadastrar cartão
        </Link>
      </EmptyState>
    );
  }

  return (
    <Bloco
      titulo="Cartão × mês"
      subtitulo="valores por fatura · minha parte abaixo do total"
      acao={<BotaoDoOlho />}
      estado="conteudo"
    >
      <div className="-mx-4 sm:-mx-5">
        <Tabela dados={dados} mesAtual={mesAtual} />
        <ListaPorMes dados={dados} mesAtual={mesAtual} />
      </div>
      <Legenda />
    </Bloco>
  );
}

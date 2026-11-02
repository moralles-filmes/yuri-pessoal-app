import Link from "next/link";
import { CreditCard, Receipt, Wallet } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  LinhaDaCentral,
  PessoaDaCentral,
  TotalDaCentral,
  VisaoGeralDosCartoes,
} from "@/lib/finance/central-cartoes";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CLASSE_DO_TOM, rotuloDoEstado } from "./estado-da-fatura";

/*
 * REDESIGN-05-A — Visão geral da central de cartões (componente de SERVIDOR, sem JS de cliente).
 * Todo número vem de `montarVisaoGeral`; aqui só se formata. Dinheiro chega em CENTAVOS.
 * Cada linha só NAVEGA (um <Link> para a fatura): nenhum botão de ação, nenhum onClick.
 */

const SEM_LANCAMENTOS = "sem lançamentos conhecidos";
/** O mesmo fallback de `cards-client.tsx`. */
const COR_PADRAO = "#A98438";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const moeda = (cent: number) => formatCurrency(cent / 100);

/** 'yyyy-MM-dd' → 'dd/MM' (data pura, como texto). */
function diaMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/** 'yyyy-MM' → 'out'. */
function mesAbreviado(competencia: string): string {
  return MESES[Number(competencia.slice(5, 7)) - 1] ?? "";
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function hrefDaFatura(l: LinhaDaCentral): string {
  return `/faturas?card=${l.card.id}&month=${l.competencia}`;
}

function Selo({ linha, tabela }: { linha: LinhaDaCentral; tabela: "fechadas" | "abertas" }) {
  const { texto, tom } = rotuloDoEstado(linha, tabela);
  return (
    <Badge variant="outline" className={CLASSE_DO_TOM[tom]}>
      {texto}
    </Badge>
  );
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

function NomeDoCartao({ linha }: { linha: LinhaDaCentral }) {
  return (
    <>
      <MarcadorDoCartao cor={linha.card.cor} />
      <span className="min-w-0 truncate font-medium">
        {linha.card.nome} · {mesAbreviado(linha.competencia)}
      </span>
      {!linha.card.ativo && (
        <Badge variant="outline" className="text-muted-foreground">
          cartão desativado
        </Badge>
      )}
    </>
  );
}

/* ───────────────────────────── Números do topo ───────────────────────────── */

function valorDoTotal(total: TotalDaCentral, campo: "totalCent" | "meuCent"): string {
  return total ? moeda(total[campo]) : SEM_LANCAMENTOS;
}

function apoioDeTerceiros(total: TotalDaCentral): string | undefined {
  return total ? `terceiros: ${moeda(total.totalCent - total.meuCent)}` : undefined;
}

function apoioDeAPagar(v: VisaoGeralDosCartoes): string | undefined {
  const partes = [
    v.qtdAPagar > 0 ? plural(v.qtdAPagar, "fatura", "faturas") : null,
    v.qtdAtrasadas > 0 ? plural(v.qtdAtrasadas, "atrasada", "atrasadas") : null,
    v.proximoVencimento ? `próxima vence ${diaMes(v.proximoVencimento)}` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(" · ") : undefined;
}

/* ───────────────────────────── Bloco (tabela + lista móvel) ───────────────────────────── */

const TH = "px-3 py-2.5 text-right text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase first:text-left";
const TD = "px-3 py-2.5 text-right whitespace-nowrap tabular-nums first:text-left";

/**
 * A coluna Estado fica PRESA à direita: com várias pessoas a tabela rola dentro do card (medido
 * com dado real: 3 pessoas já passam de 1280 px), e o selo é o que distingue paga, atrasada e
 * prevista — ele não pode depender de rolar para ser visto.
 */
const COLUNA_DO_ESTADO = "sticky right-0 z-[1] bg-card";

function Valores({
  linha,
  pessoas,
}: {
  linha: LinhaDaCentral;
  pessoas: PessoaDaCentral[];
}) {
  // Só chamado com `valores` presentes (linha prevista tem a própria célula).
  const v = linha.valores!;
  const fora = linha.estado === "paga";
  const cls = cn(TD, fora && "text-muted-foreground line-through");
  return (
    <>
      <td className={cls}>{moeda(v.totalCent)}</td>
      <td className={cls}>{moeda(v.meuCent)}</td>
      {pessoas.map((p) => (
        <td key={p.id} className={cls}>
          {moeda(v.porPessoaCent[p.id] ?? 0)}
        </td>
      ))}
    </>
  );
}

function LinhaDaTabela({
  linha,
  pessoas,
  tabela,
}: {
  linha: LinhaDaCentral;
  pessoas: PessoaDaCentral[];
  tabela: "fechadas" | "abertas";
}) {
  const data =
    tabela === "fechadas"
      ? diaMes(linha.dataVencimento)
      : `${diaMes(linha.dataFechamento)} → ${diaMes(linha.dataVencimento)}`;
  return (
    <tr
      className={cn(
        "relative border-b last:border-b-0 hover:bg-muted/50",
        linha.estado === "prevista" && "text-muted-foreground italic",
      )}
    >
      <td className={TD}>
        {/* O overlay torna a linha inteira clicável sem JS: é só navegação. */}
        <Link
          href={hrefDaFatura(linha)}
          className="flex items-center gap-2 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
        >
          <NomeDoCartao linha={linha} />
        </Link>
      </td>
      <td className={TD}>{data}</td>
      {linha.valores ? (
        <Valores linha={linha} pessoas={pessoas} />
      ) : (
        <td colSpan={2 + pessoas.length} className={cn(TD, "text-left")}>
          {SEM_LANCAMENTOS}
        </td>
      )}
      <td className={cn(TD, COLUNA_DO_ESTADO, "not-italic")}>
        <Selo linha={linha} tabela={tabela} />
      </td>
    </tr>
  );
}

function ItemDaLista({
  linha,
  pessoas,
  tabela,
}: {
  linha: LinhaDaCentral;
  pessoas: PessoaDaCentral[];
  tabela: "fechadas" | "abertas";
}) {
  const datas =
    tabela === "fechadas"
      ? `${linha.estado === "atrasada" ? "venceu" : "vence"} ${diaMes(linha.dataVencimento)}${
          linha.entraNaSoma ? "" : " · fora da soma"
        }`
      : `fecha ${diaMes(linha.dataFechamento)} · vence ${diaMes(linha.dataVencimento)}${
          linha.estado === "paga" ? " · fora da soma" : ""
        }`;
  const v = linha.valores;
  const fora = linha.estado === "paga";
  return (
    <Link
      href={hrefDaFatura(linha)}
      className="block space-y-1 border-b px-4 py-3.5 last:border-b-0 hover:bg-muted/50"
    >
      <span className="flex items-center justify-between gap-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <NomeDoCartao linha={linha} />
        </span>
        <span className="shrink-0">
          <Selo linha={linha} tabela={tabela} />
        </span>
      </span>
      <span className="block text-xs text-muted-foreground">{datas}</span>
      {v ? (
        <span className={cn("block space-y-0.5", fora && "text-muted-foreground line-through")}>
          <span className="block pt-1 text-lg font-semibold tabular-nums">{moeda(v.totalCent)}</span>
          <span className="flex justify-between gap-3 text-sm">
            <span className="min-w-0">Minha parte</span>
            <span className="font-semibold tabular-nums">{moeda(v.meuCent)}</span>
          </span>
          {pessoas.map((p) => (
            <span key={p.id} className="flex justify-between gap-3 text-sm text-muted-foreground">
              <span className="min-w-0 truncate">{p.nome}</span>
              <span className="tabular-nums">{moeda(v.porPessoaCent[p.id] ?? 0)}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="block pt-1 text-muted-foreground italic">{SEM_LANCAMENTOS}</span>
      )}
    </Link>
  );
}

function BlocoDaCentral({
  titulo,
  frase,
  tabela,
  linhas,
  pessoas,
  colunaDaData,
  colunaDoTotal,
  vazio,
  nota,
}: {
  titulo: string;
  frase: string;
  tabela: "fechadas" | "abertas";
  linhas: LinhaDaCentral[];
  pessoas: PessoaDaCentral[];
  colunaDaData: string;
  colunaDoTotal: string;
  vazio: string;
  nota: string;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b py-3.5">
        <CardTitle>{titulo}</CardTitle>
        <span className="text-xs text-muted-foreground">{frase}</span>
      </CardHeader>

      {linhas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b">
                  <th className={TH}>Cartão</th>
                  <th className={TH}>{colunaDaData}</th>
                  <th className={TH}>{colunaDoTotal}</th>
                  <th className={TH}>Minha parte</th>
                  {pessoas.map((p) => (
                    <th key={p.id} className={TH}>
                      {p.nome}
                    </th>
                  ))}
                  <th className={cn(TH, COLUNA_DO_ESTADO)}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <LinhaDaTabela key={l.chave} linha={l} pessoas={pessoas} tabela={tabela} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden">
            {linhas.map((l) => (
              <ItemDaLista key={l.chave} linha={l} pessoas={pessoas} tabela={tabela} />
            ))}
          </div>
        </>
      )}

      <CardFooter className="text-xs text-muted-foreground">{nota}</CardFooter>
    </Card>
  );
}

/* ───────────────────────────── Tela ───────────────────────────── */

export function VisaoGeral({ visao }: { visao: VisaoGeralDosCartoes }) {
  if (!visao.temCartaoAtivo && visao.fechadas.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Nenhum cartão ativo"
        description="Cadastre um cartão para acompanhar o que está fechado para pagar e o que ainda está acumulando."
      >
        <Link href="/cartoes/meus" className={buttonVariants({ size: "sm" })}>
          Cadastrar cartão
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="A pagar (fechadas)"
          value={valorDoTotal(visao.aPagar, "totalCent")}
          icon={Receipt}
          hint={apoioDeAPagar(visao)}
        />
        <StatCard
          label="Minha parte a pagar"
          value={valorDoTotal(visao.aPagar, "meuCent")}
          icon={Wallet}
          hint={apoioDeTerceiros(visao.aPagar)}
        />
        <StatCard
          label="Em aberto (acumulando)"
          value={valorDoTotal(visao.emAberto, "totalCent")}
          icon={CreditCard}
          hint="ainda pode crescer até o fechamento"
        />
        <StatCard
          label="Minha parte em aberto"
          value={valorDoTotal(visao.emAberto, "meuCent")}
          icon={Wallet}
          hint={apoioDeTerceiros(visao.emAberto)}
        />
      </div>

      <BlocoDaCentral
        titulo="Fechadas — a pagar"
        frase="por vencimento · clique abre a fatura"
        tabela="fechadas"
        linhas={visao.fechadas}
        pessoas={visao.pessoasFechadas}
        colunaDaData="Vence"
        colunaDoTotal="Total"
        vazio="Nenhuma fatura fechada a pagar."
        nota='Paga fica visível até o vencimento e não entra em "A pagar". Crédito também fica fora da soma: crédito num cartão não reduz a dívida de outro.'
      />

      <BlocoDaCentral
        titulo="Em aberto — acumulando compras"
        frase="o valor muda até o fechamento"
        tabela="abertas"
        linhas={visao.abertas}
        pessoas={visao.pessoasAbertas}
        colunaDaData="Fecha → vence"
        colunaDoTotal="Até agora"
        vazio="Nenhum cartão ativo."
        nota='"Prevista": a fatura ainda não existe no banco — não é R$ 0,00. Zero medido é fatura que existe e soma zero. Cartão desativado não tem linha aqui.'
      />
    </div>
  );
}

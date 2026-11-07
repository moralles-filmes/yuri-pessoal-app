import { ArrowLeftRight, Sigma, Wallet } from "lucide-react";
import { FaturasChart } from "@/components/dashboard/faturas-chart";
import { Bloco } from "@/components/shared/painel/bloco";
import { Indicador } from "@/components/shared/painel/indicador";
import { BotaoDoOlho } from "@/components/shared/painel/olho-dos-valores";
import { Badge } from "@/components/ui/badge";
import type { RelatorioDeCartao, ValoresDoMes } from "@/lib/finance/relatorio-de-cartao";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExportarRelatorioDeCartao } from "./exportar-relatorio-de-cartao";
import { mesPorExtenso } from "./proximos-meses";

/*
 * REDESIGN-05-C — Relatórios de cartão (componente de SERVIDOR; o único JS de cliente é o botão do
 * CSV). Todo número vem de `montarRelatorioDeCartao`, em CENTAVOS; aqui só se formata
 * (`formatCurrency` recebe REAIS). Mês sem fatura é `null` — escrito como frase, nunca "R$ 0,00",
 * e sem barra no gráfico. O olho dos valores age só por CSS (`group-data-[ocultar=true]/olho`).
 */

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const moeda = (cent: number) => formatCurrency(cent / 100);
const reais = (cent: number) => cent / 100;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** 'yyyy-MM' → "dez/2025". */
function mesCurto(competencia: string): string {
  return `${MESES_CURTOS[Number(competencia.slice(5, 7)) - 1] ?? ""}/${competencia.slice(0, 4)}`;
}

/** "Novembro de 2026": a inicial maiúscula é feita aqui, em JS — nunca por CSS. */
function tituloDoMes(competencia: string): string {
  const t = mesPorExtenso(competencia);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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

const TH =
  "px-3 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
const TD = "px-3 py-2.5 text-sm first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
const NUM = "text-right whitespace-nowrap tabular-nums";

function CelulasDeValor({ v }: { v: ValoresDoMes }) {
  return (
    <>
      <td className={cn(TD, NUM)}>
        <Valor texto={moeda(v.totalCent)} />
      </td>
      <td className={cn(TD, NUM)}>
        <Valor texto={moeda(v.meuCent)} />
      </td>
      <td className={cn(TD, NUM)}>
        <Valor texto={moeda(v.terceirosCent)} />
      </td>
    </>
  );
}

function CabecalhoDaTabela({ primeira }: { primeira: string }) {
  return (
    <thead>
      <tr className="border-b">
        <th className={TH}>{primeira}</th>
        <th className={cn(TH, "text-right")}>Faturas</th>
        <th className={cn(TH, "text-right")}>Total</th>
        <th className={cn(TH, "text-right")}>Minha parte</th>
        <th className={cn(TH, "text-right")}>Terceiros</th>
      </tr>
    </thead>
  );
}

function PorCartao({ dados }: { dados: RelatorioDeCartao }) {
  return (
    <Bloco
      titulo="Por cartão"
      subtitulo="no mesmo período"
      estado={dados.porCartao.length === 0 ? "vazio" : "conteudo"}
      vazio={{ frase: "Nenhum cartão teve fatura neste período." }}
    >
      {/* A tabela larga rola DENTRO do card; a página não. */}
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[34rem] border-collapse">
          <CabecalhoDaTabela primeira="Cartão" />
          <tbody>
            {dados.porCartao.map(({ card, valores }) => (
              <tr key={card.id} className="border-b last:border-b-0">
                <td className={TD}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: card.cor ?? "#A98438" }}
                    />
                    <span className="min-w-0 truncate">{card.nome}</span>
                    {!card.ativo && (
                      <Badge variant="outline" className="text-muted-foreground">
                        desativado
                      </Badge>
                    )}
                  </span>
                </td>
                <td className={cn(TD, NUM)}>{valores.faturas}</td>
                <CelulasDeValor v={valores} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}

function MesAMes({ dados, nomeDoArquivo }: { dados: RelatorioDeCartao; nomeDoArquivo: string }) {
  const mesAtual = dados.meses[dados.meses.length - 1];
  // Do mais novo ao mais antigo; a tela e o CSV seguem a mesma ordem.
  const linhas = [...dados.porMes].reverse();
  const paraCsv = linhas.map(({ mes, valores }) => ({
    mes,
    faturas: valores ? valores.faturas : null,
    total: valores ? reais(valores.totalCent) : null,
    meu: valores ? reais(valores.meuCent) : null,
    terceiros: valores ? reais(valores.terceirosCent) : null,
  }));

  return (
    <Bloco
      titulo="Mês a mês"
      subtitulo="do mais novo ao mais antigo"
      acao={<ExportarRelatorioDeCartao linhas={paraCsv} nomeDoArquivo={nomeDoArquivo} />}
      estado="conteudo"
    >
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[34rem] border-collapse">
          <CabecalhoDaTabela primeira="Mês" />
          <tbody>
            {linhas.map(({ mes, valores }) => (
              <tr key={mes} className="border-b last:border-b-0">
                <td className={cn(TD, "whitespace-nowrap")}>
                  {tituloDoMes(mes)}
                  {mes === mesAtual && (
                    <span className="text-xs text-muted-foreground"> · atual</span>
                  )}
                </td>
                {valores ? (
                  <>
                    <td className={cn(TD, NUM)}>{valores.faturas}</td>
                    <CelulasDeValor v={valores} />
                  </>
                ) : (
                  <td colSpan={4} className={cn(TD, "text-sm text-muted-foreground italic")}>
                    sem fatura neste mês
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}

export function RelatorioDeCartaoTela({
  dados,
  nomeDoArquivo,
}: {
  dados: RelatorioDeCartao;
  nomeDoArquivo: string;
}) {
  const { totais } = dados;
  const periodo = `${mesCurto(dados.meses[0])} a ${mesCurto(dados.meses[dados.meses.length - 1])}`;
  const ausente = { ausente: "sem faturas neste período" };

  const grafico = dados.porMes.map(({ mes, valores }) =>
    valores
      ? {
          mes,
          total: reais(valores.totalCent),
          meu: reais(valores.meuCent),
          terceiros: reais(valores.terceirosCent),
        }
      : { mes, total: null, meu: null, terceiros: null },
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Indicador
          tom="saida"
          icone={Sigma}
          rotulo="Total das faturas"
          dica="Soma das faturas do período, na base escolhida: minha parte mais a parte dos terceiros."
          valor={totais ? moeda(totais.totalCent) : ausente}
          linhaDeBase={`${periodo}${totais ? ` · ${plural(totais.faturas, "fatura", "faturas")}` : ""}`}
          acessorio={<BotaoDoOlho />}
        />
        <Indicador
          tom="saldo"
          icone={Wallet}
          rotulo="Minha parte"
          dica="O total das faturas menos a parte dos terceiros, fatura a fatura."
          valor={totais ? moeda(totais.meuCent) : ausente}
          linhaDeBase="total − parte dos terceiros"
        />
        <Indicador
          tom="terceiros"
          icone={ArrowLeftRight}
          rotulo="Parte dos terceiros"
          dica="O que as faturas do período trazem de gastos de outras pessoas."
          valor={totais ? moeda(totais.terceirosCent) : ausente}
          linhaDeBase="o valor combinado, não o que já voltou"
        />
      </div>

      <Bloco titulo="Faturas por mês" subtitulo="minha parte + terceiros" estado="conteudo">
        {/* O olho também cobre o gráfico: o eixo e o tooltip mostram dinheiro. */}
        <p className="hidden py-8 text-center text-sm text-muted-foreground group-data-[ocultar=true]/olho:block">
          Gráfico oculto junto com os valores.
        </p>
        <div className="group-data-[ocultar=true]/olho:hidden">
          <FaturasChart
            data={grafico}
            vazio={{
              titulo: "Sem faturas neste período",
              descricao: "As faturas aparecem aqui pela base escolhida.",
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">mês sem fatura não vira barra de zero</p>
      </Bloco>

      <PorCartao dados={dados} />
      <MesAMes dados={dados} nomeDoArquivo={nomeDoArquivo} />

      <p className="text-xs text-muted-foreground">
        Atenção: o mês atual ainda pode crescer — a fatura aberta segue recebendo compras até
        fechar.
      </p>
    </div>
  );
}

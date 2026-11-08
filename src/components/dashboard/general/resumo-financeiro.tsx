/**
 * REDESIGN-06 — a faixa do Resumo financeiro do dashboard geral (Server Component).
 *
 * Lê pela leitura única `lerResumoDoDashboard` (a mesma do card Financeiro, via `cache`), então não
 * custa uma consulta a mais. O olho cobre só os quatro indicadores desta faixa (REFERENCIA-VISUAL §2.6).
 * As dicas de saldo, entradas e saídas são as da 04-A, literais.
 */
import { CreditCard, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { lerResumoDoDashboard } from "@/lib/dashboard/resumo-financeiro";
import type { ResumoDoDashboard } from "@/lib/dashboard/resumo-financeiro-puro";
import { formatCurrency } from "@/lib/format";
import { ehErroDeLeitura, registrarFalhaDeLeitura, type ErroDeLeitura } from "@/lib/supabase/leitura";
import { CardSemLeitura } from "@/components/shared/card-sem-leitura";
import { Indicador, INDICADOR_PEQUENO_NO_CELULAR } from "@/components/shared/painel/indicador";
import { BotaoDoOlho, OlhoDosValores } from "@/components/shared/painel/olho-dos-valores";

export async function ResumoFinanceiro({
  mes,
  hoje,
  ocultos,
  hrefDeNovo,
}: {
  mes: string;
  hoje: string;
  ocultos: boolean;
  hrefDeNovo: string;
}) {
  // Captura SÓ ErroDeLeitura e SÓ a leitura; o JSX fica fora do try (react-hooks/error-boundaries).
  let d: ResumoDoDashboard | null = null;
  let falha: ErroDeLeitura | null = null;
  try {
    d = await lerResumoDoDashboard(mes, hoje);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    falha = e;
    registrarFalhaDeLeitura(e);
  }
  if (falha || !d) {
    return <CardSemLeitura oQue={falha?.oQue ?? "o resumo financeiro"} href={hrefDeNovo} />;
  }

  const [ano, mesNum] = mes.split("-").map(Number);
  const mesPorExtenso = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(ano, mesNum - 1, 1),
  );

  return (
    <section aria-labelledby="resumo-financeiro-titulo" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="resumo-financeiro-titulo" className="text-base font-semibold tracking-tight">
          Resumo financeiro
        </h2>
        <p className="text-xs text-muted-foreground">{mesPorExtenso} · base: competência</p>
        {d.completudeDoMes.estado === "parcial" ? (
          <span
            role="status"
            className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-ink"
          >
            parcial · a leitura atingiu o teto de lançamentos; pode faltar coisa
          </span>
        ) : d.completudeDoHistorico.estado === "parcial" ? (
          <span
            role="status"
            className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-ink"
          >
            parcial · a base das comparações com o mês anterior pode estar incompleta
          </span>
        ) : null}
      </div>

      <OlhoDosValores ocultoInicial={ocultos}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <Indicador
            className="col-span-3 sm:col-span-1"
            tom="saldo"
            icone={Wallet}
            rotulo={d.saldoCom.rotulo}
            dica="A soma do saldo de todas as contas, contando só o que já aconteceu até o fim de hoje."
            valor={
              d.saldoCom.valor === null
                ? { erro: "Não foi possível ler o saldo" }
                : formatCurrency(d.saldoCom.valor)
            }
            linhaDeBase="todas as contas, até o fim de hoje"
            detalheComValor={d.saldoCom.diferenca}
            href="/financeiro/contas"
            hrefRotulo="Ver contas"
            acessorio={<BotaoDoOlho />}
          />
          <Indicador
            className={INDICADOR_PEQUENO_NO_CELULAR}
            tom="entrada"
            icone={TrendingUp}
            rotulo="Minhas entradas"
            dica="A parte das entradas que é sua (renda pessoal). Dinheiro de terceiros fica de fora."
            valor={formatCurrency(d.entradasInd.valor)}
            linhaDeBase="renda pessoal · competência"
            detalheComValor={d.entradasInd.linhaDeTerceiros}
            comparacao={d.comparacao.entradas}
            href={`/financeiro/lancamentos?type=receita&month=${mes}`}
            hrefRotulo="Ver entradas"
          />
          <Indicador
            className={INDICADOR_PEQUENO_NO_CELULAR}
            tom="saida"
            icone={TrendingDown}
            rotulo="Minhas saídas"
            dica="A sua parte das saídas. O que é de terceiros fica de fora e aparece em De terceiros."
            valor={formatCurrency(d.numeros.meu)}
            linhaDeBase="minha parte · competência · inclui o que ainda está pendente"
            comparacao={d.comparacao.saidas}
            href={`/financeiro/lancamentos?type=despesa&month=${mes}`}
            hrefRotulo="Ver saídas"
          />
          <Indicador
            className={INDICADOR_PEQUENO_NO_CELULAR}
            tom="terceiros"
            icone={CreditCard}
            rotulo="Total em cartões"
            dica="Tudo o que foi lançado nos cartões no mês, pela competência. À vista é o que saiu sem cartão."
            valor={formatCurrency(d.numeros.cartao)}
            linhaDeBase="competência"
            detalheComValor={`À vista: ${formatCurrency(d.numeros.aVista)}`}
            href="/faturas"
            hrefRotulo="Ver faturas"
          />
        </div>
      </OlhoDosValores>
    </section>
  );
}

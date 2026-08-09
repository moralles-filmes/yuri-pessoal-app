/**
 * Fase 18-D — IA · Duplicidade: SINALIZA, e nunca bloqueia.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ A LIÇÃO DO FITID, ESCRITA DE NOVO ANTES DE O BUG ACONTECER DE NOVO.                ║
 * ║                                                                                       ║
 * ║ Em 2026-08-06 a importação produziu bug em produção nos DOIS sentidos. O que ficou:   ║
 * ║ **duas compras iguais no mesmo dia existem.** Mesmo valor, mesma data, mesmo          ║
 * ║ estabelecimento — dois cafés, duas passagens, duas idas à padaria.                    ║
 * ║                                                                                       ║
 * ║ Por isso NENHUMA função deste arquivo devolve "bloqueia". Elas devolvem ALERTAS, com  ║
 * ║ o registro anterior nomeado, para o dono decidir. Um sistema que recusasse o segundo  ║
 * ║ café obrigaria a contornar a trava — e quem contorna trava para de ler o aviso.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════ O HASH É DIFERENTE DO TRIO, E OS DOIS SÃO ALERTA ═══════════════
 *
 * `content_sha256` idêntico significa **o mesmo arquivo**, com certeza — não é heurística.
 * Ainda assim não bloqueia: reenviar depois de descartar é legítimo, e o dono pode estar
 * refazendo um lançamento que apagou. O que ele precisa é saber *"você já mandou este
 * arquivo em 07/08, e ele virou o lançamento X"*.
 *
 * O trio (valor + data + estabelecimento) é heurística, e por isso a mensagem é mais suave.
 *
 * Puro. Nenhum I/O. `normalizarDescricao` vem da Fase 06 — a mesma normalização da
 * importação, não uma segunda.
 */

import { normalizarDescricao } from "@/lib/import/normalize";
import type { ExtracaoDeComprovante } from "./contracts";

/** Um envio anterior com o MESMO conteúdo. Vem de `ai_documents` por `content_sha256`. */
export type EnvioAnterior = {
  readonly documentoId: string;
  /** Data pura 'yyyy-MM-dd' do envio. */
  readonly enviadoEm: string;
  /**
   * `true` quando o anexo daquele envio já virou anexo de uma transação — isto é, quando o
   * `entity_type` deixou de ser `ia_documento`. É o que distingue "você mandou e descartou"
   * de "você mandou e virou lançamento".
   */
  readonly virouLancamento: boolean;
};

/** Uma transação existente parecida. Vem do Financeiro, já filtrada por data e valor. */
export type TransacaoParecida = {
  readonly transacaoId: string;
  readonly descricao: string;
  readonly dataISO: string;
  readonly valorCentavos: number;
};

/**
 * ⛔ NÃO EXISTE CAMPO `bloqueia` NESTE TIPO, e a ausência é a garantia.
 *
 * A tela não tem como transformar um alerta em recusa sem inventar um estado que o contrato
 * não representa — o mesmo raciocínio que tirou `url` de `AiContentPart`.
 */
export type AlertaDeDuplicidade =
  | {
      readonly tipo: "arquivo_identico";
      readonly documentoId: string;
      readonly mensagem: string;
    }
  | {
      readonly tipo: "lancamento_parecido";
      readonly transacaoId: string;
      readonly mensagem: string;
    };

function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function reais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/**
 * O mesmo ARQUIVO, byte a byte. Certeza, não heurística — e ainda assim só um alerta.
 *
 * Devolve no máximo um alerta, do envio mais recente: listar sete envios do mesmo arquivo
 * não ajuda ninguém a decidir, e o mais recente é o que responde "e no que deu?".
 */
export function alertaDeArquivoIdentico(
  anteriores: readonly EnvioAnterior[],
): AlertaDeDuplicidade | null {
  if (anteriores.length === 0) return null;

  // Mais recente primeiro. Ordenação por texto funciona em data pura ISO.
  const maisRecente = [...anteriores].sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm))[0];

  return {
    tipo: "arquivo_identico",
    documentoId: maisRecente.documentoId,
    mensagem: maisRecente.virouLancamento
      ? `Você já enviou este mesmo arquivo em ${dataBR(maisRecente.enviadoEm)}, e ele virou um lançamento. Confira antes de lançar de novo.`
      : `Você já enviou este mesmo arquivo em ${dataBR(maisRecente.enviadoEm)}, e ele não virou lançamento nenhum.`,
  };
}

/**
 * O TRIO — valor, data e estabelecimento.
 *
 * ⚠️ Os três têm de bater. Valor e data iguais com estabelecimento diferente são duas
 * compras diferentes no mesmo dia, o que é comum; sinalizar isso encheria a tela de alerta
 * em todo fim de semana e ensinaria o dono a ignorá-los.
 *
 * A comparação de nome usa `normalizarDescricao` da Fase 06 — a MESMA da importação. Uma
 * segunda normalização faria a IA e a importação discordarem sobre o que é "o mesmo
 * estabelecimento", e a divergência só apareceria num caso de canto.
 */
export function alertasDeLancamentoParecido(
  extracao: ExtracaoDeComprovante,
  candidatas: readonly TransacaoParecida[],
): AlertaDeDuplicidade[] {
  const valor = extracao.totalCentavos.valor;
  const data = extracao.data.valor;
  const nome = extracao.estabelecimento.valor;

  // Sem os três não há trio. Comparar com um campo faltando produziria alerta para toda
  // compra de mesmo valor do mês — ruído que treina o dono a não ler.
  if (valor === null || data === null || nome === null) return [];

  const nomeNormalizado = normalizarDescricao(nome);
  if (nomeNormalizado.length === 0) return [];

  return candidatas
    .filter(
      (t) =>
        t.valorCentavos === valor &&
        t.dataISO === data &&
        normalizarDescricao(t.descricao).includes(nomeNormalizado),
    )
    .map((t) => ({
      tipo: "lancamento_parecido" as const,
      transacaoId: t.transacaoId,
      mensagem:
        `Já existe um lançamento de R$ ${reais(t.valorCentavos)} em ${dataBR(t.dataISO)} ` +
        `("${t.descricao}"). Pode ser o mesmo — ou pode ser outra compra igual.`,
    }));
}

/** Os dois sinais juntos, na ordem em que a tela os mostra: certeza antes de heurística. */
export function alertasDeDuplicidade(entrada: {
  readonly extracao: ExtracaoDeComprovante;
  readonly enviosAnteriores: readonly EnvioAnterior[];
  readonly transacoesCandidatas: readonly TransacaoParecida[];
}): AlertaDeDuplicidade[] {
  const doArquivo = alertaDeArquivoIdentico(entrada.enviosAnteriores);
  const doTrio = alertasDeLancamentoParecido(entrada.extracao, entrada.transacoesCandidatas);
  return doArquivo ? [doArquivo, ...doTrio] : doTrio;
}

/**
 * Fase 18-D — IA · O SERVIDOR DUVIDA. Sempre.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ A CONFIANÇA DECLARADA PELO MODELO É O TETO, NUNCA A CONCLUSÃO.                     ║
 * ║                                                                                       ║
 * ║ Um modelo que lê "R$ 1.234,56" como 123456 centavos vai declarar `alta` — porque, do  ║
 * ║ ponto de vista dele, a leitura foi nítida. A autoavaliação mede a NITIDEZ da imagem,  ║
 * ║ não a correção do resultado, e tratá-la como barreira seria pedir ao modelo que       ║
 * ║ auditasse a si mesmo.                                                                  ║
 * ║                                                                                       ║
 * ║ As regras abaixo são nossas, puras e verificáveis, e todas REBAIXAM. Não existe       ║
 * ║ caminho para promover: `rebaixar` devolve o mínimo, e `promover` não existe.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. `hoje` INJETADO — nunca `Date.now()`, nunca `new Date()`.
 */

import {
  ehIncerta,
  rebaixar,
  ROTULO_DO_CAMPO,
  type Campo,
  type Confianca,
  type ExtracaoDeComprovante,
  type ItemDaNota,
} from "./contracts";
import type { ExtracaoDoModelo } from "./schema";

/** R$ 1.000.000,00. Comprovante acima disso é quase certamente vírgula lida errado. */
export const TETO_PLAUSIVEL_CENTAVOS = 100_000_000;

/** Comprovante com mais de 2 anos: possível, mas merece o dono conferir a data. */
export const ANOS_PARA_TRAS = 2;

function campo<T>(valor: T | null, confianca: Confianca, motivo: string | null): Campo<T> {
  return { valor, confianca, motivo };
}

/**
 * Texto: o único rebaixamento é a ausência. Não existe "formato de estabelecimento", e
 * inventar um (recusar nome com número, por exemplo) recusaria "Posto 24h" e "Padaria 2
 * Irmãos".
 */
function texto(entrada: { valor: string | null; confianca: Confianca }): Campo<string> {
  const limpo = entrada.valor?.trim() ?? "";
  if (limpo.length === 0) {
    return campo<string>(null, "nao_identificado", "Não veio legível no comprovante.");
  }
  return campo(limpo, entrada.confianca, null);
}

/** `true` quando a data é uma data pura VÁLIDA — 2026-02-31 não é. */
export function ehDataPuraValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(5, 7));
  const dia = Number(valor.slice(8, 10));
  // `Date.UTC` porque a comparação é de calendário, não de instante — mesma disciplina de
  // `todo/recurrence.ts` e `training/schedule.ts`.
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  );
}

/** Data pura N anos antes de `hoje`, como TEXTO. Sem conversão para instante. */
function anosAntes(hoje: string, anos: number): string {
  const ano = Number(hoje.slice(0, 4)) - anos;
  return `${String(ano).padStart(4, "0")}${hoje.slice(4)}`;
}

/**
 * A DATA — o campo mais consequente da extração, e o motivo é específico deste projeto:
 * ela decide **em qual fatura** a compra cai (`finance/invoice.ts`). Uma data errada não
 * erra só o dia; erra o mês da fatura, e o erro só aparece quando a fatura fecha.
 */
export function avaliarData(
  entrada: { valor: string | null; confianca: Confianca },
  hoje: string,
): Campo<string> {
  const bruto = entrada.valor?.trim() ?? "";
  if (bruto.length === 0) {
    return campo<string>(null, "nao_identificado", "A data não veio legível.");
  }
  if (!ehDataPuraValida(bruto)) {
    // Valor presente e inválido é `nao_identificado`, não `baixa`: um "31/02" não é uma
    // data em que se deva confiar pouco — não é uma data.
    return campo<string>(
      null,
      "nao_identificado",
      `"${bruto}" não é uma data válida.`,
    );
  }
  if (bruto > hoje) {
    return campo(
      bruto,
      rebaixar(entrada.confianca, "baixa"),
      "A data lida está no futuro.",
    );
  }
  if (bruto < anosAntes(hoje, ANOS_PARA_TRAS)) {
    return campo(
      bruto,
      rebaixar(entrada.confianca, "baixa"),
      `A data lida tem mais de ${ANOS_PARA_TRAS} anos.`,
    );
  }
  return campo(bruto, entrada.confianca, null);
}

/** O TOTAL. Zero e negativo não são "confiança baixa" — não são total de comprovante. */
export function avaliarTotal(entrada: {
  valor: number | null;
  confianca: Confianca;
}): Campo<number> {
  if (entrada.valor === null) {
    return campo<number>(null, "nao_identificado", "O valor total não veio legível.");
  }
  if (!Number.isInteger(entrada.valor)) {
    return campo<number>(
      null,
      "nao_identificado",
      "O valor total não veio como número inteiro de centavos.",
    );
  }
  if (entrada.valor <= 0) {
    return campo(
      entrada.valor,
      rebaixar(entrada.confianca, "baixa"),
      "O valor total lido é zero ou negativo.",
    );
  }
  if (entrada.valor > TETO_PLAUSIVEL_CENTAVOS) {
    return campo(
      entrada.valor,
      rebaixar(entrada.confianca, "baixa"),
      "O valor total lido passa de R$ 1.000.000,00 — confira se a vírgula foi lida certo.",
    );
  }
  return campo(entrada.valor, entrada.confianca, null);
}

/**
 * ⛔ O CONFRONTO ENTRE OS ITENS E O TOTAL — a regra que produz `conflito`.
 *
 * Só vale quando **todos** os itens têm valor: com um item ilegível, a soma é menor por
 * construção e acusaria conflito em toda nota parcialmente legível. Nesse caso o total
 * fica como está — a incerteza já está declarada no item, e duplicá-la no total seria
 * bloquear o dono duas vezes pelo mesmo motivo.
 */
export function confrontarItens(
  total: Campo<number>,
  itens: readonly ItemDaNota[],
): Campo<number> {
  if (total.valor === null || itens.length === 0) return total;

  const todosLegiveis = itens.every((i) => i.valorTotalCentavos !== null);
  if (!todosLegiveis) return total;

  const soma = itens.reduce((s, i) => s + (i.valorTotalCentavos ?? 0), 0);
  if (soma === total.valor) return total;

  const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  return {
    valor: total.valor,
    confianca: rebaixar(total.confianca, "conflito"),
    motivo:
      `A soma dos itens (R$ ${reais(soma)}) não bate com o total lido ` +
      `(R$ ${reais(total.valor)}). Confira qual dos dois está certo.`,
  };
}

/**
 * O rebaixamento inteiro: saída validada do modelo → extração em que o servidor já duvidou.
 *
 * `hoje` injetado.
 */
export function avaliarExtracao(
  bruta: ExtracaoDoModelo,
  hoje: string,
): ExtracaoDeComprovante {
  const itens: ItemDaNota[] = bruta.itens.map((i) => ({
    descricao: i.descricao.trim(),
    valorTotalCentavos:
      i.valorTotalCentavos !== null && Number.isInteger(i.valorTotalCentavos)
        ? i.valorTotalCentavos
        : null,
    quantidade: i.quantidade !== null && Number.isFinite(i.quantidade) ? i.quantidade : null,
    confianca:
      i.valorTotalCentavos === null ? "nao_identificado" : (i.confianca as Confianca),
  }));

  const total = confrontarItens(avaliarTotal(bruta.totalCentavos), itens);

  return {
    estabelecimento: texto(bruta.estabelecimento),
    cnpj: texto(bruta.cnpj),
    data: avaliarData(bruta.data, hoje),
    hora: texto(bruta.hora),
    totalCentavos: total,
    formaPagamento: texto(bruta.formaPagamento),
    numeroDocumento: texto(bruta.numeroDocumento),
    itens,
  };
}

// ─────────────────────────── O BLOQUEIO ───────────────────────────

export type VereditoDaProposta =
  | { readonly pode: true }
  | {
      readonly pode: false;
      readonly campos: readonly string[];
      readonly motivo: string;
    };

/**
 * ⛔ O BOTÃO DE PROPOR NÃO EXISTE ATÉ ISTO DEVOLVER `pode: true`.
 *
 * Não é um aviso amarelo. Um aviso que dá para ignorar é ignorado — e o critério de aceite
 * é literal: *"confiança baixa impede ação automática"*. A ausência do caminho é a única
 * forma de bloqueio que este projeto considera bloqueio.
 *
 * ⚠️ Recebe a extração **já com as correções do dono aplicadas**. Corrigir um campo o traz
 * para `alta` — não porque o modelo melhorou, mas porque quem preencheu foi o dono, que é
 * a autoridade final sobre o próprio comprovante.
 */
export function podePropor(extracao: ExtracaoDeComprovante): VereditoDaProposta {
  const problemas: string[] = [];

  if (ehIncerta(extracao.totalCentavos.confianca) || extracao.totalCentavos.valor === null) {
    problemas.push(ROTULO_DO_CAMPO.totalCentavos);
  }
  if (ehIncerta(extracao.data.confianca) || extracao.data.valor === null) {
    problemas.push(ROTULO_DO_CAMPO.data);
  }

  if (problemas.length === 0) return { pode: true };

  return {
    pode: false,
    campos: problemas,
    motivo:
      problemas.length === 1
        ? `Confirme ${problemas[0]} antes de continuar — a leitura não ficou segura.`
        : `Confirme ${problemas.join(" e ")} antes de continuar — a leitura não ficou segura.`,
  };
}

/**
 * Aplica uma correção do dono a um campo. O valor passa a ser dele, e a confiança vira
 * `alta` **com o motivo registrando quem preencheu** — a tela precisa distinguir "o modelo
 * leu com clareza" de "o dono digitou", e as duas coisas seriam `alta` sem o motivo.
 */
export function corrigir<T>(valor: T): Campo<T> {
  return { valor, confianca: "alta", motivo: "Preenchido por você." };
}

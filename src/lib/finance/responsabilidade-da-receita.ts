/**
 * REDESIGN-03-C · A1 — De quem é o dinheiro que ENTROU (lógica PURA, testada em
 * responsabilidade-da-receita.test.ts).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ RECEITA NÃO USA A MÁQUINA DE DIVISÃO.                                                  ║
 * ║                                                                                       ║
 * ║ Na despesa, `terceiro`/`compartilhada` exigem pessoa e geram `shared_expenses` +      ║
 * ║ `receivables` — alguém me deve. Na receita o sentido é o inverso: o dinheiro de outra ║
 * ║ pessoa passou pela minha conta, e esse "eu devo a alguém" não existe no modelo. Então ║
 * ║ aqui não há pessoa, não há recebível e não há `decidirReaplicacao`: a divisão de      ║
 * ║ despesa continua com UM núcleo só (split.ts + split-reapply.ts).                      ║
 * ║                                                                                       ║
 * ║ As três formas, gravadas no ato e nunca deduzidas da categoria (D8):                  ║
 * ║   pessoal       → valor_pessoal NULO (a convenção de sempre: lido como `amount`)      ║
 * ║   terceiro      → valor_pessoal 0                                                     ║
 * ║   compartilhada → valor_pessoal = a parte INFORMADA, com 0 < parte < valor            ║
 * ║                                                                                       ║
 * ║ ⛔ Ao reduzir o valor de uma compartilhada, a parte NÃO é recalculada em silêncio: a   ║
 * ║ combinação deixa de fechar e é recusada, e o dono decide de novo.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Quem PREVÊ (o formulário, na linha "de terceiros: R$ X") e quem GRAVA (`criarTransacao`,
 * `updateTransaction`) chamam esta mesma função — por isso ela não importa `zod` nem
 * `server-only`: a tela a importa direto.
 *
 * ⛔ Reembolso não é receita de terceiro. Ligar a entrada ao recebível é da 03-D.
 */
import type { Classificacao } from "@/lib/finance/constants";
import { centavosParaReais } from "@/lib/format";

/**
 * A responsabilidade gravada. A união torna a combinação incoerente IRREPRESENTÁVEL: não há
 * como escrever `terceiro` com valor nulo, `terceiro` com valor diferente de zero, nem
 * `pessoal` com valor.
 */
export type ResponsabilidadeDaReceita =
  | { readonly classificacao: "pessoal"; readonly valorPessoalCentavos: null }
  | { readonly classificacao: "terceiro"; readonly valorPessoalCentavos: 0 }
  | { readonly classificacao: "compartilhada"; readonly valorPessoalCentavos: number };

export type DecisaoDaReceita =
  | {
      readonly ok: true;
      readonly responsabilidade: ResponsabilidadeDaReceita;
      /** O que não é meu, em centavos — é a prévia "de terceiros: R$ X" da tela. */
      readonly terceirosCentavos: number;
    }
  | {
      readonly ok: false;
      /** Sempre o campo que existe na tela, para o erro ser destacado nele. */
      readonly campo: "receita_minha_parte";
      readonly mensagem: string;
    };

export const MSG_PARTE_FORA_DA_COMPARTILHADA = "A sua parte só vale para entrada compartilhada.";
export const MSG_PARTE_AUSENTE = "Informe a sua parte desta entrada.";
export const MSG_PARTE_ZERO = "Se nada desta entrada é seu, marque como de terceiro.";
export const MSG_PARTE_TOTAL = "Se a entrada é toda sua, marque como pessoal.";

const recusa = (mensagem: string): DecisaoDaReceita => ({
  ok: false,
  campo: "receita_minha_parte",
  mensagem,
});

/**
 * Decide a responsabilidade de uma receita. Centavos inteiros na entrada (o chamador converte
 * com `reaisParaCentavos`); nada é arredondado aqui.
 *
 * A "minha parte" só existe na compartilhada. Informá-la em `pessoal` ou `terceiro` —
 * inclusive como 0 — é recusado, em vez de ignorado: o sistema não escolhe qual dos dois
 * campos o dono quis dizer.
 */
export function decidirResponsabilidadeDaReceita(args: {
  classificacao: Classificacao;
  minhaParteCentavos: number | null;
  valorCentavos: number;
}): DecisaoDaReceita {
  const { classificacao, minhaParteCentavos: parte, valorCentavos: valor } = args;

  if (classificacao === "pessoal") {
    if (parte !== null) return recusa(MSG_PARTE_FORA_DA_COMPARTILHADA);
    return {
      ok: true,
      responsabilidade: { classificacao: "pessoal", valorPessoalCentavos: null },
      terceirosCentavos: 0,
    };
  }

  if (classificacao === "terceiro") {
    if (parte !== null) return recusa(MSG_PARTE_FORA_DA_COMPARTILHADA);
    return {
      ok: true,
      responsabilidade: { classificacao: "terceiro", valorPessoalCentavos: 0 },
      terceirosCentavos: valor,
    };
  }

  if (parte === null) return recusa(MSG_PARTE_AUSENTE);
  if (parte <= 0) return recusa(MSG_PARTE_ZERO);
  if (parte >= valor) return recusa(MSG_PARTE_TOTAL);
  return {
    ok: true,
    responsabilidade: { classificacao: "compartilhada", valorPessoalCentavos: parte },
    terceirosCentavos: valor - parte,
  };
}

/**
 * As colunas de `transactions` para uma responsabilidade decidida. É o ÚNICO ponto que
 * converte para reais — `valor_pessoal` é `numeric(14,2)` em REAIS (invariante 63), e criar e
 * editar chamam esta função para que as duas gravações não divirjam no arredondamento.
 */
export function colunasDaReceita(r: ResponsabilidadeDaReceita): {
  classificacao: Classificacao;
  valor_pessoal: number | null;
} {
  switch (r.classificacao) {
    case "pessoal":
      return { classificacao: "pessoal", valor_pessoal: null };
    case "terceiro":
      return { classificacao: "terceiro", valor_pessoal: 0 };
    case "compartilhada":
      return {
        classificacao: "compartilhada",
        valor_pessoal: centavosParaReais(r.valorPessoalCentavos),
      };
  }
}

/**
 * Fase 06 — Detecção de duplicados (CORAÇÃO da fase; lógica PURA, testada em dedup.test.ts).
 *
 * Regra crítica do projeto: "não duplicar transações importadas". Comparamos cada linha por
 * uma CHAVE COMPOSTA — data + valor(centavos) + descrição normalizada + alvo (cartão/conta) —
 * contra:
 *   (1) o que JÁ EXISTE no sistema (transações do mesmo cartão/conta), e
 *   (2) o próprio lote (linha repetida no arquivo) — reforçada pelo identificador (ex.: FITID
 *       do OFX) quando presente.
 * Duplicatas são marcadas `duplicada` e NÃO entram por padrão; o usuário pode forçar a
 * importação caso confirme que não é duplicata (ação explícita na revisão).
 */
import { normalizarDescricao } from "@/lib/import/normalize";
import type { NormalizedRow } from "@/lib/import/types";

/**
 * Chave composta de duplicidade. Retorna null quando faltam data ou valor (linha inválida,
 * que não participa da dedup). `targetId` = id do cartão (origem cartão) ou da conta.
 */
export function chaveComposta(
  dataNorm: string | null,
  valorCentavos: number | null,
  descricao: string,
  targetId: string | null,
): string | null {
  if (!dataNorm || valorCentavos == null) return null;
  return [
    dataNorm,
    valorCentavos,
    normalizarDescricao(descricao),
    targetId ?? "",
  ].join("|");
}

/**
 * Marca duplicatas em `rows`. Linhas válidas e não-duplicadas passam a `para_importar`
 * (entram por padrão); duplicatas viram `duplicada` com motivo; linhas em `erro` ou já
 * `ignorada` (ex.: pagamento da fatura auto-ignorado no mapeamento) são mantidas como estão.
 * `existingKeys` é o conjunto de chaves compostas das transações já existentes do alvo
 * (montado no servidor com `chaveComposta`).
 *
 * ⚠️ **O identificador do arquivo (FITID do OFX) MANDA nos dois sentidos** — regra que veio de
 * dois falsos positivos reais numa mesma fatura (2026-08-06):
 *
 * - Duas compras iguais no mesmo dia (mesma loja, mesmo valor) **não são duplicata** quando
 *   trazem FITID diferente: o arquivo já afirmou que são transações distintas, e a chave
 *   composta sozinha não tem como saber disso.
 * - Mesmo FITID **não basta** para acusar duplicata: o Nubank reusa o identificador entre o
 *   "Crédito de parcelamento de compra" e a 1ª parcela — valores e sentidos diferentes, mesmo
 *   FITID. Só é duplicata quando a chave composta também bate.
 *
 * Contra o que já existe no sistema (`existingKeys`) a chave composta continua sozinha: as
 * transações não guardam o identificador do arquivo de origem.
 */
export function detectarDuplicados(
  rows: NormalizedRow[],
  existingKeys: Set<string>,
  targetId: string | null,
): NormalizedRow[] {
  // composta → identificador da 1ª linha que a ocupou (null = linha sem identificador).
  const vistasComposta = new Map<string, string | null>();
  // identificador → composta da 1ª linha que o usou.
  const vistasIdent = new Map<string, string | null>();

  return rows.map((r) => {
    if (r.status === "erro" || r.status === "ignorada") return r;

    const composta = chaveComposta(
      r.dataNorm,
      r.valorCentavos,
      r.descricao,
      targetId,
    );
    const ident = r.identificador
      ? `${targetId ?? ""}|${r.identificador}`
      : null;

    if (composta && existingKeys.has(composta)) {
      return {
        ...r,
        status: "duplicada" as const,
        motivo: "Já existe um lançamento idêntico no sistema.",
      };
    }
    // Mesmo identificador só acusa duplicata se a linha for de fato a mesma (chave composta
    // igual) — senão é o FITID reaproveitado pelo banco entre lançamentos diferentes.
    if (ident && vistasIdent.has(ident) && vistasIdent.get(ident) === composta) {
      return {
        ...r,
        status: "duplicada" as const,
        motivo: "Linha repetida no arquivo (mesmo identificador).",
      };
    }
    if (composta && vistasComposta.has(composta)) {
      const identAnterior = vistasComposta.get(composta) ?? null;
      // Identificadores diferentes = o arquivo afirma que são duas transações distintas.
      // Sem identificador em uma das duas não dá para afirmar nada: mantém o aviso, que o
      // usuário resolve na revisão.
      const distintasPeloIdentificador =
        ident != null && identAnterior != null && ident !== identAnterior;
      if (!distintasPeloIdentificador) {
        return {
          ...r,
          status: "duplicada" as const,
          motivo: "Linha repetida no arquivo.",
        };
      }
    }

    if (composta && !vistasComposta.has(composta)) {
      vistasComposta.set(composta, ident);
    }
    if (ident && !vistasIdent.has(ident)) vistasIdent.set(ident, composta);
    return { ...r, status: "para_importar" as const, motivo: null };
  });
}

/** Conta linhas por status (para os contadores da pré-visualização). */
export function contarPorStatus(
  rows: NormalizedRow[],
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}

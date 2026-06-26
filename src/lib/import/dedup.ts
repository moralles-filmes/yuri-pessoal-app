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
 * (entram por padrão); duplicatas viram `duplicada` com motivo; linhas em `erro` são mantidas.
 * `existingKeys` é o conjunto de chaves compostas das transações já existentes do alvo
 * (montado no servidor com `chaveComposta`).
 */
export function detectarDuplicados(
  rows: NormalizedRow[],
  existingKeys: Set<string>,
  targetId: string | null,
): NormalizedRow[] {
  const vistasComposta = new Set<string>();
  const vistasIdent = new Set<string>();

  return rows.map((r) => {
    if (r.status === "erro") return r;

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
    if (ident && vistasIdent.has(ident)) {
      return {
        ...r,
        status: "duplicada" as const,
        motivo: "Linha repetida no arquivo (mesmo identificador).",
      };
    }
    if (composta && vistasComposta.has(composta)) {
      return {
        ...r,
        status: "duplicada" as const,
        motivo: "Linha repetida no arquivo.",
      };
    }

    if (composta) vistasComposta.add(composta);
    if (ident) vistasIdent.add(ident);
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

/**
 * REDESIGN-05-C · T9 — os dois blocos da tela de /parcelamentos. PURO.
 *
 * Só organiza o que `derive` (a tela) já decidiu: o `status` de cada compra é derivado na leitura
 * e entra pronto. Nada aqui recalcula valor nem decide status.
 *
 * - `emAndamento`: compras `ativo`, a que termina antes primeiro (é a que mais cobra atenção);
 * - `encerrados`: `finalizado` e `cancelado`, a que terminou mais recentemente primeiro;
 * - sem data da última parcela (`ultima: null`), o item vai para o FIM nos dois grupos — ausência
 *   de data não é "a mais antiga" nem "a mais nova".
 *
 * Com `status` ligado no filtro, só o grupo daquele status tem itens (o outro fica vazio e a tela
 * não o desenha).
 */
import type { InstallmentPurchaseStatus } from "./constants";

type ComStatusEUltima = {
  status: InstallmentPurchaseStatus;
  ultima: string | null;
};

/** `a` antes de `b`; `null` sempre depois; `sentido` 1 = crescente, -1 = decrescente. */
function porUltima(
  a: string | null,
  b: string | null,
  sentido: 1 | -1,
): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -sentido : sentido;
}

export function agruparParcelamentos<T extends ComStatusEUltima>(
  itens: readonly T[],
  status: string | null,
): { emAndamento: T[]; encerrados: T[] } {
  const filtrados = status ? itens.filter((i) => i.status === status) : itens;
  const emAndamento = filtrados
    .filter((i) => i.status === "ativo")
    .sort((a, b) => porUltima(a.ultima, b.ultima, 1));
  const encerrados = filtrados
    .filter((i) => i.status === "finalizado" || i.status === "cancelado")
    .sort((a, b) => porUltima(a.ultima, b.ultima, -1));
  return { emAndamento, encerrados };
}

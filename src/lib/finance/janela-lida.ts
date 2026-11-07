/**
 * A janela ADIANTE que as telas leem: a projeção de 6 meses a partir do mês atual. Fonte única —
 * `janelaDoRelatorio` (pipeline) e a gaveta de detalhe consomem daqui, para a janela e o aviso
 * "fora do período lido" nunca divergirem.
 *
 * ⛔ Zero imports: este arquivo vai para o bundle do cliente (o painel o lê). Aritmética de inteiros
 * sobre 'AAAA-MM', sem `Date` e sem fuso.
 */
export const MESES_DA_PROJECAO = 6;

/** Soma `k` meses a um 'AAAA-MM' e devolve 'AAAA-MM'. */
function somaMeses(mes: string, k: number): string {
  const [ano, mesDoAno] = mes.split("-").map(Number);
  const total = ano * 12 + (mesDoAno - 1) + k;
  const anoNovo = Math.floor(total / 12);
  const mesNovo = total - anoNovo * 12 + 1;
  return `${String(anoNovo).padStart(4, "0")}-${String(mesNovo).padStart(2, "0")}`;
}

/** O último mês que a janela lê: o mês atual + (MESES_DA_PROJECAO − 1). */
export function ultimoMesLido(mesAtual: string): string {
  return somaMeses(mesAtual, MESES_DA_PROJECAO - 1);
}

/**
 * `mes` se ele está além da janela lida, senão `null`. Quando devolve texto, é o último mês lido
 * ('AAAA-MM') — o que a tela precisa para dizer "até MM/AAAA".
 */
export function foraDaJanelaLida(mes: string, mesAtual: string): string | null {
  const ultimo = ultimoMesLido(mesAtual);
  return mes > ultimo ? ultimo : null;
}

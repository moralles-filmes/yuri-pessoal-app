"use client";

import * as React from "react";

/**
 * Decide quando um diálogo carregado sob demanda deve estar montado (P3 da auditoria de
 * performance, F-003).
 *
 * ═══════════ O PROBLEMA QUE ELE RESOLVE ═══════════
 *
 * Um diálogo que fica sempre montado (`<Dialog open={x} />`) é baixado junto com a página,
 * mesmo que nunca seja aberto — e são eles que arrastam `zod` + `react-hook-form` para o
 * primeiro byte das telas de cadastro. Trocar por `{aberto && <Dialog />}` resolveria o peso,
 * mas **quebraria a animação de fechamento**: ao fechar, o componente desapareceria no mesmo
 * quadro em que o Radix começaria a desmontá-lo, e o diálogo sumiria com um corte seco.
 *
 * Então a regra é: **monta na primeira abertura e não desmonta mais.** Antes do primeiro
 * clique, nada é baixado; depois dele, o diálogo se comporta exatamente como antes — inclusive
 * ao fechar. O custo é um componente montado a mais numa tela onde o usuário já demonstrou que
 * o queria.
 *
 * ⚠️ O ajuste é feito DURANTE o render, não num efeito. É o padrão de estado derivado que o
 * React documenta ("adjusting state when a prop changes"): o React refaz o render na hora, sem
 * pintar o quadro intermediário. Num `useEffect` haveria um quadro de atraso a cada primeira
 * abertura — e a regra `react-hooks/set-state-in-effect` recusa esse caminho, com razão.
 */
export function useLazyDialog(open: boolean): boolean {
  const [mounted, setMounted] = React.useState(open);

  if (open && !mounted) setMounted(true);

  return mounted;
}

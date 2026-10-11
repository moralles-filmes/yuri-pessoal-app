/**
 * REDESIGN-07-C · V — os atributos de uma barra de progresso com NOME.
 *
 * Uma `<div>` com largura em `style` não é anunciada; `role="progressbar"` sem nome é lida só
 * como "barra de progresso". As barras de Dieta e Treinos passam por aqui para dizer O QUE
 * medem e QUANTO, com o valor real em `aria-valuetext`.
 *
 * `aria-valuenow` não pode passar de `aria-valuemax` (o leitor de tela recorta ou ignora), mas
 * 120% da meta é um fato: o número limitado vai em `aria-valuenow` e o real, no texto. Sem
 * percentual (meta zero, valor não medido) não há `aria-valuenow` — "0%" mentiria.
 *
 * Módulo puro, sem import: a tela o lê, e ele não pode arrastar nada para o bundle.
 */
export type AriaDeProgresso = {
  role: "progressbar";
  "aria-label": string;
  "aria-valuemin": 0;
  "aria-valuemax": 100;
  "aria-valuenow": number | undefined;
  "aria-valuetext": string;
};

export function ariaDeProgresso(
  rotulo: string,
  percentual: number | null,
  /** O que o leitor de tela diz no lugar do número. Padrão: "N%" (ou "sem percentual"). */
  texto?: string,
): AriaDeProgresso {
  const real = percentual === null || !Number.isFinite(percentual) ? null : Math.round(percentual);
  return {
    role: "progressbar",
    "aria-label": rotulo,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": real === null ? undefined : Math.min(100, Math.max(0, real)),
    "aria-valuetext": texto ?? (real === null ? "sem percentual" : `${real}%`),
  };
}

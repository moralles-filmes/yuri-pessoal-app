/**
 * Texto com dinheiro dentro de uma área coberta pelo `OlhoDosValores`: some e dá lugar a "R$ ••••"
 * com o olho fechado — o MESMO seletor do `Indicador` (`group-data-[ocultar=true]/olho`). O leitor
 * de tela ouve "valor oculto".
 *
 * Sem `"use client"` de propósito: o olho age só por CSS, então a peça serve a Server Components
 * (o `BlocoDoCaixa`, o relatório). Fora de um `OlhoDosValores` o seletor não casa e o texto
 * aparece normalmente — é o caso do bloco do caixa no painel.
 */
export function ValorComOlho({ texto }: { texto: string }) {
  return (
    <>
      <span className="group-data-[ocultar=true]/olho:hidden">{texto}</span>
      <span aria-hidden="true" className="hidden group-data-[ocultar=true]/olho:inline">
        R$ ••••
      </span>
      <span className="hidden group-data-[ocultar=true]/olho:inline">
        <span className="sr-only">valor oculto</span>
      </span>
    </>
  );
}

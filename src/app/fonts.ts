import { Inter } from "next/font/google";

/**
 * Fonte de reserva (09-A, spec 6.4): o corpo usa a fonte do sistema (SF no Apple) e a Inter
 * só entra onde ela não existe. `preload: false` impede o `<link rel="preload">`: quem tem a
 * fonte do sistema nunca baixa a Inter, e a rede que não é usada não é paga.
 *
 * Mora aqui (e não no layout) porque o `global-error.tsx` SUBSTITUI o layout raiz quando ele
 * cai e precisa da mesma variável CSS; `next/font` exige a chamada literal em módulo, então
 * as duas telas importam esta instância em vez de repeti-la.
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-inter",
});

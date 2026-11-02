"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { VistaDaGaveta } from "@/lib/painel/gaveta";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";

/**
 * REDESIGN-04-B (D-B-1, D-B-15) — a gaveta de "os registros por trás deste número", peça comum
 * do painel e do relatório.
 *
 * Quem abre é a URL (`?detalhe=…`): a página monta o detalhe no servidor, a partir das MESMAS
 * entradas do número, e o entrega como vista pronta (`vistaDaGaveta`, textos já formatados — as
 * peças não importam `@/lib/finance`). Esta fachada só a desenha. Fechar tira o parâmetro da URL.
 *
 * ⛔ Duas regras que esta fachada existe para cumprir:
 *  - o `Sheet` (e a lista) chegam por `next/dynamic`: sem abrir, nada disso entra no manifest da
 *    rota (regra 2 do carregamento sob demanda);
 *  - a ÚLTIMA vista vive AQUI, fora da gaveta (invariante 95). Ao fechar, a URL perde o
 *    parâmetro e o servidor manda `null`; sem esta cópia a animação de saída desenharia vazio.
 *    `SheetContent` desmonta os filhos ao fechar — o estado não pode morar lá dentro.
 */
const GavetaDeRegistrosImpl = dynamic(
  () => import("./gaveta-de-registros-impl").then((m) => m.GavetaDeRegistrosImpl),
  { ssr: false },
);

export function GavetaDeRegistros({
  vista,
  urlAoFechar,
  linkLancamentos,
  linkContas = null,
}: {
  vista: VistaDaGaveta | null;
  urlAoFechar: string;
  linkLancamentos: string;
  /** Só na gaveta do saldo: o rodapé leva às contas em vez de Lançamentos. */
  linkContas?: string | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(vista !== null);
  const [ultimo, setUltimo] = useState<VistaDaGaveta | null>(vista);
  const [visto, setVisto] = useState<VistaDaGaveta | null>(vista);
  // O link das contas acompanha a ÚLTIMA vista: na animação de fechar a URL já o perdeu.
  const [ultimoLinkContas, setUltimoLinkContas] = useState<string | null>(linkContas);

  // Estado derivado DURANTE o render (o padrão de `useLazyDialog`): uma vista nova da URL abre a
  // gaveta e passa a ser a última; `null` não apaga a última (a animação de fechar o usa).
  if (vista !== visto) {
    setVisto(vista);
    if (vista !== null) {
      setUltimo(vista);
      setUltimoLinkContas(linkContas);
      setAberto(true);
    } else {
      setAberto(false);
    }
  }

  const montado = useLazyDialog(aberto);
  if (!montado || ultimo === null) return null;

  function aoFechar() {
    setAberto(false);
    router.replace(urlAoFechar, { scroll: false });
  }

  return (
    <GavetaDeRegistrosImpl
      aberto={aberto}
      aoFechar={aoFechar}
      vista={ultimo}
      linkLancamentos={linkLancamentos}
      linkContas={ultimoLinkContas}
    />
  );
}

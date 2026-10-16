"use client";

import * as React from "react";

/**
 * Mantém o ÚLTIMO item não nulo enquanto um diálogo ou gaveta anima o fechamento
 * (REDESIGN-07-C).
 *
 * ═══════════ O PROBLEMA QUE ELE RESOLVE ═══════════
 *
 * Diálogo de detalhe abre quando um item é escolhido e fecha quando ele volta a `null`:
 * `open={item !== null}`. Só que o conteúdo também lê o item — e no mesmo render em que o
 * Radix começa a animação de saída, `item` já é `null`. O componente devolvia `null`
 * (`if (!item) return null`) ou o pai o tirava da árvore (`{item && <Dialog/>}`), e o diálogo
 * sumia com um corte seco, ou deslizava para fora vazio.
 *
 * Com o hook, o conteúdo continua desenhado com o último item até o Radix desmontá-lo; o
 * `open` continua vindo do item ATUAL.
 *
 * ⚠️ O item tem de ser uma referência ESTÁVEL entre renders (estado, prop, elemento de uma
 * lista que já existe) — nunca um objeto montado no próprio render (`{ ...x }`, `.map()`),
 * que mudaria de identidade a cada render e faria o ajuste de estado abaixo se repetir sem fim.
 *
 * O ajuste é feito DURANTE o render (o padrão de estado derivado que o React documenta, o
 * mesmo de `useLazyDialog`), não num efeito: num efeito haveria um quadro com o item velho a
 * cada troca.
 */
export function useItemRetido<T>(item: T | null | undefined): T | null {
  const [retido, setRetido] = React.useState<T | null>(item ?? null);

  if (item != null && item !== retido) setRetido(item);

  return item ?? retido;
}

/**
 * Uma chave nova a cada ABERTURA (fechado → aberto); fechar não muda a chave.
 *
 * Diálogo que era montado com `{aberto && <Dialog/>}` nascia limpo a cada abertura. Com
 * `useLazyDialog` ele passa a ficar montado — e guardaria o que foi digitado da última vez.
 * `key={useChaveDeAbertura(aberto)}` devolve o "nasce limpo" sem tirar a animação de saída:
 * ao fechar a chave fica igual (o Radix anima), ao reabrir ela muda (o React remonta).
 */
export function useChaveDeAbertura(aberto: boolean): number {
  const [estado, setEstado] = React.useState({ aberto, chave: 0 });

  if (aberto !== estado.aberto) {
    const chave = aberto ? estado.chave + 1 : estado.chave;
    setEstado({ aberto, chave });
    return chave;
  }

  return estado.chave;
}

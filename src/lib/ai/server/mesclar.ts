import "server-only";

/**
 * Coordenador · Task 11 — `mesclar`: as trilhas em paralelo num gerador só.
 *
 * O coordenador e os especialistas são TRILHAS de um mesmo run (spec §5.1), e cada uma é um
 * gerador (`runTrilha`). Quem as junta precisa entregar cada evento NO MOMENTO em que chega,
 * e não na ordem das fontes — senão a tela de um especialista lento seguraria a narração de um
 * rápido. Por isso cada fonte tem um `next()` pendente o tempo todo, e o primeiro a resolver
 * é o que sai.
 *
 * ⚠️ O retorno (`R`) é guardado por ÍNDICE, não pela ordem de chegada. Quem consome o retorno
 * (o desfecho de cada trilha) lê `retornos[0]` como sendo a trilha 0; invertê-los trocaria
 * desfechos entre trilhas sem nenhum erro aparente.
 *
 * ⛔ `return()` do consumidor fecha TODA fonte ainda viva, no `finally`. Sem isso, a trilha
 * que ainda estava gerando (e cobrando) continuaria depois de a aba ter sido fechada. Uma
 * fonte viva é a que não terminou nem falhou: a que está com `next()` pendente, ou a que
 * acabou de emitir e aguarda o próximo pedido.
 *
 * ⚠️ Erro de uma fonte sobe DEPOIS de fechar as outras — o `finally` roda antes da exceção
 * sair do gerador. `runTrilha` não lança por contrato, mas a mescla não depende disso.
 */

/** O que cada fonte devolve quando o `next()` pendente resolve ou rejeita. */
type Chegada<T, R> =
  | { readonly indice: number; readonly ok: true; readonly resultado: IteratorResult<T, R> }
  | { readonly indice: number; readonly ok: false; readonly erro: unknown };

export async function* mesclar<T, R>(
  fontes: readonly AsyncGenerator<T, R>[],
): AsyncGenerator<{ readonly indice: number; readonly evento: T }, readonly R[]> {
  const retornos: R[] = new Array<R>(fontes.length);
  // `true` enquanto a fonte não terminou nem falhou. Separado do mapa de pendentes de propósito:
  // a fonte que acabou de emitir NÃO está pendente enquanto o consumidor a processa, e ainda
  // assim precisa ser fechada se o consumidor abandonar agora.
  const viva: boolean[] = fontes.map(() => true);
  const pendentes = new Map<number, Promise<Chegada<T, R>>>();

  const pedir = (indice: number): void => {
    pendentes.set(
      indice,
      fontes[indice].next().then(
        (resultado): Chegada<T, R> => ({ indice, ok: true, resultado }),
        (erro: unknown): Chegada<T, R> => ({ indice, ok: false, erro }),
      ),
    );
  };

  try {
    for (let indice = 0; indice < fontes.length; indice += 1) pedir(indice);

    while (pendentes.size > 0) {
      const chegada = await Promise.race(pendentes.values());
      pendentes.delete(chegada.indice);

      if (!chegada.ok) {
        viva[chegada.indice] = false;
        throw chegada.erro;
      }

      if (chegada.resultado.done) {
        viva[chegada.indice] = false;
        retornos[chegada.indice] = chegada.resultado.value;
        continue;
      }

      yield { indice: chegada.indice, evento: chegada.resultado.value };
      pedir(chegada.indice);
    }

    return retornos;
  } finally {
    // Fecha em paralelo e não deixa uma fonte que falhe ao fechar impedir as outras. Quando o
    // `next()` pendente ainda está correndo, o `return()` entra na fila dele e só age depois.
    await Promise.allSettled(
      fontes.flatMap((fonte, indice) =>
        viva[indice] ? [fonte.return(undefined as R)] : [],
      ),
    );
  }
}

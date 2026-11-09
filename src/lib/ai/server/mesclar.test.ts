/**
 * Coordenador · Task 11 — `mesclar`, as trilhas em paralelo num gerador só.
 *
 * Os atrasos são reais e curtos (0–20 ms) e todo gerador de teste termina ou é fechado por quem
 * chama, então nenhum timer sobra depois da suíte.
 */

import { describe, expect, it } from "vitest";
import { mesclar } from "./mesclar";

const espera = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Emite `valor` depois de `ms` e devolve `retorno`. */
async function* comAtraso<T, R>(ms: number, valor: T, retorno: R): AsyncGenerator<T, R> {
  await espera(ms);
  yield valor;
  return retorno;
}

/** Só devolve `retorno`, depois de `ms`, sem emitir nada. */
async function* soRetorno<R>(ms: number, retorno: R): AsyncGenerator<never, R> {
  await espera(ms);
  return retorno;
}

/** Emite para sempre, a cada `ms`, e marca `fechou[indice]` quando alguém o fecha. */
function vivaParaSempre(
  indice: number,
  ms: number,
  fechou: boolean[],
): AsyncGenerator<number, void> {
  return (async function* () {
    try {
      for (;;) {
        await espera(ms);
        yield indice;
      }
    } finally {
      fechou[indice] = true;
    }
  })();
}

describe("mesclar", () => {
  it("entrega na ordem de chegada: a fonte mais rápida sai primeiro", async () => {
    const mesclado = mesclar([comAtraso(20, "a", "ra"), comAtraso(0, "b", "rb")]);

    const primeiro = await mesclado.next();

    expect(primeiro.done).toBe(false);
    expect(primeiro.value).toEqual({ indice: 1, evento: "b" });
    // Consome o resto para não deixar a fonte lenta pendurada.
    while (!(await mesclado.next()).done);
  });

  it("devolve os retornos na ordem das fontes, não na ordem de chegada", async () => {
    // A fonte 0 termina por último; a 1 termina primeiro. O retorno sai como [0, 1].
    const mesclado = mesclar([soRetorno(20, "primeiro"), soRetorno(0, "segundo")]);

    let fim = await mesclado.next();
    while (!fim.done) fim = await mesclado.next();

    expect(fim.value).toEqual(["primeiro", "segundo"]);
  });

  it("return() do mesclado fecha as fontes vivas", async () => {
    const fechou = [false, false];
    const mesclado = mesclar([
      vivaParaSempre(0, 5, fechou),
      vivaParaSempre(1, 10, fechou),
    ]);

    // Consome um evento e abandona: as duas fontes continuam vivas neste ponto.
    const primeiro = await mesclado.next();
    expect(primeiro.done).toBe(false);

    await mesclado.return([]);

    expect(fechou).toEqual([true, true]);
  });

  it("erro de uma fonte fecha as outras e sobe", async () => {
    const fechou = [false, false];
    async function* falha(): AsyncGenerator<number, void> {
      await espera(5);
      throw new Error("falha da fonte");
    }
    const mesclado = mesclar<number, void>([falha(), vivaParaSempre(1, 10, fechou)]);

    await expect(
      (async () => {
        for (;;) {
          const passo = await mesclado.next();
          if (passo.done) return;
        }
      })(),
    ).rejects.toThrow("falha da fonte");

    expect(fechou[1]).toBe(true);
  });
});

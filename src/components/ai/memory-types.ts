/**
 * Fase 18-F · Bloco 3 — IA · O que a tela de memória recebe do servidor.
 *
 * ⚠️ MÓDULO PRÓPRIO, E SEM UM ÚNICO IMPORT — de propósito. O tipo é compartilhado entre
 * `memory-client.tsx` (sempre baixado) e `memory-form-dialog.tsx` (sob demanda); declará-lo no
 * client faria o diálogo importar o client, e declará-lo no diálogo faria o client importar o
 * diálogo — e nos dois casos o `next/dynamic` deixaria de separar coisa alguma.
 *
 * ⚠️ Repare no que NÃO desce: `expiresAt` cru (`timestamptz`) e o estado por derivar. O
 * servidor já resolveu os dois — `estadoDaMemoria` puxa `@/lib/format`, e `date-fns` atrás
 * dele, que não tem por que chegar ao navegador só para escrever um selo.
 */
export type MemoriaNaLista = {
  readonly id: string;
  readonly conteudo: string;
  readonly modulo: string | null;
  readonly estado: "vigente" | "expirada" | "desativada" | "esquecida";
  readonly rotuloDoEstado: string;
  /** `yyyy-MM-dd` em Brasília, quando há prazo e ele ainda não venceu. */
  readonly prazo: string | null;
  /** `yyyy-MM-dd` em Brasília, só quando já venceu. Expirar NÃO apaga. */
  readonly expirouEm: string | null;
  readonly origem: "dono" | "ia";
  readonly criadaEm: string;
};

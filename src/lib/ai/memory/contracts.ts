/**
 * Fase 18-F · Bloco 3 — IA · O vocabulário da memória. Puro, e SEM UM ÚNICO IMPORT.
 *
 * A ausência de import não é elegância: este arquivo é lido pela TELA (o contador de
 * caracteres, os rótulos de módulo), e a regra 3 do carregamento sob demanda diz que
 * constante lida pela tela não mora junto do `zod`.
 */

/**
 * Os módulos a que uma memória pode ser amarrada. `null` = vale para todos os agentes.
 *
 * ⚠️ É o MESMO vocabulário de `ToolDescriptor.module`, e há teste comparando os dois
 * (`state.test.ts`). Escrito à mão aqui, e não derivado do registry, por duas razões: este
 * arquivo não pode importar nada, e o CHECK do banco precisa de uma lista literal para
 * espelhar. O teste é o que impede as duas de divergirem.
 */
export const MODULOS_DE_MEMORIA = [
  "finance",
  "nutrition",
  "training",
  "body",
  "todo",
  "calendar",
  "tasks",
  "habits",
  "studies",
] as const;

export type ModuloDeMemoria = (typeof MODULOS_DE_MEMORIA)[number];

export function ehModuloDeMemoria(valor: unknown): valor is ModuloDeMemoria {
  return (
    typeof valor === "string" && (MODULOS_DE_MEMORIA as readonly string[]).includes(valor)
  );
}

/**
 * O que pode ter acontecido com uma memória.
 *
 * ⚠️ `excluida` não é um ESTADO — é um evento de uma linha que não existe mais. O estado
 * (`memory/state.ts`) só fala de memórias vivas; o evento sobrevive a elas, e é por isso que
 * `memory_id` não tem FK.
 */
export const EVENTOS_DE_MEMORIA = [
  "criada",
  "editada",
  "desativada",
  "reativada",
  "esquecida",
  "excluida",
] as const;

export type EventoDeMemoria = (typeof EVENTOS_DE_MEMORIA)[number];

/** Quem originou a memória ou o evento. Nunca deduzido: sempre declarado por quem escreve. */
export const ORIGENS_DE_MEMORIA = ["dono", "ia"] as const;
export type OrigemDeMemoria = (typeof ORIGENS_DE_MEMORIA)[number];

/**
 * O recorte de uma memória que o PROMPT vê: o texto e o módulo, nada mais.
 *
 * ⚠️ Declarado aqui, e não em `prompt.ts`, para `queries.ts` e `prompt.ts` dependerem os dois
 * do vocabulário em vez de um do outro. Sem prazo, sem origem e sem estado de propósito:
 * quem chega ao prompt já foi filtrado, e mandar junto o que não se usa é convidar o modelo a
 * usá-lo.
 */
export type MemoriaParaPrompt = {
  readonly id: string;
  readonly conteudo: string;
  readonly modulo: ModuloDeMemoria | null;
};

/**
 * ⚠️ O MESMO 300 do CHECK do banco, do `maxLength` do schema da ferramenta e do literal de
 * `forma.ts` (que não pode importar daqui). Quatro lugares, um número — e há teste comparando
 * cada um com este: `forma.test.ts` para o literal e `schema.test.ts` para o banco.
 */
export const MAX_MEMORIA = 300;

/**
 * Quantas memórias entram no prompt, no máximo.
 *
 * O teto é VISÍVEL (§6.4): quando há mais que isto, o bloco diz "Mostrando N de M". É a
 * invariante 29 aplicada ao prompt — teto que o leitor não enxerga é número que vira
 * afirmação errada.
 */
export const TETO_DE_MEMORIAS_NO_PROMPT = 20;

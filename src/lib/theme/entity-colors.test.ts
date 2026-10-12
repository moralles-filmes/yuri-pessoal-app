/**
 * REDESIGN-02-A — COR DE ENTIDADE NUNCA APONTA PARA O TOKEN DE MARCA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `primary` é uma decisão de IDENTIDADE VISUAL: ela muda quando o dono resolve mudar o  ║
 * ║ visual do app. Cor de entidade é DADO DELE — o projeto que ele marcou como "Dourado", ║
 * ║ a prioridade que ele deu à tarefa. Quando a segunda é implementada com a primeira, a  ║
 * ║ troca de identidade reescreve a escolha do dono SEM NADA NA TELA DENUNCIANDO.         ║
 * ║                                                                                       ║
 * ║ Era o caso de `TODO_COLOR_DOT.gold = "bg-primary"`: com a marca azul, todo projeto e  ║
 * ║ toda etiqueta marcados como "Dourado" ficariam idênticos aos marcados como "Azul" —   ║
 * ║ duas opções distintas da MESMA paleta renderizando igual.                             ║
 * ║                                                                                       ║
 * ║ O mesmo mecanismo, em escalas semânticas: `P2 Alta` e `Alta` usavam `primary` e       ║
 * ║ ficariam iguais ao vizinho `sky`; no calendário de consistência, `parcial`            ║
 * ║ (`bg-primary/45`) e `descanso` (`bg-sky-500/20`) viravam dois azuis pálidos lado a    ║
 * ║ lado. Estado que só se distingue por opacidade não se distingue.                      ║
 * ║                                                                                       ║
 * ║ ⛔ `treinado: "bg-primary"` CONTINUA certo e não é violação: ali o destaque É a marca, ║
 * ║ não uma escolha do dono. O que o teste proíbe é a marca ocupar o lugar de um dado.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  TODO_COLORS,
  TODO_COLOR_CHIP,
  TODO_COLOR_DOT,
  TODO_PRIORITIES,
  TODO_PRIORITY_BADGE,
  TODO_PRIORITY_FLAG,
} from "@/lib/todo/constants";

const SRC = path.resolve(__dirname, "..", "..");

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Recorta o corpo `{ … }` de uma declaração, pelo nome. Devolve "" se não achar. */
function corpoDe(codigo: string, declaracao: string): string {
  const inicio = codigo.indexOf(declaracao);
  if (inicio < 0) return "";
  const abre = codigo.indexOf("{", inicio);
  const fecha = codigo.indexOf("};", abre);
  return abre < 0 || fecha < 0 ? "" : codigo.slice(abre, fecha);
}

const badgesTarefas = semComentarios(
  fs.readFileSync(path.join(SRC, "components", "tasks", "badges.tsx"), "utf8"),
);
const calendario = semComentarios(
  fs.readFileSync(
    path.join(SRC, "components", "training", "consistency-calendar.tsx"),
    "utf8",
  ),
);

const prioridadeTarefas = corpoDe(badgesTarefas, "const PRIORITY_CLASSES");
const estadosCalendario = corpoDe(calendario, "const STATE_STYLE");

describe("REDESIGN-02-A — cor de entidade × token de marca", () => {
  it("a varredura leu código de verdade", () => {
    // Sem esta guarda, um caminho errado, um `const` renomeado ou um `semComentarios` que
    // comesse demais transformariam TODOS os `not.toContain` abaixo em tautologia — o teste
    // ficaria verde afirmando `"" não contém "primary"` e a regressão passaria batido.
    expect(prioridadeTarefas).toContain("urgente");
    expect(prioridadeTarefas).toContain("destructive");
    expect(estadosCalendario).toContain("treinado");
    expect(estadosCalendario).toContain("descanso");
  });

  it("a paleta de projetos/etiquetas do TO-DO não usa o token de marca", () => {
    for (const cor of TODO_COLORS) {
      expect(TODO_COLOR_DOT[cor], `TODO_COLOR_DOT.${cor}`).not.toMatch(/primary/);
      expect(TODO_COLOR_CHIP[cor], `TODO_COLOR_CHIP.${cor}`).not.toMatch(/primary/);
    }
  });

  it("as 8 cores de projeto/etiqueta são distinguíveis entre si", () => {
    // Duas opções da mesma paleta renderizando igual é indistinguível, para quem usa, de o
    // sistema ter perdido a escolha.
    expect(new Set(TODO_COLORS.map((c) => TODO_COLOR_DOT[c])).size).toBe(TODO_COLORS.length);
    expect(new Set(TODO_COLORS.map((c) => TODO_COLOR_CHIP[c])).size).toBe(TODO_COLORS.length);
  });

  it("`gold` continua existindo como opção", () => {
    // Apagar o token "resolveria" o acoplamento e ORFANARIA as linhas já gravadas com
    // `color = 'gold'` em todo_projects/todo_labels — `asColor` ainda cai nele como padrão.
    expect(TODO_COLORS).toContain("gold");
    expect(TODO_COLOR_DOT.gold).toMatch(/yellow/);
  });

  it("a escala de prioridade do TO-DO é semântica, não de marca", () => {
    for (const p of TODO_PRIORITIES) {
      expect(TODO_PRIORITY_FLAG[p], `TODO_PRIORITY_FLAG.${p}`).not.toMatch(/primary/);
      expect(TODO_PRIORITY_BADGE[p], `TODO_PRIORITY_BADGE.${p}`).not.toMatch(/primary/);
    }
    expect(new Set(TODO_PRIORITIES.map((p) => TODO_PRIORITY_FLAG[p])).size).toBe(
      TODO_PRIORITIES.length,
    );
  });

  it("a prioridade de Tarefas não usa o token de marca", () => {
    expect(prioridadeTarefas).not.toMatch(/primary/);
  });

  it("o calendário de consistência não põe dois azuis lado a lado", () => {
    // `parcial` é `bg-primary/45`. Com a marca azul, qualquer `sky` aqui vira o mesmo azul
    // pálido, e a grade passa a ter dois estados que só se separam por opacidade.
    expect(estadosCalendario).toMatch(/treinado:\s*"bg-primary/);
    expect(estadosCalendario).not.toMatch(/sky-/);
  });
});

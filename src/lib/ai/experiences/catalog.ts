/**
 * Fase 18-F · Bloco 4 — IA · O QUE CADA EXPERIÊNCIA LÊ. Puro, sem I/O.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ POR QUE NÃO DEIXAR O MODELO DIRIGIR.                                                ║
 * ║                                                                                       ║
 * ║ `MAX_TOOL_STEPS = 3` por tentativa. "Planejar meu dia" lê quatro módulos; eles cabem   ║
 * ║ num passo só SE o modelo pedir os quatro em paralelo (`MAX_TOOLS_POR_PASSO = 4`), o    ║
 * ║ que não é garantido. Pedindo um por vez, o teto corta antes do último e o panorama sai ║
 * ║ incompleto declarando corte — TODA MANHÃ. Determinismo num fluxo diário vale mais que  ║
 * ║ um prompt bem escrito.                                                                ║
 * ║                                                                                       ║
 * ║ ⛔ POR QUE NÃO COLETORES, COMO A 18-E. `insights/collectors/` é a TERCEIRA PORTA da    ║
 * ║ invariante 71 — leitura fora do Tool Registry, sem guard, sem teto de descriptor e sem ║
 * ║ linha em `ai_tool_calls`. A 18-E só a justificou porque os três controles voltavam por ║
 * ║ outro caminho. Aqui não há nada a justificar: as leituras já existem e já são          ║
 * ║ auditadas. NENHUMA PORTA NOVA É ABERTA NESTA SUBFASE.                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { Experiencia } from "./contracts";
import { MAX_FERRAMENTAS_POR_EXPERIENCIA } from "./contracts";
import { PROMPT_ENCERRAR_DIA, PROMPT_PLANEJAR_DIA, PROMPT_PLANEJAR_SEMANA } from "./prompt";

export { MAX_FERRAMENTAS_POR_EXPERIENCIA };

const SEM_ARGUMENTO = () => ({});

export const EXPERIENCIAS: readonly Experiencia[] = [
  {
    id: "planejar-dia",
    titulo: "Planejar meu dia",
    promptVersion: "experiencia-planejar-dia-v1",
    prompt: PROMPT_PLANEJAR_DIA,
    ferramentas: [
      // `dias: 1` = hoje. O schema do adapter exige `min(1)`; `0` seria recusado pelo Zod.
      { toolName: "todo.get_agenda", argumentos: () => ({ dias: 1 }) },
      { toolName: "calendar.get_day", argumentos: (hoje) => ({ data: hoje }) },
      { toolName: "habits.get_today", argumentos: SEM_ARGUMENTO },
      { toolName: "tasks.get_routines_today", argumentos: SEM_ARGUMENTO },
    ],
  },
  {
    id: "encerrar-dia",
    titulo: "Encerrar meu dia",
    promptVersion: "experiencia-encerrar-dia-v1",
    prompt: PROMPT_ENCERRAR_DIA,
    ferramentas: [
      { toolName: "todo.get_agenda", argumentos: () => ({ dias: 1 }) },
      { toolName: "habits.get_today", argumentos: SEM_ARGUMENTO },
      { toolName: "nutrition.get_day", argumentos: (hoje) => ({ data: hoje }) },
      { toolName: "training.get_last_workout", argumentos: SEM_ARGUMENTO },
    ],
  },
  {
    id: "planejar-semana",
    titulo: "Planejar minha semana",
    promptVersion: "experiencia-planejar-semana-v1",
    prompt: PROMPT_PLANEJAR_SEMANA,
    ferramentas: [
      { toolName: "todo.get_agenda", argumentos: () => ({ dias: 7 }) },
      { toolName: "calendar.get_upcoming", argumentos: () => ({ dias: 7 }) },
      { toolName: "habits.get_streaks", argumentos: SEM_ARGUMENTO },
      { toolName: "training.get_volume", argumentos: () => ({ dias: 7 }) },
    ],
  },
];

export function experienciaPorId(id: string): Experiencia | undefined {
  return EXPERIENCIAS.find((e) => e.id === id);
}

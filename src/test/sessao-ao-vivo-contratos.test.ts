import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-C · D1 — o que a tela da sessão ao vivo não pode desfazer sem perceber.
 *
 * Lê o código, não o renderiza (invariante 25: o projeto não tem teste de componente);
 * comentários saem antes. As regras puras estão em `session-queue-view.test.ts` e o laço em
 * `session-queue-drain.test.ts` — aqui fica a ligação delas com a tela.
 */
const SESSAO = path.resolve(__dirname, "..", "components", "training", "session");
const ler = (arquivo: string) => semComentarios(fs.readFileSync(path.join(SESSAO, arquivo), "utf8"));

/** Corpo de uma função de topo: de `function Nome` até a próxima função de topo. */
function corpoDaFuncao(fonte: string, nome: string): string {
  const inicio = fonte.search(new RegExp(`\\nfunction ${nome}\\b|\\nexport function ${nome}\\b`));
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.slice(1).search(/\n(?:export )?function /);
  return fim === -1 ? resto : resto.slice(0, fim + 1);
}

/** Corpo de um `const handleX = async (…) => { … };` até o próximo `const handle`. */
function corpoDoHandler(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`const ${nome} = async`);
  expect(inicio, `handler ${nome} não encontrado`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio);
  const fim = resto.slice(1).search(/\n\s*const handle\w+ = /);
  return fim === -1 ? resto : resto.slice(0, fim + 1);
}

describe("S1 — finalizar", () => {
  const live = ler("session-live-client.tsx");

  it("a barra de finalizar é BOTÃO que abre o diálogo — sem <Link> que navega no mesmo clique", () => {
    const barra = corpoDaFuncao(live, "FinishBar");
    expect(barra).not.toMatch(/<Link\b/);
    expect(barra).toMatch(/onClick=\{onFinish\}/);
  });

  it("o diálogo de finalizar diz quantos registros estão só no aparelho e oferece enviar agora", () => {
    const dialogo = corpoDaFuncao(live, "ConfirmFinishDialog");
    expect(dialogo).toMatch(/registrosNoAparelhoTexto\(/);
    expect(dialogo).toMatch(/Enviar agora/);
    expect(dialogo).toMatch(/queue\.flush/);
  });

  it("a revisão assume a fila e consulta podeEncerrar ANTES de finalizar ou encerrar", () => {
    const review = ler("session-review-client.tsx");
    expect(review).toMatch(/useSessionQueue\(/);
    for (const [handler, acao] of [
      ["handleFinish", "finishSession("],
      ["handleAbandon", "abandonSession("],
    ] as const) {
      const corpo = corpoDoHandler(review, handler);
      const pode = corpo.indexOf("podeEncerrar(");
      expect(pode, `${handler} não consulta podeEncerrar`).toBeGreaterThan(-1);
      expect(pode, `${handler} chama ${acao} antes de consultar a fila`).toBeLessThan(corpo.indexOf(acao));
    }
  });

  it("o descarte avisa que os registros do aparelho somem junto", () => {
    expect(ler("session-review-client.tsx")).toMatch(/também serão descartados/);
  });

  it("o efeito sem chamador que limpava a fila saiu", () => {
    expect(live).not.toMatch(/useClearQueueOnFinish/);
  });
});

describe("S2 — um enviador por sessão na aba", () => {
  it("o hook usa o registro por sessão, com posse na montagem", () => {
    const hook = ler("use-session-queue.ts");
    expect(hook).toMatch(/criarRegistroDeFilas\(/);
    expect(hook).toMatch(/\.assumir\(/);
    expect(hook).toMatch(/\.soltar\(/);
  });
});

describe("S3 — remontar mostra o que está na fila", () => {
  it("o hook lê a fila por useSyncExternalStore com instantâneo de servidor vazio (sem divergência de hidratação)", () => {
    const hook = ler("use-session-queue.ts");
    expect(hook).toMatch(/useSyncExternalStore\(/);
    expect(hook).toMatch(/INSTANTANEO_DO_SERVIDOR/);
    expect(hook).toMatch(/estadoExibido\(/);
  });

  it("a tela semeia a camada otimista da fila e registra pela mesma conversão", () => {
    const live = ler("session-live-client.tsx");
    expect(live).toMatch(/optimisticFromQueue\(/);
    expect(live).toMatch(/optimisticPatch\(/);
  });

  it("o status de sincronização é região viva", () => {
    const status = ler("sync-status.tsx");
    expect(status).toMatch(/role="status"/);
    expect(status).toMatch(/aria-live="polite"/);
    expect(status).toMatch(/pendentesTexto\(/);
  });
});

describe("S4 — descanso", () => {
  it("o painel de descanso remonta quando o descanso muda (key pelo id)", () => {
    expect(ler("session-live-client.tsx")).toMatch(/<RestPanel\s+key=\{activeRest\.id\}/);
  });

  it("o aviso do fim sai da regra pura (descanso vencido ao montar não bipa)", () => {
    const painel = ler("rest-panel.tsx");
    expect(painel).toMatch(/avisosDoFimDoDescanso\(/);
    expect(painel).toMatch(/vencidoNaMontagem/);
  });
});

describe("os diálogos da sessão continuam estáticos (offline no meio do treino)", () => {
  it.each([
    ["AddExerciseSheet", "./add-exercise-sheet"],
    ["ExerciseListSheet", "./exercise-list-sheet"],
    ["PlateCalculatorSheet", "./plate-calculator"],
    ["SubstituteSheet", "./substitute-sheet"],
  ])("%s é import estático", (nome, modulo) => {
    const live = ler("session-live-client.tsx");
    expect(live).toMatch(new RegExp(`import \\{ ${nome} \\} from "${modulo.replace(/[./]/g, "\\$&")}";`));
    expect(live).not.toMatch(new RegExp(`dynamic\\([^)]*${nome}`));
  });

  it("ConfirmFinishDialog mora na própria tela da sessão", () => {
    expect(ler("session-live-client.tsx")).toMatch(/\nfunction ConfirmFinishDialog\(/);
  });
});

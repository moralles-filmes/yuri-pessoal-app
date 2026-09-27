/**
 * REDESIGN-07-A · V6 — UMA ROTA NÃO IMPORTA DA PASTA DE OUTRA.
 *
 * `configuracoes/page.tsx` importava `GoogleConnectCard` de `app/(app)/agenda/`: um componente
 * que duas telas usam morava dentro de uma delas. Nada quebrava — até alguém mexer na Agenda
 * achando que o arquivo era só dela. Componente compartilhado mora em `src/components/`.
 *
 * A regra é pelo PRIMEIRO segmento sob `(app)`: `estudos/[id]` importando `../course-form` é a
 * mesma rota de topo e está certo — e está escrito abaixo como controle positivo.
 *
 * ⚠️ Lê o código, não o executa (invariante 25). Um import comentado com `//` ou dentro de
 * `/* … *\/` não casa com `^\s*import`, então não conta.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const APP = path.join(SRC, "app", "(app)");

function arquivos(dir: string): string[] {
  const achados: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, e.name);
    if (e.isDirectory()) achados.push(...arquivos(alvo));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) achados.push(alvo);
  }
  return achados;
}

/** Primeiro segmento sob `(app)` — a rota de topo. `null` = fora de `(app)`. */
function rotaDe(absoluto: string): string | null {
  const rel = path.relative(APP, absoluto);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep)[0];
}

/** A rota de topo do alvo de um import, ou `null` (pacote, ou fora de `(app)`). */
function rotaDoAlvo(arquivo: string, especificador: string): string | null {
  if (especificador.startsWith("@/")) return rotaDe(path.join(SRC, especificador.slice(2)));
  if (especificador.startsWith(".")) return rotaDe(path.resolve(path.dirname(arquivo), especificador));
  return null;
}

/** Especificadores de import estático, re-export e `import()`, com a linha. */
function importsDe(fonte: string): { especificador: string; linha: number }[] {
  const achados: { especificador: string; linha: number }[] = [];
  const padroes = [
    /^\s*(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];
  for (const re of padroes) {
    for (const m of fonte.matchAll(re)) {
      // A linha sai do primeiro caractere NÃO branco do match. Em arquivo CRLF, o `^` do modo
      // multilinha casa também depois de `\r`, o `\s*` engole o `\n`, e contar a partir de
      // `m.index` relatava a linha anterior à do import.
      const inicio = m.index + (m[0].length - m[0].trimStart().length);
      achados.push({ especificador: m[1], linha: fonte.slice(0, inicio).split("\n").length });
    }
  }
  return achados;
}

const TODOS = arquivos(APP);

describe("V6 — nenhuma rota de (app) importa de outra rota", () => {
  it("enxerga o disco (guarda anti-tautologia)", () => {
    expect(TODOS.length).toBeGreaterThan(100);
  });

  it("o resolvedor sabe dizer sim e não", () => {
    const config = path.join(APP, "configuracoes", "page.tsx");
    expect(rotaDoAlvo(config, "@/app/(app)/agenda/x")).toBe("agenda");
    expect(rotaDoAlvo(config, "../agenda/x")).toBe("agenda");
    expect(rotaDoAlvo(config, "./cartao")).toBe("configuracoes");
    expect(rotaDoAlvo(config, "@/components/calendar/x")).toBeNull();
    expect(rotaDoAlvo(config, "react")).toBeNull();
    // Controle positivo REAL: estudos/[id] importa ../course-form — mesma rota de topo.
    const detalhe = path.join(APP, "estudos", "[id]", "course-detail-client.tsx");
    expect(rotaDoAlvo(detalhe, "../course-form")).toBe("estudos");
    expect(rotaDe(detalhe)).toBe("estudos");
  });

  it("nenhum arquivo importa de outra rota de topo", () => {
    const cruzados: string[] = [];
    for (const arquivo of TODOS) {
      const dono = rotaDe(arquivo);
      for (const { especificador, linha } of importsDe(fs.readFileSync(arquivo, "utf8"))) {
        const alvo = rotaDoAlvo(arquivo, especificador);
        if (alvo !== null && alvo !== dono) {
          cruzados.push(`${path.relative(SRC, arquivo).split(path.sep).join("/")}:${linha} → ${especificador}`);
        }
      }
    }
    // Componente usado por duas telas mora em `src/components/`, não na pasta de uma delas.
    expect(cruzados).toEqual([]);
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-D — os diálogos do lote (IA, Configurações, Notificações e Busca).
 *
 * Nasce na D4 com a regra que mais pesa no orçamento: todo formulário que arrasta `zod` ou
 * `react-hook-form` entra por `next/dynamic` + `useLazyDialog` (regra 2 do carregamento sob
 * demanda). A D8 estende este arquivo com `DialogDescription` e a trava de `onOpenChange` em
 * todo `DialogContent` do lote. Lê o código, não o renderiza (invariante 25).
 */
const SRC = path.resolve(__dirname, "..");

const PASTAS_DO_LOTE = [
  "components/ai",
  "components/settings",
  "components/notifications",
  "components/search",
  "app/(app)/ia",
  "app/(app)/configuracoes",
  "app/(app)/notificacoes",
  "app/(app)/busca",
];

const fonte = (arquivo: string) =>
  semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));

function arquivosDe(pasta: string): string[] {
  const raiz = path.join(SRC, pasta);
  if (!fs.existsSync(raiz)) return [];
  return fs
    .readdirSync(raiz, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => `${pasta}/${f.replace(/\\/g, "/")}`);
}

const ARQUIVOS = PASTAS_DO_LOTE.flatMap(arquivosDe);

/** Importa zod, react-hook-form, o resolver ou um schema de `@/lib/validators/`. */
const PESADO = /from "(?:react-hook-form|@hookform\/resolvers[^"]*|zod)"|from "@\/lib\/validators\//;

/** Os jeitos de escrever o import de `arquivo` a partir de `de` (alias e relativo). */
function especificadores(arquivo: string, de: string): string[] {
  const semExtensao = arquivo.replace(/\.tsx?$/, "");
  const relativo = path.posix.relative(path.posix.dirname(de), semExtensao);
  return [`@/${semExtensao}`, relativo.startsWith(".") ? relativo : `./${relativo}`];
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("07-D · D4 — formulário pesado só entra sob demanda (M13)", () => {
  const pesados = ARQUIVOS.filter((a) => PESADO.test(fonte(a)));

  it("a varredura alcança o lote e acha os formulários pesados", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(30);
    expect(pesados).toContain("components/ai/memory-form-dialog.tsx");
  });

  it.each(ARQUIVOS.map((a) => [a] as const))(
    "%s não importa estaticamente um formulário que arrasta zod/react-hook-form",
    (arquivo) => {
      const codigo = fonte(arquivo);
      for (const pesado of pesados) {
        if (pesado === arquivo) continue;
        const alvo = especificadores(pesado, arquivo).map(escapar).join("|");
        const estatico = new RegExp(`^import (?!type\\b)[^;]*from "(?:${alvo})"`, "m");
        expect(codigo, `${arquivo} importa ${pesado} sem next/dynamic`).not.toMatch(estatico);
      }
    },
  );
});

describe("07-D · D4 — a Segurança recolhida", () => {
  const CARTAO = "components/settings/security-card.tsx";
  const DIALOGOS = [
    "components/settings/security-email-dialog.tsx",
    "components/settings/security-password-dialog.tsx",
  ];

  it("o cartão não importa zod, react-hook-form nem schema", () => {
    expect(fonte(CARTAO)).not.toMatch(PESADO);
  });

  it.each(DIALOGOS.map((d) => [d] as const))("o cartão carrega %s por next/dynamic", (dialogo) => {
    const alvo = escapar(`@/${dialogo.replace(/\.tsx$/, "")}`);
    expect(fonte(CARTAO)).toMatch(new RegExp(`dynamic\\(\\s*\\(\\) =>\\s*import\\("${alvo}"\\)`));
  });

  it("os diálogos montam na primeira abertura e não desmontam (animação de fechar)", () => {
    expect(fonte(CARTAO).match(/useLazyDialog\(/g) ?? []).toHaveLength(2);
  });

  it.each(DIALOGOS.map((d) => [d] as const))(
    "%s descreve o que faz, não fecha no meio do envio e traduz o erro",
    (dialogo) => {
      const codigo = fonte(dialogo);
      expect(codigo).toMatch(/<DialogDescription>/);
      expect(codigo).toMatch(/function aoMudarAbertura\([^)]*\)[^{]*\{\s*if \(enviando\) return;/);
      expect(codigo).toMatch(/onOpenChange=\{aoMudarAbertura\}/);
      expect(codigo).toMatch(/mensagemDeErroDeAuth\(/);
      // O texto do Supabase nunca chega cru à tela.
      expect(codigo).not.toMatch(/error\.message|description: \w*[Ee]rror\b/);
    },
  );
});

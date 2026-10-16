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

/**
 * REDESIGN-07-D · D8 — todo diálogo do lote diz o que faz e não fecha no meio do envio
 * (spec §6.8). Nenhum teste do projeto exigia `DialogDescription` nem a trava de
 * `onOpenChange`: fechar no meio deixa o dono sem saber se a exclusão aconteceu.
 */
const COM_CONTEUDO_DE_DIALOGO = ARQUIVOS.filter((a) => /<(?:Dialog|Sheet)Content\b/.test(fonte(a)));

/** Diálogos que disparam action e NÃO precisam da trava — cada um com o motivo. */
const SEM_TRAVA = new Map<string, string>([
  ["components/search/search-command.tsx", "a paleta só LÊ (busca); não há escrita a interromper ao fechar"],
  [
    "components/ai/floating-assistant-panel.tsx",
    "o painel não fecha por causa de uma action: mudar o canto é otimista e fecha só ao ocultar, depois do sucesso",
  ],
]);

/** A trava: `onOpenChange={fn}` com `function fn(...) { if (<estado>) return; … }`. */
function temTrava(codigo: string): boolean {
  for (const m of codigo.matchAll(/onOpenChange=\{(\w+)\}/g)) {
    const corpo = new RegExp(String.raw`function ${m[1]}\([^)]*\)[^{]*\{\s*if \([\w.!]+\) return;`);
    if (corpo.test(codigo)) return true;
  }
  return false;
}

describe("07-D · D8 — os diálogos do lote", () => {
  it("a varredura acha os diálogos do lote (anti-tautologia)", () => {
    expect(COM_CONTEUDO_DE_DIALOGO.length).toBeGreaterThanOrEqual(8);
  });

  it("a trava sabe dizer sim e não (fixture)", () => {
    expect(temTrava("function a(v) { if (enviando) return; set(v); } <Dialog onOpenChange={a}>")).toBe(true);
    expect(temTrava("<Dialog onOpenChange={setAberto}>")).toBe(false);
    expect(temTrava("<Dialog onOpenChange={(v) => !v && fechar()}>")).toBe(false);
  });

  it.each(COM_CONTEUDO_DE_DIALOGO.map((a) => [a] as const))("%s tem DialogDescription", (arquivo) => {
    expect(fonte(arquivo)).toMatch(/<(?:Dialog|Sheet)Description\b|aria-describedby=\{undefined\}/);
  });

  it.each(
    COM_CONTEUDO_DE_DIALOGO.filter((a) => /from "@\/lib\/actions\//.test(fonte(a)) && !SEM_TRAVA.has(a)).map(
      (a) => [a] as const,
    ),
  )("%s trava o onOpenChange enquanto a action roda", (arquivo) => {
    expect(temTrava(fonte(arquivo))).toBe(true);
  });

  it.each([...SEM_TRAVA.keys()].map((a) => [a] as const))(
    "a exceção %s continua existindo e continuando sem trava (senão sai da lista)",
    (arquivo) => {
      expect(COM_CONTEUDO_DE_DIALOGO).toContain(arquivo);
      expect(temTrava(fonte(arquivo))).toBe(false);
    },
  );

  it("a exclusão de conversa e a de memória saem da linha para o diálogo único sob demanda", () => {
    for (const lista of ["components/ai/conversation-list.tsx", "components/ai/memory-client.tsx"]) {
      expect(fonte(lista), lista).toMatch(
        /dynamic\(\s*\(\) =>\s*import\("@\/components\/ai\/confirmar-exclusao-dialog"\)/,
      );
      expect(fonte(lista), lista).not.toMatch(/DeleteConfirmDialog|<DialogContent\b/);
    }
  });

  it("o formulário de memória mostra o erro de `modulo` e não fecha enquanto salva (M45)", () => {
    const codigo = fonte("components/ai/memory-form-dialog.tsx");
    expect(codigo).toMatch(/<ErroDoCampo\b[^>]*mensagem=\{[^}]*modulo/);
    expect(codigo).toMatch(/<SelectTrigger\b[^>]*\{\.\.\.ariaDoErro\(/);
    expect(temTrava(codigo)).toBe(true);
  });
});

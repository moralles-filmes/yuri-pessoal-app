import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/*
  Os três auxiliares abaixo são os de `dieta-treinos-formularios.test.ts` (07-C), copiados: importar
  um arquivo de teste registraria os testes dele de novo dentro deste.
*/

/** Actions exportadas que chamam `invalid(` no corpo — derivado das fontes (só leitura). */
function actionsComInvalid(fontes: Record<string, string>): Set<string> {
  const nomes = new Set<string>();
  for (const fonte of Object.values(fontes)) {
    const pos = [...fonte.matchAll(/^export\s+async\s+function\s+(\w+)\s*\(/gm)].map((m) => ({ n: m[1], i: m.index! }));
    pos.forEach((p, k) => {
      const corpo = fonte.slice(p.i, pos[k + 1]?.i ?? fonte.length);
      if (/\binvalid\(/.test(corpo)) nomes.add(p.n);
    });
  }
  return nomes;
}

/** Nomes importados POR VALOR de `@/lib/actions/…`. */
function actionsImportadas(fonte: string): string[] {
  const nomes: string[] = [];
  for (const m of fonte.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+"@\/lib\/actions\/[^"]+";/gm)) {
    for (const parte of m[1].split(",")) {
      const t = parte.trim();
      if (t && !t.startsWith("type ")) nomes.push(t.split(/\s+as\s+/).pop()!.trim());
    }
  }
  return nomes;
}

/** Repasse cru do erro: `toast.error(r.error)`, `toast.error(r.error ?? …)`, `setErro(r.error)`. */
const REPASSE_CRU = /\btoast\.error\(\s*\w+\.error\s*(?:\)|\?\?)|\bset\w*Error\(\s*\w+\.error\s*\)/;

/**
 * REDESIGN-07-D · D8 — erro de campo do servidor nunca some nas telas do lote (spec §6.8, M22).
 *
 * Molde da 07-C (`dieta-treinos-formularios.test.ts`, de onde vêm os auxiliares): o conjunto de
 * actions é DERIVADO — as exportadas de `src/lib/actions/{ai-*,settings,notifications}.ts` cujo
 * corpo chama `invalid(` —, e toda tela do lote que importa uma delas passa o erro por
 * `mapServerFieldErrors`/`mensagemDaAction`/`errosDaAction`. Repassar `r.error` cru deixa o
 * dono lendo "Verifique os campos destacados." sem nada destacado (regra 2 de formulário).
 */
const SRC = path.resolve(__dirname, "..");
const PASTAS = [
  "components/ai",
  "components/settings",
  "components/notifications",
  "components/search",
  "app/(app)/ia",
  "app/(app)/configuracoes",
  "app/(app)/notificacoes",
  "app/(app)/busca",
];

/** Exceções DECLARADAS, com o motivo. Cada uma tem de continuar existindo e violando. */
const EXCECOES = new Map<string, string>([
  [
    "components/ai/conversation-list.tsx",
    "favoritar e arquivar recebem só o id e o estado da própria linha — erro de campo ali só nasce de defeito de programação; a exclusão, a única com confirmação, passa pelo mapa no diálogo sob demanda. O mapa na lista custaria ~0,45 KB gz a /ia/conversas, que já carrega só a casca acima da linha de base",
  ],
  [
    "components/ai/memory-client.tsx",
    "desativar, reativar e esquecer recebem só o id da própria linha — erro de campo ali só nasce de defeito de programação; apagar passa pelo mapa no diálogo sob demanda, e o formulário (memory-form-dialog) já passava. O mapa na lista custaria ~0,45 KB gz a /ia/memoria",
  ],
  [
    "components/settings/appearance-card.tsx",
    "o tema muda na hora (next-themes, que também o guarda no aparelho); gravar a preferência na conta é melhor-esforço em segundo plano, sem campo e sem nada a desfazer na tela",
  ],
  [
    "components/ai/budget-alert.tsx",
    "registra em segundo plano (efeito) o nível de aviso já mostrado; a falha não tem o que dizer ao dono — o aviso continua na tela e volta a ser registrado na próxima visita",
  ],
]);

const PASSA_PELO_MAPA = /\bmapServerFieldErrors\(|\bmensagemDaAction\(|\berrosDaAction\(/;

function arquivos(dir: string): string[] {
  const raiz = path.join(SRC, dir);
  if (!fs.existsSync(raiz)) return [];
  return fs
    .readdirSync(raiz, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => `${dir}/${f.split(path.sep).join("/")}`);
}

const FONTES_DAS_ACTIONS = Object.fromEntries(
  fs
    .readdirSync(path.join(SRC, "lib/actions"))
    .filter((f) => /^(ai-[\w-]*|settings|notifications)\.ts$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(SRC, "lib/actions", f), "utf8")]),
);
const COM_INVALID = actionsComInvalid(FONTES_DAS_ACTIONS);

const TELAS = PASTAS.flatMap(arquivos)
  .map((a) => ({ a, f: semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")) }))
  .filter((x) => actionsImportadas(x.f).some((n) => COM_INVALID.has(n)));
const COBERTAS = TELAS.filter((x) => !EXCECOES.has(x.a));

describe("07-D · D8 — erro de campo do servidor nunca some no lote", () => {
  it("deriva as actions e acha as telas (anti-tautologia)", () => {
    // Contados no commit que introduziu a varredura (07-D, D8): 33 actions, 19 telas.
    expect(COM_INVALID.size).toBeGreaterThanOrEqual(30);
    expect(TELAS.length).toBeGreaterThanOrEqual(18);
  });

  it.each(COBERTAS.map((x) => x.a))("%s passa o erro da action pelo mapa", (a) => {
    expect(COBERTAS.find((x) => x.a === a)!.f).toMatch(PASSA_PELO_MAPA);
  });

  it.each(COBERTAS.map((x) => x.a))("%s não repassa X.error cru", (a) => {
    expect(COBERTAS.find((x) => x.a === a)!.f).not.toMatch(REPASSE_CRU);
  });

  it.each([...EXCECOES.keys()])("a exceção %s continua existindo e importando action que valida", (a) => {
    const tela = TELAS.find((x) => x.a === a);
    expect(tela, `${a} saiu da varredura — a exceção sobrou`).toBeDefined();
    expect(tela!.f).not.toMatch(PASSA_PELO_MAPA);
  });
});

/**
 * Fase 18-A — IA · TESTE DE FRONTEIRA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ESTE TESTE EXISTE SE JÁ HÁ REGRA DO ESLINT                                    ║
 * ║                                                                                       ║
 * ║ `no-restricted-imports` NÃO enxerga `await import(...)`. Um import dinâmico do AI SDK ║
 * ║ dentro de `core/` passaria pelo lint, passaria no build e só apareceria como bundle   ║
 * ║ inchado — ou, pior, como pacote de fornecedor chegando ao navegador.                  ║
 * ║                                                                                       ║
 * ║ Este teste varre o CÓDIGO-FONTE procurando as duas formas. É a terceira camada, e a   ║
 * ║ única que cobre o caso dinâmico.                                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname);
const SRC = path.resolve(__dirname, "..", "..");

function listarArquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const saida: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...listarArquivos(completo));
    else if (/\.(ts|tsx)$/.test(entrada.name)) saida.push(completo);
  }
  return saida;
}

/** Pega `import x from 'y'`, `export … from 'y'` E `await import('y')`. */
function especificadores(codigo: string): string[] {
  const encontrados: string[] = [];
  const padroes = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?)\s*from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+(?:[\s\S]*?)\s*from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const padrao of padroes) {
    for (const m of codigo.matchAll(padrao)) encontrados.push(m[1]);
  }
  return encontrados;
}

/**
 * Remove comentários antes de procurar chamada de banco.
 *
 * Sem isto o teste acusaria o PRÓPRIO cabeçalho que documenta a proibição ("nenhum
 * `.from()` neste arquivo") — e a saída seria arrumar a documentação em vez do código.
 * Só bloco `/* … *\/` e linha que COMEÇA com `//` ou `*`: cortar `//` no meio da linha
 * mutilaria uma URL e poderia esconder uma chamada real depois dela.
 *
 * ⚠️ HONESTIDADE SOBRE O QUE ISTO É: uma varredura LÉXICA, não um parser. Um literal de
 * string que contenha `/*` faz o corte de bloco engolir código real até o próximo `*\/`,
 * e a partir daí uma chamada de banco passaria despercebida. Não vale escrever um parser
 * de TypeScript aqui: a rede de baixo (`chamaBanco`) cobre também a forma indireta
 * `supabase["from"](…)`, e a fronteira de verdade é o `no-restricted-imports` mais a
 * revisão — este teste é a terceira camada, não a única.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
    .join("\n");
}

/**
 * Acesso ao banco em qualquer das duas formas. `supabase.from(...)` é a que se escreve;
 * `supabase["from"](...)` é a que escapa de um grep ingênuo — e é justamente a que alguém
 * usaria para contornar este teste.
 */
function chamaBanco(codigo: string): string[] {
  const achados: string[] = [];
  for (const metodo of ["from", "select"]) {
    const ponto = new RegExp(`\\.${metodo}\\(`);
    const colchete = new RegExp(`\\[\\s*["'\`]${metodo}["'\`]\\s*\\]`);
    if (ponto.test(codigo)) achados.push(`.${metodo}(`);
    else if (colchete.test(codigo)) achados.push(`["${metodo}"](`);
  }
  return achados;
}

const ehPacoteDeFornecedor = (spec: string) =>
  spec === "ai" || spec.startsWith("ai/") || spec.startsWith("@ai-sdk/");

const CAMADAS_PURAS = [
  "core",
  "agents",
  "tools",
  "usage",
  "security",
  "context",
  "approval",
] as const;

describe("fronteiras arquiteturais do módulo de IA", () => {
  it("nenhuma camada pura importa pacote de fornecedor (estático ou dinâmico)", () => {
    const violacoes: string[] = [];

    for (const camada of CAMADAS_PURAS) {
      for (const arquivo of listarArquivos(path.join(RAIZ, camada))) {
        if (arquivo.endsWith(".test.ts")) continue;
        const codigo = fs.readFileSync(arquivo, "utf8");
        for (const spec of especificadores(codigo)) {
          if (ehPacoteDeFornecedor(spec)) {
            violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
          }
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("nenhuma camada pura alcança providers/ nem server/", () => {
    const violacoes: string[] = [];

    for (const camada of CAMADAS_PURAS) {
      for (const arquivo of listarArquivos(path.join(RAIZ, camada))) {
        if (arquivo.endsWith(".test.ts")) continue;
        const codigo = fs.readFileSync(arquivo, "utf8");
        for (const spec of especificadores(codigo)) {
          if (/(^|\/)ai\/(providers|server)\//.test(spec) || /^\.\.\/(providers|server)\//.test(spec)) {
            violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
          }
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("só providers/ importa o AI SDK, em todo o src/", () => {
    const permitido = path.join(RAIZ, "providers");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.startsWith(permitido)) continue;
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (ehPacoteDeFornecedor(spec)) {
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("credential-crypto só é importado por server/", () => {
    const permitido = path.join(RAIZ, "server");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.startsWith(permitido)) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (spec.includes("credential-crypto")) {
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("todo arquivo de server/ importa `server-only`", () => {
    const semGuarda: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "server"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      // `keyring.ts` é a exceção DECLARADA: pura manipulação de bytes, sem segredo embutido
      // e sem I/O. Ela precisa ser testável, e não expõe nada que o client possa usar.
      if (path.basename(arquivo) === "keyring.ts") continue;
      if (!/import\s+["']server-only["']/.test(codigo)) {
        semGuarda.push(path.relative(SRC, arquivo));
      }
    }

    expect(semGuarda).toEqual([]);
  });

  /**
   * A 18-A não lia NADA dos módulos. A 18-B abriu a primeira leitura — e abriu por UMA
   * porta só: `tools/adapters/`. O teste não deixou de valer; ele passou a nomear a
   * exceção. Um `import` de `@/lib/training/...` dentro de `chat-runner.ts`, de `core/` ou
   * de qualquer outro lugar continua sendo violação, porque seria uma leitura de dado do
   * usuário fora do Tool Registry, sem guard, sem teto e sem auditoria.
   *
   * `actions` está na lista pela metade de ESCRITA da mesma invariante — que é o escopo da
   * 18-C. Sem ele, um `import { criarSessao } from "@/lib/actions/training"` dentro de
   * `core/` passaria por tudo: escrita sem confirmação, sem `requiresConfirmation`, sem
   * Approval Engine e sem linha em `ai_tool_calls`.
   *
   * ⚠️ **BLOCO 4 — A SEGUNDA PORTA FOI ABERTA, E A NOTA FICA COMO REGISTRO.**
   *
   * Os commands precisam dos serviços de domínio: é a regra "nenhuma regra de negócio é
   * reescrita". A decisão que a nota antecipava foi tomada — `approval/commands/` entrou na
   * lista, como `tools/adapters/` entrou na 18-B. O teste não foi apagado; ele passou a
   * nomear DUAS exceções, e nenhuma terceira.
   *
   * ⛔ `@/lib/actions/` CONTINUA FECHADO PARA AS DUAS PORTAS, e isso é deliberado: uma
   * Server Action carrega `revalidatePath` dentro, e um command que revalidasse estaria
   * preso ao Next, fora de teste, e furando a regra de que a invalidação mora na casca.
   * Command chama SERVIÇO (`@/lib/todo/services`), nunca action.
   *
   * ⚠️ **18-D — NÃO FOI ABERTA UMA TERCEIRA PORTA. FOI DECLARADO UM PAR.**
   *
   * `vision/duplicates.ts` precisa de `normalizarDescricao` para decidir se o nome do
   * estabelecimento lido na nota é o mesmo de um lançamento existente. Reescrever a
   * normalização faria a IA e a importação discordarem sobre "o mesmo estabelecimento" —
   * exatamente o que a regra "nenhuma regra é reescrita" existe para impedir.
   *
   * Mas abrir `vision/` como porta seria largo demais: a porta permitiria `vision/`
   * importar `@/lib/finance/queries` e ler dado do usuário fora do Tool Registry. Por isso
   * a exceção é um PAR EXATO (arquivo, especificador) numa allowlist — o mais estreito que
   * dá para escrever. Acrescentar um par continua exigindo editar este arquivo.
   *
   * O critério para um par entrar: o alvo tem de ser PURO (sem I/O, sem escrita, sem
   * Supabase). `@/lib/import/normalize` é — só transforma texto.
   */
  it("query e action de módulo só entram pelas DUAS portas declaradas", () => {
    /**
     * Pares (arquivo relativo a `src/lib/ai/`, especificador) autorizados. Um par por linha,
     * cada um com o motivo. Lista NOMEADA, não padrão — o mesmo espírito do registry de
     * commands, que virou lista nomeada no Bloco 4 para que acrescentar um doesse.
     */
    const PARES_DECLARADOS: readonly (readonly [string, string])[] = [
      // 18-D · a MESMA normalização da importação, para os dois concordarem sobre o que é
      // "o mesmo estabelecimento". Alvo puro: só transforma texto.
      [path.join("vision", "duplicates.ts"), "@/lib/import/normalize"],
    ];
    const modulos = [
      "actions",
      "finance",
      "todo",
      "tasks",
      "nutrition",
      "training",
      "habits",
      "studies",
      "calendar",
      "body",
      "dashboard",
      "reports",
      "import",
    ];
    const adapters = path.join(RAIZ, "tools", "adapters");
    const commands = path.join(RAIZ, "approval", "commands");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(RAIZ)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const naPorta = arquivo.startsWith(adapters) || arquivo.startsWith(commands);
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        for (const modulo of modulos) {
          if (!spec.startsWith(`@/lib/${modulo}/`)) continue;
          // `@/lib/actions/` é fechado até para as portas — ver o docblock.
          if (naPorta && modulo !== "actions") continue;
          // Par exato declarado (18-D). Casamento por IGUALDADE dos dois lados: um par
          // não vira curinga para o diretório nem para o pacote.
          const relativoAoAi = path.relative(RAIZ, arquivo);
          if (
            PARES_DECLARADOS.some(
              ([arq, esp]) => arq === relativoAoAi && esp === spec,
            )
          ) {
            continue;
          }
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-C · BLOCO 4 — O RUN NÃO ALCANÇA UMA FUNÇÃO QUE ESCREVE. TRANSITIVAMENTE.         ║
   * ║                                                                                     ║
   * ║ O Bloco 3 provou que o laço não importa `approval/execute.ts`. O Bloco 4 quase       ║
   * ║ desfez isso sem querer: propor exige `parse` e `prever`, que moram no command — e    ║
   * ║ importar o objeto `Command` inteiro faria o Tool Executor passar a SEGURAR           ║
   * ║ `executar`. Nada o chamaria, mas a garantia teria caído de "não alcança" para        ║
   * ║ "não chama".                                                                         ║
   * ║                                                                                     ║
   * ║ Por isso cada command é partido: `<modulo>-preview.ts` (só lê) e `<modulo>.ts` (a    ║
   * ║ metade que escreve). O executor importa `commands/previews`, e o teste abaixo é o    ║
   * ║ que mantém assim.                                                                    ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("tools/ só alcança commands/previews — nunca o registry com `executar`", () => {
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "tools"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (!spec.includes("approval/commands")) continue;
        if (spec.endsWith("approval/commands/previews")) continue;
        violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * A outra metade da mesma trava: a pasta que o run ALCANÇA não pode importar um serviço de
   * escrita. Sem isto, bastaria `previews.ts` (ou um `*-preview.ts`) puxar `todo/services` e
   * a partição viraria decoração — os arquivos continuariam dois, e o grafo de imports, um.
   */
  it("o lado PREVIEW dos commands não importa serviço de escrita", () => {
    const commands = path.join(RAIZ, "approval", "commands");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(commands)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const base = path.basename(arquivo);
      const ehLadoLeitura = base === "previews.ts" || base.endsWith("-preview.ts");
      if (!ehLadoLeitura) continue;

      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (/@\/lib\/[a-z-]+\/services$/.test(spec) || spec.includes("/services/")) {
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ⛔ `executar` É CHAMADO EM UM LUGAR SÓ.
   *
   * Os dois testes acima cuidam do grafo de imports; este cuida do que sobra: alguém escrever
   * `command.executar(...)` num arquivo que já tenha o command na mão por outro motivo. É
   * varredura léxica, é fraca, e é a terceira camada — não a única.
   */
  it("`.executar(` só aparece em approval/execute.ts", () => {
    const chamadas: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      if (/\.executar\s*\(/.test(codigo)) {
        chamadas.push(path.relative(SRC, arquivo).replace(/\\/g, "/"));
      }
    }

    expect(chamadas).toEqual(["lib/ai/approval/execute.ts"]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ AS FERRAMENTAS NÃO REIMPLEMENTAM QUERY DE MÓDULO (18-B).                            ║
   * ║                                                                                     ║
   * ║ Uma segunda leitura discordaria da primeira no primeiro campo novo — e o número que ║
   * ║ a IA relata deixaria de bater com o número que o usuário vê na tela. `audit.ts` é a ║
   * ║ ÚNICA exceção: ele grava a auditoria do próprio módulo de IA.                       ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("nenhum .from() nem select() em src/lib/ai/tools/, exceto a auditoria", () => {
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "tools"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      if (path.basename(arquivo) === "audit.ts") continue;
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const achado of chamaBanco(codigo)) {
        violacoes.push(`${path.relative(SRC, arquivo)} → ${achado}`);
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ A NORMALIZAÇÃO DE TEXTO É UMA SÓ, E MORA EM CAMADA NEUTRA.                          ║
   * ║                                                                                     ║
   * ║ Dois consumidores a usam por motivos DIFERENTES — o roteador procura palavra com    ║
   * ║ fronteira, o filtro de recordes procura substring em nome de exercício. Não é a     ║
   * ║ mesma busca; é o mesmo PREPARO do texto. Uma segunda declaração faria "triceps"     ║
   * ║ casar num lado e não no outro, e a resposta afirmaria que não há recorde onde há.   ║
   * ║                                                                                     ║
   * ║ Ela também não pode morar em `agents/`: `tools/adapters/` importar do roteador       ║
   * ║ acopla a leitura de dado à seleção de agente, que não têm nada em comum.            ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("normalizarTexto é declarada UMA vez, e em core/", () => {
    const declaracoes: string[] = [];

    for (const arquivo of listarArquivos(RAIZ)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      if (/function\s+normalizarTexto\s*\(/.test(codigo)) {
        declaracoes.push(path.relative(SRC, arquivo).replace(/\\/g, "/"));
      }
    }

    expect(declaracoes).toEqual(["lib/ai/core/text.ts"]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-C — A ESCRITA NÃO ACONTECE DENTRO DO RUN. TRAVA FÍSICA, NÃO CONVENÇÃO.           ║
   * ║                                                                                     ║
   * ║   DENTRO do run  → `approval/proposals.ts` grava a INTENÇÃO                          ║
   * ║   FORA do run    → Server Action → `approval/execute.ts` → command → domínio         ║
   * ║                                                                                     ║
   * ║ Um critério de aceite da fase é "cancelar o streaming não desfaz ação confirmada".  ║
   * ║ Com o executor fora do alcance do laço, isso é verdadeiro POR CONSTRUÇÃO — não é    ║
   * ║ uma checagem que alguém pode esquecer de escrever. Este teste é o que mantém assim. ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("nada em src/lib/ai/ alcança approval/execute.ts — o laço não chega ao executor", () => {
    const oExecutor = path.join(RAIZ, "approval", "execute.ts");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(RAIZ)) {
      if (arquivo === oExecutor) continue;
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (/(^|\/)approval\/execute$/.test(spec) || spec === "./execute") {
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * A outra metade: quem PODE alcançá-lo. Na 18-C, só uma Server Action — que é onde o
   * `revalidatePath` mora e onde a proteção CSRF do Next vale (o Route Handler do chat não
   * a herda, e é por isso que ele não pode ser a porta da execução).
   */
  it("approval/execute.ts só é alcançado a partir de src/lib/actions/", () => {
    const permitido = path.join(SRC, "lib", "actions");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.startsWith(permitido)) continue;
      if (arquivo.startsWith(path.join(RAIZ, "approval"))) continue;
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (spec.includes("approval/execute")) {
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * `approval/` fala com o banco — mas só com as tabelas do PRÓPRIO módulo de IA. Uma
   * escrita direta numa tabela de módulo do usuário aqui pularia o serviço de domínio, e com
   * ele todas as regras que o formulário aplica: fatura, parcelamento, recorrência,
   * snapshot imutável. É a mesma disciplina que vale para `tools/audit.ts`.
   */
  it("approval/ só toca tabelas ai_*", () => {
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "approval"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const m of codigo.matchAll(/\.from\(\s*["']([^"']+)["']/g)) {
        if (!m[1].startsWith("ai_")) violacoes.push(`${path.relative(SRC, arquivo)} → ${m[1]}`);
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * Os dois arquivos de `approval/` que fazem I/O carregam `server-only`; os puros, não.
   * A distinção importa: `state.ts` e `canonical.ts` decidem prazo, uso único e hash, e
   * precisam ser testáveis sem banco — uma trava intestável é uma trava que ninguém sabe
   * se funciona.
   */
  it("em approval/, quem fala com o banco importa server-only e quem é puro não", () => {
    const errados: string[] = [];
    const commands = path.join(RAIZ, "approval", "commands");

    for (const arquivo of listarArquivos(path.join(RAIZ, "approval"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      /**
       * `commands/` é exceção DECLARADA, e por um motivo diferente do de `state.ts`: os
       * commands não abrem client nenhum (quem faz isso são as queries e os serviços do
       * módulo, que já são `server-only`), mas alcançam código de servidor por import. Eles
       * declaram `server-only` porque PRECISAM — a regra deles é a do bloco abaixo: todos
       * declaram, sem exceção.
       */
      if (arquivo.startsWith(commands)) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      const fazIO = /@\/lib\/supabase\/server/.test(codigo);
      const declara = /import\s+["']server-only["']/.test(codigo);
      if (fazIO !== declara) {
        errados.push(
          `${path.relative(SRC, arquivo)} (I/O: ${fazIO}, server-only: ${declara})`,
        );
      }
    }

    expect(errados).toEqual([]);
  });

  /**
   * Todo arquivo de `approval/commands/` alcança serviço ou query de módulo, que são
   * `server-only`. Sem a marca, um import descuidado a partir de um componente client daria
   * erro só no build — e depois de o bundle já ter sido montado com o cliente do Supabase.
   */
  it("todo arquivo de approval/commands/ importa `server-only`", () => {
    const semGuarda: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "approval", "commands"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      if (!/import\s+["']server-only["']/.test(codigo)) {
        semGuarda.push(path.relative(SRC, arquivo));
      }
    }

    expect(semGuarda).toEqual([]);
  });

  it("audit.ts é a exceção DECLARADA — e não escreve em tabela de módulo do usuário", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "tools", "audit.ts"), "utf8");
    const tabelas = [...codigo.matchAll(/\.from\(\s*["']([^"']+)["']/g)].map((m) => m[1]);

    expect(tabelas.length).toBeGreaterThan(0);
    for (const tabela of tabelas) expect(tabela, tabela).toMatch(/^ai_/);
  });
});

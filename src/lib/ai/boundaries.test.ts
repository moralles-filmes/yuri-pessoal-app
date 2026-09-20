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
  /**
   * 18-D. `vision/` decide o que é o arquivo, quanto ele custa, se a leitura merece confiança
   * e se ela pode virar proposta — **sem ver um byte e sem conhecer o bucket**. Os bytes
   * existem só em `server/document-store.ts`, e só até a chamada terminar (§10.1 do design).
   *
   * Sem esta linha, um `import { lerBytesDoDocumento } from "../server/document-store"` dentro
   * de `vision/confidence.ts` passaria por lint, `tsc` e build — e a promessa de que a camada
   * de decisão é pura viraria comentário.
   */
  "vision",
  /**
   * 18-E. `insights/` decide o que é um número medido, o que se pode agregar sobre ele, se o
   * texto que o cita é aceitável e quando o insight vence — **sem falar com o banco e sem
   * conhecer provedor**. Quem lê os módulos são os coletores (a terceira porta, abaixo); quem
   * transmite é `server/insight-runner.ts`.
   *
   * Sem esta linha, um `import { chamarModelo } from "../server/insight-runner"` dentro de
   * `insights/validate.ts` passaria por lint, `tsc` e build — e a validação, que existe
   * justamente para poder rodar sem rede, viraria uma função que precisa de rede para ser
   * testada.
   */
  "insights",
  /**
   * 18-F Bloco 3. `memory/` decide o que tem forma de preferência, qual é o estado de uma
   * memória e quais entram no prompt — **sem conhecer provedor e sem falar com o AI SDK**.
   *
   * ⚠️ ELA ENTRA NA LISTA NO MESMO COMMIT EM QUE NASCE, e a razão está na natureza do teste:
   * a lista é escrita à mão, então uma pasta nova FORA dela passa vacuamente verde — ele não
   * reprova o que não conhece. Foi por isso que a spec (§9.2) exigiu esta linha por escrito.
   *
   * ⚠️ E ela FALA COM O BANCO (`queries.ts`, `services.ts`), como `approval/` já fazia: o que
   * "pura" proíbe aqui é alcançar `ai/server/` e o pacote do fornecedor, não falar com o
   * Supabase. O I/O da memória mora nesta pasta justamente porque `approval/commands/
   * memory-preview.ts` precisa lê-lo sem atravessar `ai/server/`.
   */
  "memory",
  /**
   * 18-F Bloco 4. `experiences/` DECLARA o que uma experiência lê e como ela é redigida —
   * sem falar com o banco, sem conhecer provedor e sem alcançar `ai/server/`. Quem executa é
   * `server/experience-runner.ts`.
   *
   * ⚠️ Aquela lista é escrita à MÃO: uma pasta nova FORA dela passa vacuamente verde. Por
   * isso esta linha entra no MESMO commit em que a pasta nasce — foi a regra que o Bloco 3
   * pagou para aprender com `memory/`.
   */
  "experiences",
  /**
   * 18-F Bloco 5. `evals/` é dado e afirmação: os casos do briefing e o que o sistema garante
   * sobre eles, com a rede desligada. Nada ali fala com provedor, banco ou `ai/server/`.
   *
   * ⚠️ Ela entra na lista NO MESMO COMMIT em que a pasta nasce, pela mesma razão de `memory/`
   * e `experiences/`: a lista é escrita à mão, e uma pasta FORA dela passa VACUAMENTE VERDE.
   * É a terceira vez que esta frase precisa ser escrita neste arquivo.
   */
  "evals",
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
  it("query e action de módulo só entram pelas TRÊS portas declaradas", () => {
    /**
     * Pares (arquivo relativo a `src/lib/ai/`, especificador) autorizados. Um par por linha,
     * cada um com o motivo. Lista NOMEADA, não padrão — o mesmo espírito do registry de
     * commands, que virou lista nomeada no Bloco 4 para que acrescentar um doesse.
     */
    const PARES_DECLARADOS: readonly (readonly [string, string])[] = [
      // 18-D · a MESMA normalização da importação, para os dois concordarem sobre o que é
      // "o mesmo estabelecimento". Alvo puro: só transforma texto.
      [path.join("vision", "duplicates.ts"), "@/lib/import/normalize"],
      // 18-E · a lista de vocabulário proibido, declarada UMA vez em módulo neutro. Alvo
      // puro: só listas de string e comparação de texto. Ver `src/lib/tone/vocabulary.ts`.
      [path.join("insights", "validate.ts"), "@/lib/tone/vocabulary"],
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
      /**
       * ⚠️ 18-E — `tone` NÃO é módulo de dado do usuário, e entra aqui mesmo assim.
       *
       * A lista acima é ESCRITA À MÃO, e é isso que a torna perigosa: uma pasta nova fora
       * dela passa verde sem provar nada. `src/lib/tone/vocabulary.ts` nasceu na 18-E para a
       * lista de termos proibidos existir uma vez só, e `src/lib/ai/ → @/lib/tone/` teria
       * passado sem ser examinado. Está aqui para o import ter de ser DECLARADO — e o
       * critério do par (alvo puro, sem I/O, sem escrita, sem Supabase) é atendido.
       */
      "tone",
    ];
    const adapters = path.join(RAIZ, "tools", "adapters");
    const commands = path.join(RAIZ, "approval", "commands");
    /**
     * ⚠️ **18-E — A TERCEIRA PORTA, E ELA É MAIS LARGA QUE AS DUAS PRIMEIRAS.**
     *
     * Um coletor lê dado do dono **fora do Tool Registry**: sem `guard.ts`, sem o teto do
     * descriptor e sem linha em `ai_tool_calls`. A porta só se justifica porque os três
     * controles voltam por outro caminho, e a implementação amarra os três:
     *
     *   `guard.ts` conferia `allow_*`  → a Server Action confere `allow_<modulo>` do módulo
     *                                    pedido, ANTES de chamar o coletor
     *   `maxRecords` do descriptor      → cada coletor declara o próprio teto e pede TETO + 1
     *   `ai_tool_calls`                 → `ai_insight_sources`, uma linha por indicador, com
     *                                     período, `n` e rota
     *
     * Pasta NOMEADA, não padrão: uma quarta porta continua exigindo editar este arquivo.
     */
    const coletores = path.join(RAIZ, "insights", "collectors");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(RAIZ)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const naPorta =
        arquivo.startsWith(adapters) ||
        arquivo.startsWith(commands) ||
        arquivo.startsWith(coletores);
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
        /**
         * ⚠️ 18-F Bloco 3 — a regex ERA `@\/lib\/[a-z-]+\/services$`, que só pega UM nível de
         * pasta. `@/lib/ai/memory/services` tem dois, e passaria: a partição dos commands de
         * memória viraria decoração, com os arquivos continuando dois e o grafo de imports um.
         * `/services$` cobre qualquer profundidade.
         */
        if (/\/services$/.test(spec) || spec.includes("/services/")) {
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
   * ║ 18-E — `insights/` NÃO MONTA CONSULTA A TABELA DE MÓDULO.                            ║
   * ║                                                                                     ║
   * ║ A regra é a mesma que vale para `tools/` desde a 18-B, e a razão é a mesma: uma      ║
   * ║ segunda leitura discordaria da primeira no primeiro campo novo, e o número do        ║
   * ║ insight deixaria de bater com o número da tela. Os coletores CHAMAM as queries do    ║
   * ║ módulo; quem fala com o banco continua sendo o módulo.                                ║
   * ║                                                                                     ║
   * ║ ⚠️ A porta dos coletores é larga (ver o docblock acima). Esta trava é o que a mantém  ║
   * ║ sendo uma porta para SERVIÇO, e não uma porta para o BANCO — sem ela, um coletor     ║
   * ║ escreveria o `select` que "só ele precisa" e a regra do domínio começaria a ser      ║
   * ║ reescrita ali: primeiro o select, depois o filtro, depois a decisão. Foi assim que a ║
   * ║ 18-C quase deixou a previsão do Financeiro montar consulta dentro de `approval/`.    ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("nenhum .from() nem select() em src/lib/ai/insights/ — nem nos coletores", () => {
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "insights"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const achado of chamaBanco(codigo)) {
        violacoes.push(`${path.relative(SRC, arquivo)} → ${achado}`);
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-F Bloco 4 — `experiences/` DECLARA O QUE LER; QUEM LÊ É O TOOL EXECUTOR.          ║
   * ║                                                                                     ║
   * ║ Um `.from()` aqui seria a QUARTA porta de leitura nascendo dentro de um catálogo —   ║
   * ║ e ela não teria `guard.ts`, não teria o teto do descriptor e não deixaria linha em   ║
   * ║ `ai_tool_calls`. A 18-E só justificou a terceira (`insights/collectors/`) porque os  ║
   * ║ três controles voltavam por outro caminho; aqui não há nada a justificar, porque as  ║
   * ║ leituras já existem e já são auditadas.                                              ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("nenhum .from() nem select() em src/lib/ai/experiences/", () => {
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "experiences"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const achado of chamaBanco(codigo)) {
        violacoes.push(`${path.relative(SRC, arquivo)} → ${achado}`);
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-E — O DASHBOARD NÃO CHAMA A IA. POR CONSTRUÇÃO, NÃO POR PROMESSA.                 ║
   * ║                                                                                     ║
   * ║ O dashboard geral é da Fase 12 e carrega a cada visita. Um insight gerado no         ║
   * ║ carregamento custaria dinheiro do dono a cada abertura de página — e o custo não     ║
   * ║ apareceria como decisão de ninguém, apareceria como conta no fim do mês.             ║
   * ║                                                                                     ║
   * ║ Por isso a geração e a leitura moram em arquivos separados: `/ia/insights` GERA (só  ║
   * ║ por clique, ou pelo job se o dono o ligar); o card do dashboard só LÊ `ai_insights`  ║
   * ║ vigentes. É o mesmo raciocínio que separou os três processos da 18-D — e este teste  ║
   * ║ é o que o mantém verdadeiro depois que alguém "só" acrescentar um botão de gerar ao  ║
   * ║ card.                                                                                ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("nada em dashboard/ alcança o runner de insight nem a action que o dispara", () => {
    const proibidos = [
      /(^|\/)ai\/server\/insight-runner$/,
      /(^|\/)actions\/ai-insights$/,
      // 18-E Bloco 4 — o job é a MESMA geração por outra porta. Deixá-lo de fora daqui
      // permitiria ao card do dashboard disparar a varredura inteira num carregamento.
      /(^|\/)ai\/server\/insight-job$/,
    ];
    const violacoes: string[] = [];

    for (const raiz of [
      path.join(SRC, "lib", "dashboard"),
      path.join(SRC, "components", "dashboard"),
      path.join(SRC, "app", "(app)", "dashboard"),
    ]) {
      for (const arquivo of listarArquivos(raiz)) {
        if (arquivo.endsWith(".test.ts")) continue;
        const codigo = fs.readFileSync(arquivo, "utf8");
        for (const spec of especificadores(codigo)) {
          if (proibidos.some((p) => p.test(spec))) {
            violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
          }
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-E — O VOCABULÁRIO PROIBIDO É DECLARADO UMA VEZ, E EM MÓDULO NEUTRO.               ║
   * ║                                                                                     ║
   * ║ Ele existia DUAS vezes, dentro de dois arquivos de teste e sem export, com           ║
   * ║ conteúdos diferentes: Dieta tinha "descontrol"/"exagerou", Treinos tinha             ║
   * ║ "preguiç"/"desculpa"/"faltou"/"sedentár". Nenhuma cobria a outra. A terceira cópia   ║
   * ║ — a do validador de insights — divergiria das duas no primeiro termo novo.            ║
   * ║                                                                                     ║
   * ║ Neutro e não dentro de `ai/`: com a lista no módulo de IA, `src/lib/notifications/`   ║
   * ║ passaria a importar de `src/lib/ai/` — o módulo geral dependendo do novo.             ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("VOCABULARIO_DE_COBRANCA é declarado UMA vez, e em src/lib/tone/", () => {
    const declaracoes: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      const codigo = fs.readFileSync(arquivo, "utf8");
      if (/(?:const|let|var)\s+VOCABULARIO_DE_COBRANCA\s*[:=]/.test(codigo)) {
        declaracoes.push(path.relative(SRC, arquivo).replace(/\\/g, "/"));
      }
    }

    expect(declaracoes).toEqual(["lib/tone/vocabulary.ts"]);
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

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-E · BLOCO 4 — SÓ O CRON ALCANÇA A VARREDURA.                                     ║
   * ║                                                                                     ║
   * ║ `server/insight-job.ts` é o ÚNICO ponto do sistema que roda um run de IA com dono    ║
   * ║ vindo de fora da sessão. Ele monta o `LeituraDoDono` sobre a service role, que       ║
   * ║ ignora a RLS — então quem o chama decide de quem são os dados lidos.                 ║
   * ║                                                                                     ║
   * ║ Uma Server Action que o alcançasse daria a um usuário autenticado o poder de         ║
   * ║ disparar a varredura de outro (e de gastar o orçamento dele). A porta é UMA, e ela   ║
   * ║ é a rota já protegida por CRON_SECRET.                                              ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("nada além de /api/cron/insights importa server/insight-job", () => {
    const PORTA = path.join(SRC, "app", "api", "cron", "insights", "route.ts");
    const alvo = /(^|\/)ai\/server\/insight-job$|^\.\/insight-job$/;
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.endsWith(".test.ts") || arquivo === PORTA) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (alvo.test(spec)) violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ 18-F Bloco 4 — AS DUAS PONTAS DO CATÁLOGO (§9.2), pela razão da invariante 80.      ║
   * ║                                                                                     ║
   * ║ Quem lê o catálogo decide o que uma experiência lê e com que prompt ela é escrita.  ║
   * ║ Espalhar isso daria a qualquer arquivo o poder de montar um "plano" e passá-lo ao   ║
   * ║ `runChat` — com lista de ferramentas própria e prompt próprio, sem passar por       ║
   * ║ `allow_cross_module` nem pela recusa de "todos os módulos pulados".                 ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("SÓ o experience-runner importa `experiences/catalog`", () => {
    const alvo = /(^|\/)ai\/experiences\/catalog$|^\.\.\/experiences\/catalog$/;
    const donos: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (alvo.test(spec)) {
          donos.push(path.relative(SRC, arquivo).replace(/\\/g, "/"));
        }
      }
    }

    expect(donos).toEqual(["lib/ai/server/experience-runner.ts"]);
  });

  it("SÓ o Route Handler do chat alcança `server/experience-runner`", () => {
    const alvo = /(^|\/)ai\/server\/experience-runner$|^\.\/experience-runner$/;
    const donos: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (alvo.test(spec)) {
          donos.push(path.relative(SRC, arquivo).replace(/\\/g, "/"));
        }
      }
    }

    expect(donos).toEqual(["app/api/ia/chat/route.ts"]);
  });

  /**
   * ⛔ O PLANO É UM OBJETO, E POR ISSO O `chat-runner` NÃO PRECISA DO CATÁLOGO.
   *
   * Ele executa uma lista que RECEBEU: não tem como buscar uma experiência, inventar uma
   * ferramenta nem trocar o prompt de redação. Irrepresentável vence recusado — a mesma
   * escolha de `LeituraDoDono` (invariante 79) e do campo `confianca` ausente (67).
   */
  it("o chat-runner NÃO conhece o catálogo — ele executa um plano que recebeu", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "server", "chat-runner.ts"), "utf8");
    for (const spec of especificadores(codigo)) {
      expect(spec, `chat-runner importou ${spec}`).not.toMatch(/experiences\/catalog$/);
      expect(spec, `chat-runner importou ${spec}`).not.toMatch(/experiences\/selection$/);
    }
  });

  it("a rota do Cron de insights confere CRON_SECRET antes de qualquer outra coisa", () => {
    // O proxy libera `/api/cron/*` (PUBLIC_PATHS). Sem esta checagem NA PRÓPRIA ROTA, ela
    // seria pública — e ela gasta dinheiro.
    const codigo = fs.readFileSync(
      path.join(SRC, "app", "api", "cron", "insights", "route.ts"),
      "utf8",
    );
    expect(codigo).toMatch(/process\.env\.CRON_SECRET/);
    expect(codigo).toMatch(/status:\s*401/);

    // ⚠️ Segredo AUSENTE também é 401. Uma rota que gasta dinheiro nunca fica aberta
    // "porque a variável não foi definida".
    expect(codigo).toMatch(/!secret\s*\|\|/);

    // A checagem vem ANTES de montar a service role.
    expect(codigo.indexOf("CRON_SECRET")).toBeLessThan(codigo.indexOf("createServiceClient()"));
  });
});

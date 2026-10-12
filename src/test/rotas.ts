/**
 * As rotas que o Next serve, lidas DO DISCO — uma resolução, num lugar só.
 *
 * Até a REDESIGN-02-D isto estava escrito duas vezes e FALTANDO em outras duas:
 *
 *  - `nav/active.test.ts` andava as pastas de `(app)` para provar que nenhuma rota
 *    acende dois itens do menu (02-C);
 *  - `search/ai-links.test.ts` montava o caminho do arquivo à mão, com `"(app)"` e
 *    `"ia"` escritos dentro e um `slice(1)` para tirar o primeiro segmento — uma
 *    resolução que para de valer no dia em que a rota muda de grupo ou ganha um nível,
 *    e que nesse dia continua VERDE, porque o teste só pergunta se um caminho existe;
 *  - `search/nutrition-links.test.ts` e `search/training-links.test.ts` PROMETIAM no
 *    cabeçalho que "cada rota daqui tem do outro lado uma página que existe" e nunca
 *    abriram o disco: conferiam o formato da string contra ela mesma.
 *
 * O que muda não é o algoritmo, é de onde vem a resposta. Perguntar "este link abre
 * alguma tela?" a partir da varredura das pastas é a mesma decisão que a 02-C tomou
 * para o item ativo: uma pergunta, uma fonte.
 *
 * ⚠️ MÓDULO DE APOIO A TESTE, e é por isso que ele mora em `src/test/` e não em
 * `src/lib/`: ele importa `node:fs`. Um módulo com `fs` que a tela alcance quebra o
 * build — hoje `node:fs` no `src/` só aparece em arquivos `*.test.ts` e aqui.
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "..", "app");

/** O valor que ocupa um segmento dinâmico quando a rota precisa ficar concreta. */
const ID_DE_EXEMPLO = "abc123";

/** `(app)`, `(auth)` — grupo organiza pastas e NÃO aparece na URL. */
function ehGrupo(segmento: string): boolean {
  return segmento.startsWith("(") && segmento.endsWith(")");
}

type Pagina = {
  /** A rota como o Next a declara, com `[id]` preservado. */
  padrao: string;
  /** Está dentro do grupo `(app)`, isto é, renderiza dentro da casca autenticada? */
  naCasca: boolean;
};

function varrer(): Pagina[] {
  const achadas: Pagina[] = [];
  const anda = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const alvo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) anda(alvo);
      else if (entrada.name === "page.tsx") {
        const brutos = path
          .relative(APP, path.dirname(alvo))
          .split(path.sep)
          .filter(Boolean);
        achadas.push({
          padrao: `/${brutos.filter((s) => !ehGrupo(s)).join("/")}`,
          naCasca: brutos.includes("(app)"),
        });
      }
    }
  };
  anda(APP);
  return achadas;
}

const PAGINAS = varrer();

if (PAGINAS.length === 0) {
  // Sem isto, uma varredura que olha para o lugar errado não falha: ela responde
  // "não existe" a tudo, e quem lê o vermelho vai procurar a rota que sumiu em vez
  // do caminho que mudou.
  throw new Error(
    `Nenhum page.tsx encontrado em ${APP} — a resolução de rotas está olhando para o lugar errado.`,
  );
}

/** Os padrões de rota do disco, com `[id]` preservado. Ex.: `/ia/conversas/[id]`. */
export const PADROES_DE_ROTA: readonly string[] = PAGINAS.map((p) => p.padrao).sort();

/**
 * As rotas da casca autenticada, com cada segmento dinâmico já trocado por um valor
 * concreto — é a lista com que se testa navegação, porque é o que o usuário abre.
 * Fora dela ficam `/`, `/login` e `/cadastro`, que não têm menu nem sidebar.
 */
export const ROTAS_DO_APP: readonly string[] = PAGINAS.filter((p) => p.naCasca)
  .map((p) => p.padrao.replace(/\[[^\]]+\]/g, ID_DE_EXEMPLO))
  .sort();

/**
 * Este link abre alguma tela?
 *
 * Aceita a forma em que os links realmente aparecem no sistema: com query string
 * (`?aba=despensa`), com âncora, e com um id concreto no lugar do `[id]`. Um segmento
 * dinâmico casa com UM segmento, nunca com vários — não há rota catch-all no projeto,
 * e fingir que há faria `/treinos/exercicios/a/b` passar.
 */
export function temPagina(link: string): boolean {
  const alvo = link.split(/[?#]/)[0].split("/").filter(Boolean);
  return PADROES_DE_ROTA.some((padrao) => {
    const partes = padrao.split("/").filter(Boolean);
    return (
      partes.length === alvo.length &&
      partes.every((parte, i) => (parte.startsWith("[") ? true : parte === alvo[i]))
    );
  });
}

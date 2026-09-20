#!/usr/bin/env node
/**
 * Orçamento de JS por rota — guarda-corpo da auditoria de performance (P5).
 *
 * ═══════════ POR QUE ESTE SCRIPT EXISTE ═══════════
 *
 * O `next build` do Next 16 **não imprime mais** o tamanho por rota. Sem isto, o bundle regride
 * em silêncio: cada `import` novo no topo de um `*-client.tsx` entra no primeiro byte da rota e
 * ninguém percebe até a tela ficar lenta no celular de alguém.
 *
 * A auditoria de 2026-09-19 derrubou a pior rota de 434,1 KB gz para 276,8 e a mediana de 214,9
 * para 210,2, tirando `recharts` e `zod` do carregamento inicial. Este script é o que impede
 * esse trabalho de evaporar.
 *
 * ═══════════ COMO ELE MEDE ═══════════
 *
 * Para cada rota, lê `page_client-reference-manifest.js` (que o Next escreve com os chunks de
 * todo componente client alcançável a partir da página), **deduplica** os chunks, comprime cada
 * um com gzip e soma. É o número que chega ao navegador no primeiro carregamento.
 *
 * ⚠️ Componente carregado com `next/dynamic` **sai** do manifest — que é exatamente o efeito
 * que se quer medir. Se alguém trocar um `next/dynamic` por um import estático, o número sobe
 * aqui.
 *
 * Uso: `npm run perf:bundle` (depois de `npm run build`).
 */

import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { globSync } from "node:fs";
import { join } from "node:path";

/** Orçamento acordado com o dono em 2026-09-19. */
const ORCAMENTO_KB = 250;

/**
 * Rotas com teto próprio, cada uma com o motivo escrito.
 *
 * ⛔ Uma exceção sem motivo é um orçamento que não existe. Para acrescentar uma, meça primeiro
 * e escreva por que a rota não pode caber — não arredonde o teto para cima só para o CI passar.
 */
const EXCECOES = {
  "/(app)/configuracoes": {
    tetoKb: 285,
    porque:
      "Mostra sete cartões de formulário ao mesmo tempo, todos visíveis sem interação. " +
      "Carregá-los sob demanda trocaria peso por piscada numa tela onde não há clique para " +
      "esconder o custo. Medido em 281,4 KB gz em 2026-09-19, depois do Bloco 2 da 18-F " +
      "(o botão flutuante mora na casca, então ele e o ícone novo do lucide entram em toda " +
      "rota `(app)` — o painel fica fora, atrás do `next/dynamic`); eram 279,2 KB depois do " +
      "Bloco 1 e 276,8 KB antes dela. ⛔ A FOLGA CAIU PARA 3,6 KB, e este teto NÃO SOBE: " +
      "uma exceção que cresce a cada bloco é um orçamento que não existe. O caminho é tirar " +
      "import da casca.",
  },
};

const RAIZ = ".next";
const MANIFESTS = join(RAIZ, "server/app/**/page_client-reference-manifest.js");

if (!existsSync(RAIZ)) {
  console.error(`✖ ${RAIZ}/ não existe. Rode \`npm run build\` antes.`);
  process.exit(1);
}

const cacheDeTamanho = new Map();
function tamanhoGz(chunk) {
  if (!cacheDeTamanho.has(chunk)) {
    const caminho = join(RAIZ, chunk.replace(/^\//, ""));
    try {
      cacheDeTamanho.set(chunk, gzipSync(readFileSync(caminho)).length);
    } catch {
      // Chunk citado pelo manifest mas ausente do disco: conta zero e não derruba a medição.
      cacheDeTamanho.set(chunk, 0);
    }
  }
  return cacheDeTamanho.get(chunk);
}

const rotas = [];
for (const arquivo of globSync(MANIFESTS)) {
  const conteudo = readFileSync(arquivo, "utf8");
  const chunks = new Set(conteudo.match(/static\/chunks\/[A-Za-z0-9_\-.]+\.js/g) ?? []);
  // ⚠️ `globSync` devolve o separador do sistema: no Windows vem `\`, e o `.replace` do sufixo
  // (escrito com `/`) não casa. A rota ficava com o nome do manifest colado, NENHUMA chave de
  // `EXCECOES` era encontrada e o teto próprio de `/(app)/configuracoes` não valia — o portão
  // reprovava no Windows e passava no CI (ubuntu). Normalizar antes de fatiar iguala os dois.
  const rota =
    arquivo
      .replaceAll("\\", "/")
      .replace(join(RAIZ, "server/app").replaceAll("\\", "/"), "")
      .replace("/page_client-reference-manifest.js", "") || "/";
  let total = 0;
  for (const chunk of chunks) total += tamanhoGz(chunk);
  rotas.push({ rota, kb: total / 1024, chunks: chunks.size });
}

if (rotas.length === 0) {
  // Sem isto, um build que mudou de formato faria o CI passar sem medir nada.
  console.error("✖ Nenhum manifest de rota encontrado. O build mudou de formato?");
  process.exit(1);
}

rotas.sort((a, b) => b.kb - a.kb);
const ordenadas = [...rotas].sort((a, b) => a.kb - b.kb);
const meio = Math.floor(ordenadas.length / 2);
const mediana =
  ordenadas.length % 2 ? ordenadas[meio].kb : (ordenadas[meio - 1].kb + ordenadas[meio].kb) / 2;

const estouros = [];
for (const r of rotas) {
  const excecao = EXCECOES[r.rota];
  const teto = excecao ? excecao.tetoKb : ORCAMENTO_KB;
  if (r.kb > teto) estouros.push({ ...r, teto, excecao });
}

console.log(`\nJS por rota (gzip, primeiro carregamento) — orçamento ${ORCAMENTO_KB} KB\n`);
for (const r of rotas.slice(0, 10)) {
  const teto = EXCECOES[r.rota]?.tetoKb ?? ORCAMENTO_KB;
  const marca = r.kb > teto ? "✖" : EXCECOES[r.rota] ? "~" : " ";
  console.log(`  ${marca} ${r.kb.toFixed(1).padStart(7)} KB  ${r.rota}  (${r.chunks} chunks)`);
}
console.log(
  `\n  mediana ${mediana.toFixed(1)} KB · ${rotas.length} rotas · ` +
    `${Object.keys(EXCECOES).length} com teto próprio\n`,
);

if (estouros.length > 0) {
  console.error(`✖ ${estouros.length} rota(s) acima do orçamento:\n`);
  for (const e of estouros) {
    console.error(`    ${e.rota}: ${e.kb.toFixed(1)} KB > ${e.teto} KB`);
    if (e.excecao) console.error(`      (teto próprio) ${e.excecao.porque}`);
  }
  console.error(
    "\n  O que costuma causar isto: um `import` estático de componente pesado no topo de um\n" +
      "  `*-client.tsx`. Gráficos (`recharts`) e formulários em diálogo (`zod` +\n" +
      "  `react-hook-form`) entram por `next/dynamic` — ver `src/components/shared/`\n" +
      "  (`chart-skeleton.tsx`, `use-lazy-dialog.ts`) e qualquer `*-impl.tsx` do projeto.\n",
  );
  process.exit(1);
}

console.log("✓ Todas as rotas dentro do orçamento.\n");

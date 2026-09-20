/**
 * Fase 18-F · Bloco 4 — IA · Quais leituras a experiência faz. Pura, `hoje` injetado.
 *
 * ⚠️ A chave exigida por cada ferramenta é LIDA DO REGISTRY (`requiredPermission`), nunca de
 * uma segunda tabela escrita à mão — a mesma disciplina de `permissaoDoModulo` (invariante 26).
 * Uma segunda lista ficaria para trás no dia em que uma ferramenta mudasse de módulo.
 *
 * ⚠️ E esta função NÃO é a última barreira: `guard.ts` confere a chave de novo na execução de
 * cada ferramenta. Ela existe para o panorama não gastar uma ida ao provedor descobrindo o que
 * já dava para saber — e para o motivo do pulo ser escrito em português, que o guard não faz.
 */

import { ROTULO_DA_PERMISSAO } from "@/lib/ai/constants";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import type { ToolPermission } from "@/lib/ai/tools/contracts";
import type { Experiencia } from "./contracts";

export type LeituraResolvida = { readonly toolName: string; readonly input: unknown };

export type PuloDeclarado = {
  readonly toolName: string;
  readonly permissao: ToolPermission;
  readonly modulo: string;
};

export type DecisaoDeLeituras = {
  readonly leituras: readonly LeituraResolvida[];
  readonly puladas: readonly PuloDeclarado[];
  /** Já em pt-BR, pronta para entrar no texto gravado. `""` quando nada foi pulado. */
  readonly aviso: string;
};

export function decidirLeituras(
  experiencia: Experiencia,
  permissions: Readonly<Record<string, boolean>>,
  hoje: string,
): DecisaoDeLeituras {
  const leituras: LeituraResolvida[] = [];
  const puladas: PuloDeclarado[] = [];

  for (const f of experiencia.ferramentas) {
    const descriptor = AI_TOOL_REGISTRY.find((t) => t.name === f.toolName);
    // Ferramenta que saiu do registry: pula em silêncio de propósito — não é uma porta que o
    // dono fechou, é código nosso fora de sincronia, e o teste do catálogo já a reprova.
    if (!descriptor) continue;

    const chave = descriptor.requiredPermission;
    // ⛔ `=== true`, nunca `!== false`: um mapa vazio (dono sem linha de preferências) liberaria
    // tudo com a comparação frouxa. Ausência é chave desligada.
    if (permissions[chave] === true) {
      leituras.push({ toolName: f.toolName, input: f.argumentos(hoje) });
      continue;
    }
    puladas.push({
      toolName: f.toolName,
      permissao: chave,
      modulo: ROTULO_DA_PERMISSAO[chave].titulo,
    });
  }

  return { leituras, puladas, aviso: avisoDoQueFicouDeFora(puladas) };
}

/**
 * A frase que vai no TEXTO GRAVADO — não é um pedido ao modelo.
 *
 * ⛔ Pedir ao modelo "diga o que ficou de fora" é a mesma família de erro que a 18-E resolveu
 * tirando os números do texto: ele obedece quase sempre, e "quase sempre" num panorama diário
 * é uma omissão por mês. Módulo nomeado SEM repetição (duas ferramentas do mesmo módulo
 * desligado são um nome só).
 */
export function avisoDoQueFicouDeFora(puladas: readonly PuloDeclarado[]): string {
  if (puladas.length === 0) return "";
  const nomes = [...new Set(puladas.map((p) => p.modulo))];
  const lista = new Intl.ListFormat("pt-BR", {
    style: "long",
    type: "conjunction",
  }).format(nomes);
  const verbo = nomes.length === 1 ? "ficou" : "ficaram";
  return `Fora deste panorama: ${lista} — a leitura ${verbo} desligada nas suas preferências. Ligue em /ia/configuracoes se quiser que entre da próxima vez.`;
}

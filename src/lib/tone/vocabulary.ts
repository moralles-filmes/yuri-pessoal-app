/**
 * Fase 18-E — O VOCABULÁRIO PROIBIDO, DECLARADO UMA VEZ SÓ.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ISTO SAIU DE DENTRO DOS TESTES                                                ║
 * ║                                                                                       ║
 * ║ Até a 18-E a lista existia DUAS vezes, dentro de dois arquivos de teste e sem export: ║
 * ║ `notifications/nutrition.test.ts` e `notifications/training.test.ts`. Elas nasceram    ║
 * ║ parecidas e ficaram diferentes — Dieta tinha "descontrol" e "exagerou"; Treinos tinha ║
 * ║ "preguiç", "desculpa", "faltou" e "sedentár". Nenhuma das duas cobria a outra.        ║
 * ║                                                                                       ║
 * ║ Uma TERCEIRA cópia dentro de `insights/` divergiria das duas no primeiro termo novo.  ║
 * ║ Este arquivo é a união, e os dois testes passam a importá-la.                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **E há uma diferença de NATUREZA entre os dois usos.** Nas 16-F/17-F o texto sai de
 * função pura, então um TESTE basta: a suíte varre todas as saídas possíveis e pronto. Na
 * 18-E o texto vem do modelo em RUNTIME, e não existe função para varrer. Lá a checagem roda
 * em produção, dentro de `insights/validate.ts` — a suíte deixa de ser a última linha de
 * defesa e passa a cobrir o validador.
 *
 * ⚠️ **Módulo NEUTRO, de propósito.** Se a lista morasse em `src/lib/ai/`, o módulo de
 * notificações passaria a importar do módulo de IA — o geral dependendo do novo, que é a seta
 * ao contrário. Puro: só listas de string e comparação de texto. Sem I/O, sem Supabase.
 */

/**
 * Vocabulário de COBRANÇA. O que ele impede é o sistema falar com o dono como quem cobra:
 * atribuindo falha, apontando repetição ("de novo", "mais uma vez") ou nomeando um estado
 * pessoal ("preguiç", "sedentár", "descontrol").
 *
 * União das duas listas de 2026-08-04. Termo em minúscula e sem sufixo, para casar por
 * SUBSTRING: "fracass" pega fracassou, fracassando e fracasso; "preguiç" pega preguiça e
 * preguiçoso; "sedentár" pega sedentário e sedentarismo.
 */
export const VOCABULARIO_DE_COBRANCA: readonly string[] = [
  // — atribuição de falha —
  "falhou",
  "falhando",
  "fracass",
  "errado",
  "ruim",
  "faltou",
  // — apontar repetição, que é o que transforma um lembrete em cobrança —
  "de novo",
  "mais uma vez",
  // — julgamento em segunda pessoa —
  "você não",
  "você deveria",
  "precisa parar",
  "esqueceu",
  // — sentimento imposto —
  "culpa",
  "vergonha",
  // — rótulo de estado pessoal (Dieta) —
  "descontrol",
  "exagerou",
  // — rótulo de estado pessoal (Treinos) —
  "preguiç",
  "desculpa",
  "sedentár",
];

/**
 * Vocabulário de PRESCRIÇÃO. Nasceu na 17-F, e vale para os dois módulos pela mesma razão:
 * o sistema organiza e mostra, não receita. "o ideal" é o mais traiçoeiro dos cinco — ele
 * transforma o registro do dono na comparação com um alvo que ninguém combinou com ele.
 */
export const VOCABULARIO_DE_PRESCRICAO: readonly string[] = [
  "tente",
  "aumente",
  "você deve",
  "recomendamos",
  "o ideal",
];

/** As duas listas juntas — o que a 18-E confere em runtime. */
export const VOCABULARIO_PROIBIDO: readonly string[] = [
  ...VOCABULARIO_DE_COBRANCA,
  ...VOCABULARIO_DE_PRESCRICAO,
];

/**
 * Devolve os termos proibidos encontrados no texto, na ordem em que estão na lista.
 *
 * ⚠️ Casa por SUBSTRING, sem fronteira de palavra, e isso é deliberado: o objetivo aqui não é
 * classificar português, é recusar um texto que passe perto. Errar para "recusei um texto que
 * estava bom" é o erro barato; o caro é o dono ler que falhou.
 *
 * `toLocaleLowerCase("pt-BR")` e não `toLowerCase()` — é o mesmo preparo que os dois testes
 * já faziam, e o que garante que "VOCÊ NÃO" case com "você não".
 */
export function termosProibidosEm(
  texto: string,
  lista: readonly string[] = VOCABULARIO_PROIBIDO,
): string[] {
  const alvo = texto.toLocaleLowerCase("pt-BR");
  return lista.filter((termo) => alvo.includes(termo));
}

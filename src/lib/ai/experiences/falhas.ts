/**
 * Fase 18-F · Bloco 4 — IA · A frase da leitura que FALHOU. Pura, sem I/O e sem imports do app.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ PELO MESMO MOTIVO DE `avisoDoQueFicouDeFora`: A FRASE É NOSSA.                          ║
 * ║                                                                                           ║
 * ║ Quando uma ferramenta falha ou estoura o prazo, o bloco que chega ao modelo diz "diga     ║
 * ║ que não conseguiu obter o dado". Isso é uma INSTRUÇÃO, e instrução transfere a garantia   ║
 * ║ para a obediência dele. Redigindo um texto corrido, o modelo simplesmente OMITE o módulo  ║
 * ║ — e o panorama sai parecendo completo, que é a mentira que a 18-E combateu tirando os     ║
 * ║ números de dentro do texto.                                                               ║
 * ║                                                                                           ║
 * ║ ⚠️ E ela é SEPARADA da frase do módulo pulado, de propósito: aquela manda o dono a        ║
 * ║ `/ia/configuracoes` ligar uma chave. Aqui a chave já está ligada — mandá-lo até lá seria  ║
 * ║ fazê-lo procurar um interruptor que não existe para um problema que não é dele.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * @param rotulos Os nomes em pt-BR dos módulos cujas leituras não chegaram — na ordem do
 *   catálogo, e com repetição permitida (duas ferramentas do mesmo módulo viram um nome só).
 */
export function avisoDeLeiturasQueFalharam(rotulos: readonly string[]): string {
  if (rotulos.length === 0) return "";
  const nomes = [...new Set(rotulos)];
  const lista = new Intl.ListFormat("pt-BR", {
    style: "long",
    type: "conjunction",
  }).format(nomes);
  const sujeito = nomes.length === 1 ? "a leitura falhou" : "as leituras falharam";
  return `Fora deste panorama: ${lista} — ${sujeito} agora, e não foi preferência sua. Tente de novo daqui a pouco.`;
}

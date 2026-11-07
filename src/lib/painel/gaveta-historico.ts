/**
 * 08-C1 — como fechar a gaveta de registros sem deixar entrada duplicada no histórico.
 *
 * Abrir a gaveta é um `push` de `?detalhe=…`: o histórico fica [página, página+detalhe].
 * Quem fechou pelo clique tem para onde voltar — usar `back` desfaz o push e o voltar do
 * navegador não reabre a mesma tela. Já quem chegou pela URL compartilhada (ou recarregou)
 * não tem essa entrada: um `back` sairia do app, então ali é `replace` tirando o parâmetro.
 *
 * Sem imports: este arquivo vai para o bundle do client.
 */
export function comoFecharAGaveta(p: { abertaPorNavegacao: boolean }): "voltar" | "substituir" {
  return p.abertaPorNavegacao ? "voltar" : "substituir";
}

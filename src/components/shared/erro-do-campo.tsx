/**
 * A mensagem de erro do servidor SOB O CAMPO (REDESIGN-07-C, D5).
 *
 * O campo correspondente recebe `aria-invalid` e aponta para este `id` em `aria-describedby`
 * — é o que faz o leitor de tela ler a mensagem junto com o rótulo. Sem mensagem, nada é
 * renderizado (e o campo não deve apontar para um id que não existe).
 */
/** Props do campo com erro: `{...ariaDoErro("x-erro", erros.x)}` (vazio quando não há erro). */
export function ariaDoErro(
  id: string,
  mensagem: string | undefined,
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  return mensagem ? { "aria-invalid": true, "aria-describedby": id } : {};
}

export function ErroDoCampo({ id, mensagem }: { id: string; mensagem: string | undefined }) {
  if (!mensagem) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {mensagem}
    </p>
  );
}

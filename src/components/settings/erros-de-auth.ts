/**
 * REDESIGN-07-D · D4 — Configurações · O erro do Supabase Auth em pt-BR, por CLASSE.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ SÓ A REAUTENTICAÇÃO COM `invalid_credentials` CULPA A SENHA.                          ║
 * ║                                                                                       ║
 * ║ Antes, qualquer falha do `signInWithPassword` virava "Senha atual incorreta." —       ║
 * ║ inclusive rede fora e limite de tentativas —, e a troca de e-mail repassava           ║
 * ║ `error.message` em inglês. Culpar a senha numa queda de rede faz o dono duvidar dela  ║
 * ║ e tentar de novo até esbarrar no limite. Erro sem `code` (versão antiga, proxy) cai   ║
 * ║ na frase genérica, que também não culpa ninguém.                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Os códigos são os declarados pelo `@supabase/auth-js` instalado (2.108.2). O texto do
 * Supabase nunca chega à tela. Puro, sem import.
 */

export type EtapaDeAuth = "reautenticar" | "trocar-senha" | "trocar-email";
export type CampoDeAuth = "current_password" | "new_password" | "email";

const REDE = "Não foi possível falar com o servidor de login. Nada foi alterado; tente de novo.";
const GENERICA = "Não foi possível concluir. Nada foi alterado.";
const LIMITE = "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";

function campoDoObjeto(erro: unknown, chave: string): unknown {
  return typeof erro === "object" && erro !== null ? (erro as Record<string, unknown>)[chave] : undefined;
}

export function mensagemDeErroDeAuth(
  erro: unknown,
  etapa: EtapaDeAuth,
): { campo: CampoDeAuth | null; mensagem: string } {
  const nome = campoDoObjeto(erro, "name");
  const code = campoDoObjeto(erro, "code");
  const status = campoDoObjeto(erro, "status");

  // `fetch` que nem chegou ao servidor: o SDK embrulha em AuthRetryableFetchError, ou o
  // TypeError escapa cru. Nada foi alterado — e a senha não tem culpa nenhuma.
  if (nome === "AuthRetryableFetchError" || erro instanceof TypeError) {
    return { campo: null, mensagem: REDE };
  }

  switch (code) {
    case "invalid_credentials":
      return etapa === "reautenticar"
        ? { campo: "current_password", mensagem: "Senha atual incorreta." }
        : { campo: null, mensagem: GENERICA };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return { campo: null, mensagem: LIMITE };
    case "weak_password":
      return { campo: "new_password", mensagem: "A nova senha não foi aceita: use uma senha mais forte." };
    case "same_password":
      return { campo: "new_password", mensagem: "A nova senha é igual à atual." };
    case "email_exists":
    case "email_address_invalid":
      // Não diz se o e-mail já tem conta: a frase é a mesma para os dois casos.
      return { campo: "email", mensagem: "Este e-mail não pode ser usado." };
  }

  if (status === 429) return { campo: null, mensagem: LIMITE };
  return { campo: null, mensagem: GENERICA };
}

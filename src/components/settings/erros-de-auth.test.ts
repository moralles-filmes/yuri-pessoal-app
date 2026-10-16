import { describe, expect, it } from "vitest";
import { mensagemDeErroDeAuth } from "./erros-de-auth";

/**
 * REDESIGN-07-D · D4 — o erro do Supabase Auth vira frase em pt-BR por CLASSE (spec §6.4).
 *
 * O defeito: a troca de senha mostrava "Senha atual incorreta." para QUALQUER falha da
 * reautenticação — inclusive rede fora e limite de tentativas —, e a troca de e-mail repassava
 * `error.message` em inglês. Culpar a senha numa queda de rede faz o dono duvidar da própria
 * senha e tentar de novo até travar a conta no limite.
 */
const REDE = "Não foi possível falar com o servidor de login. Nada foi alterado; tente de novo.";
const GENERICA = "Não foi possível concluir. Nada foi alterado.";
const LIMITE = "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";

/** O formato de `AuthApiError` do @supabase/auth-js 2.108.2: name, status, code. */
const erroDeApi = (code: string | undefined, status = 400) =>
  Object.assign(new Error("texto do servidor em inglês"), { name: "AuthApiError", status, code });

describe("mensagemDeErroDeAuth", () => {
  it("senha atual errada na reautenticação vai para o campo", () => {
    expect(mensagemDeErroDeAuth(erroDeApi("invalid_credentials"), "reautenticar")).toEqual({
      campo: "current_password",
      mensagem: "Senha atual incorreta.",
    });
  });

  it("rede fora NÃO culpa a senha (M38, Review Focus 5)", () => {
    const retentavel = Object.assign(new Error("Failed to fetch"), {
      name: "AuthRetryableFetchError",
      status: 0,
    });
    expect(mensagemDeErroDeAuth(retentavel, "reautenticar")).toEqual({ campo: null, mensagem: REDE });
    expect(mensagemDeErroDeAuth(new TypeError("Failed to fetch"), "reautenticar")).toEqual({
      campo: null,
      mensagem: REDE,
    });
  });

  it("erro sem code (versão antiga, proxy) cai na genérica — que também não culpa a senha", () => {
    expect(mensagemDeErroDeAuth(erroDeApi(undefined), "reautenticar")).toEqual({
      campo: null,
      mensagem: GENERICA,
    });
    expect(mensagemDeErroDeAuth("qualquer coisa", "trocar-senha")).toEqual({
      campo: null,
      mensagem: GENERICA,
    });
    expect(mensagemDeErroDeAuth(null, "trocar-email")).toEqual({ campo: null, mensagem: GENERICA });
  });

  it("invalid_credentials fora da reautenticação não vira 'senha atual incorreta'", () => {
    expect(mensagemDeErroDeAuth(erroDeApi("invalid_credentials"), "trocar-email")).toEqual({
      campo: null,
      mensagem: GENERICA,
    });
  });

  it("limite de tentativas, por code e por status 429", () => {
    for (const code of ["over_request_rate_limit", "over_email_send_rate_limit"]) {
      expect(mensagemDeErroDeAuth(erroDeApi(code, 429), "trocar-email").mensagem).toBe(LIMITE);
    }
    expect(mensagemDeErroDeAuth(erroDeApi(undefined, 429), "reautenticar")).toEqual({
      campo: null,
      mensagem: LIMITE,
    });
  });

  it("senha nova recusada fica no campo da senha nova", () => {
    expect(mensagemDeErroDeAuth(erroDeApi("weak_password", 422), "trocar-senha")).toEqual({
      campo: "new_password",
      mensagem: "A nova senha não foi aceita: use uma senha mais forte.",
    });
    expect(mensagemDeErroDeAuth(erroDeApi("same_password", 422), "trocar-senha")).toEqual({
      campo: "new_password",
      mensagem: "A nova senha é igual à atual.",
    });
  });

  it("e-mail recusado fica no campo, sem dizer se ele já existe", () => {
    for (const code of ["email_exists", "email_address_invalid"]) {
      expect(mensagemDeErroDeAuth(erroDeApi(code, 422), "trocar-email")).toEqual({
        campo: "email",
        mensagem: "Este e-mail não pode ser usado.",
      });
    }
  });

  it("o texto do Supabase nunca chega à tela", () => {
    const r = mensagemDeErroDeAuth(erroDeApi("algum_codigo_novo"), "trocar-senha");
    expect(r.mensagem).not.toContain("inglês");
    expect(r).toEqual({ campo: null, mensagem: GENERICA });
  });
});

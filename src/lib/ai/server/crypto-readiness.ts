import "server-only";

/**
 * Fase 18-A — IA · Leitura e validação do keyring no ambiente. FAIL-CLOSED SÓ PARA IA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ SEM `AI_MASTER_KEYS`, O RESTO DO SISTEMA CONTINUA FUNCIONANDO NORMALMENTE.            ║
 * ║                                                                                       ║
 * ║ Só `/ia` fica indisponível, com explicação na tela; as ações de credencial ficam      ║
 * ║ desabilitadas; `/api/ia/chat` responde 503 AI_CRYPTO_NOT_CONFIGURED. Financeiro,      ║
 * ║ TO-DO, Agenda, Dieta e Treinos não sabem que este módulo existe.                       ║
 * ║                                                                                       ║
 * ║ Por isso NADA aqui lança no topo do módulo: um `throw` em tempo de import derrubaria  ║
 * ║ o build inteiro por causa de uma variável de ambiente de um módulo opcional.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A validação roda em serviço de readiness SERVER-SIDE. Nenhum parsing de chave acontece em
 * código client — o segredo nem chega perto do navegador.
 */

import { parseKeyring, type Keyring, type KeyringProblem } from "./keyring";

export type CryptoReadiness =
  | { readonly ready: true; readonly keyring: Keyring }
  | {
      readonly ready: false;
      readonly problem: KeyringProblem;
      /** Texto pt-BR para a tela. NÃO revela conteúdo de chave. */
      readonly message: string;
    };

/**
 * Mensagens por problema. Repare que nenhuma ecoa o valor da variável — só diz o que está
 * errado e o que fazer. "Sua chave é 'abc123'" seria vazamento por mensagem de erro.
 */
const MENSAGEM: Record<KeyringProblem, string> = {
  ausente:
    "Inteligência Artificial não configurada. Defina AI_MASTER_KEYS e AI_MASTER_KEY_CURRENT no ambiente do servidor.",
  formato_invalido:
    "A configuração de criptografia da IA está inválida: AI_MASTER_KEYS não está no formato 'versao:base64'.",
  tamanho_invalido:
    "A configuração de criptografia da IA está inválida: a chave-mestra precisa ter exatamente 32 bytes (use `openssl rand -base64 32`).",
  versao_duplicada:
    "A configuração de criptografia da IA está inválida: há versões repetidas em AI_MASTER_KEYS.",
  versao_corrente_ausente:
    "A configuração de criptografia da IA está inválida: AI_MASTER_KEY_CURRENT aponta para uma versão que não existe em AI_MASTER_KEYS.",
  versao_corrente_invalida:
    "A configuração de criptografia da IA está inválida: AI_MASTER_KEY_CURRENT precisa ser um inteiro positivo.",
};

/**
 * ⚠️ Cache POR PROCESSO. Guarda o keyring já validado — nunca uma chave de API decifrada.
 * A distinção é o ponto: material de chave-mestra já está na memória do processo de qualquer
 * jeito (veio do ambiente); segredo de usuário decifrado, não, e não pode entrar aqui.
 */
let cache: CryptoReadiness | null = null;

export function getCryptoReadiness(): CryptoReadiness {
  if (cache) return cache;

  const resultado = parseKeyring(
    process.env.AI_MASTER_KEYS,
    process.env.AI_MASTER_KEY_CURRENT,
  );

  cache = resultado.ok
    ? { ready: true, keyring: resultado.keyring }
    : {
        ready: false,
        problem: resultado.reason,
        message: MENSAGEM[resultado.reason],
      };

  return cache;
}

/** Só para teste: derruba o cache entre cenários. */
export function resetCryptoReadinessCache(): void {
  cache = null;
}

export const AI_CRYPTO_NOT_CONFIGURED = "AI_CRYPTO_NOT_CONFIGURED";

/**
 * Atalho para a UI. Devolve `null` quando está tudo certo, e a mensagem quando não está —
 * assim a tela escreve o motivo em vez de só desabilitar um botão sem explicação.
 */
export function cryptoProblemMessage(): string | null {
  const r = getCryptoReadiness();
  return r.ready ? null : r.message;
}

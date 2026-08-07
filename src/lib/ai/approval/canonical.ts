/**
 * Fase 18-C · Bloco 3 — IA · A SERIALIZAÇÃO CANÔNICA DO EFEITO, e o hash que sai dela.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O HASH COBRE O EFEITO, NÃO OS ARGUMENTOS DO MODELO (§3.4 do design).                  ║
 * ║                                                                                       ║
 * ║ Hash sobre os argumentos não protege do que precisa proteger. A proposta é imutável;  ║
 * ║ QUEM MUDA É O MUNDO. Entre propor e confirmar, o dia pode virar (e a transação cair   ║
 * ║ em outra fatura), a tarefa recorrente pode ter avançado, o saldo pode ter mudado. Os  ║
 * ║ argumentos continuariam idênticos o tempo todo.                                       ║
 * ║                                                                                       ║
 * ║ Então o que entra é: ferramenta, versão, command, payload normalizado, os ids das     ║
 * ║ entidades RESOLVIDAS e a previsão do efeito EXIBIDA NA TELA. O Action Executor        ║
 * ║ recalcula tudo isso no momento de executar; divergiu, recusa.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * PURO. `node:crypto` não é I/O — é a mesma função para a mesma entrada, sempre.
 */

import { createHash } from "node:crypto";

/**
 * ⚠️ O PREFIXO DE VERSÃO NÃO É ENFEITE.
 *
 * Se a regra de canonicalização mudar (ordenação, tratamento de `-0`, normalização Unicode),
 * um hash antigo e um novo passariam a poder coincidir para efeitos DIFERENTES — e o
 * recálculo da execução aprovaria o que devia recusar. Com o prefixo, mudar a regra troca a
 * versão, e toda proposta anterior passa a divergir: o pior caso vira "proposta velha
 * recusada, proponha de novo", que é seguro.
 */
export const VERSAO_CANONICA = "ia-efeito-v1";

/** O que a canonicalização aceita. Qualquer outra coisa é erro, nunca conversão silenciosa. */
export type ValorCanonico =
  | string
  | number
  | boolean
  | null
  | readonly ValorCanonico[]
  | { readonly [chave: string]: ValorCanonico | undefined };

export class ErroDeCanonicalizacao extends Error {
  constructor(motivo: string, readonly caminho: string) {
    super(`${motivo} em ${caminho}`);
    this.name = "ErroDeCanonicalizacao";
  }
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS DECISÕES QUE FAZEM DUAS EXECUÇÕES DESTA FUNÇÃO DAREM A MESMA STRING                ║
 * ║                                                                                       ║
 * ║ • CHAVES ORDENADAS por code unit. `{a,b}` e `{b,a}` são o mesmo efeito; a ordem de     ║
 * ║   inserção de um objeto JS não é, e um `jsonb` do Postgres devolve numa ordem que não  ║
 * ║   é a de escrita. Sem isto, o recálculo divergiria de propósito nenhum.                ║
 * ║                                                                                       ║
 * ║ • ARRAYS PRESERVAM A ORDEM. Ordenar seria errado: a ordem das alternativas de          ║
 * ║   substituição é a prioridade DO USUÁRIO (invariante 16 da Dieta), e a ordem dos itens ║
 * ║   de uma ação em massa é o que ele leu.                                                ║
 * ║                                                                                       ║
 * ║ • `undefined` em objeto = campo AUSENTE (igual ao `JSON.stringify`). Em array é ERRO:  ║
 * ║   ali ele seria posição, e "posição sem valor" não tem representação honesta.          ║
 * ║                                                                                       ║
 * ║ • NÚMERO NÃO-FINITO É ERRO. `JSON.stringify(NaN)` devolve `null` — um valor que não    ║
 * ║   existe viraria um valor que existe, e o hash não acusaria nada.                      ║
 * ║                                                                                       ║
 * ║ • `-0` VIRA `0`. São o mesmo número em JS (`-0 === 0`), e "menos zero centavos" não é  ║
 * ║   efeito diferente de "zero centavos" — mas `String(-0)` é `"0"` e `JSON.stringify(-0)`║
 * ║   é `"0"`, enquanto `Object.is` os separa. Normalizar aqui evita depender de qual das  ║
 * ║   duas semânticas o caminho de cima usou.                                              ║
 * ║                                                                                       ║
 * ║ • STRING NORMALIZADA EM NFC. "café" digitado com acento composto e com acento          ║
 * ║   combinante é O MESMO TEXTO, e o Postgres guarda os bytes que recebeu sem normalizar. ║
 * ║   Sem NFC, o recálculo recusaria uma proposta idêntica — e a recusa seria inexplicável ║
 * ║   para quem olhasse os dois textos na tela.                                            ║
 * ║                                                                                       ║
 * ║ • `Date`, `BigInt`, função, símbolo e classe SÃO ERRO. Um `Date` aceito aqui viraria   ║
 * ║   `toISOString()` implícito — e um bug de fuso passaria a se esconder dentro do hash,  ║
 * ║   que é o último lugar do sistema onde alguém iria procurá-lo.                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function canonicalizar(valor: unknown, caminho = "$"): string {
  if (valor === null) return "null";

  const tipo = typeof valor;

  if (tipo === "boolean") return valor ? "true" : "false";

  if (tipo === "number") {
    const n = valor as number;
    if (!Number.isFinite(n)) {
      throw new ErroDeCanonicalizacao("número não finito", caminho);
    }
    // `n === 0` casa com -0; `0` normaliza os dois para a mesma saída.
    return JSON.stringify(n === 0 ? 0 : n);
  }

  if (tipo === "string") {
    return JSON.stringify((valor as string).normalize("NFC"));
  }

  if (Array.isArray(valor)) {
    const partes = valor.map((item, i) => {
      if (item === undefined) {
        throw new ErroDeCanonicalizacao("undefined dentro de array", `${caminho}[${i}]`);
      }
      return canonicalizar(item, `${caminho}[${i}]`);
    });
    return `[${partes.join(",")}]`;
  }

  if (tipo === "object") {
    // Só objeto literal. `Date`, `Map`, `Set`, `Buffer` e instância de classe caem fora —
    // todos têm serialização "óbvia" que esconderia a decisão de quem os pôs aqui.
    const proto = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) {
      throw new ErroDeCanonicalizacao(
        `objeto de tipo não suportado (${(valor as object).constructor?.name ?? "desconhecido"})`,
        caminho,
      );
    }
    const registro = valor as Record<string, unknown>;
    const chaves = Object.keys(registro)
      .filter((k) => registro[k] !== undefined)
      .sort();
    const partes = chaves.map(
      (k) => `${JSON.stringify(k.normalize("NFC"))}:${canonicalizar(registro[k], `${caminho}.${k}`)}`,
    );
    return `{${partes.join(",")}}`;
  }

  throw new ErroDeCanonicalizacao(`tipo não suportado (${tipo})`, caminho);
}

/**
 * O efeito de uma proposta, na forma em que ele é hasheado.
 *
 * `entidades` são os ids RESOLVIDOS — "a tarefa do mercado" já virou um uuid. Elas entram
 * porque resolver para outro registro entre propor e confirmar é outra proposta, e o texto
 * do pedido continuaria idêntico.
 */
export type EfeitoDaProposta = {
  readonly tool: string;
  readonly toolVersion: string;
  readonly command: string;
  readonly payload: ValorCanonico;
  readonly entidades: readonly { readonly tipo: string; readonly id: string }[];
  readonly previsao: ValorCanonico;
};

/** A string que o hash cobre. Exposta para o teste poder olhar o que foi hasheado. */
export function serializarEfeito(efeito: EfeitoDaProposta): string {
  return `${VERSAO_CANONICA}\n${canonicalizar({
    tool: efeito.tool,
    toolVersion: efeito.toolVersion,
    command: efeito.command,
    payload: efeito.payload,
    // ⚠️ `map` explícito: se um dia `entidades` ganhar `rota` (como `ToolRef` tem), a rota
    // NÃO deve entrar no hash — ela é apresentação, e mudá-la recusaria propostas válidas.
    // Sem este `map`, o campo novo entraria sozinho no dia em que fosse acrescentado.
    entidades: efeito.entidades.map((e) => ({ tipo: e.tipo, id: e.id })),
    previsao: efeito.previsao,
  })}`;
}

/** sha256 hex minúsculo — o formato que o CHECK de `effect_hash` exige no banco. */
export function hashDoEfeito(efeito: EfeitoDaProposta): string {
  return createHash("sha256").update(serializarEfeito(efeito), "utf8").digest("hex");
}

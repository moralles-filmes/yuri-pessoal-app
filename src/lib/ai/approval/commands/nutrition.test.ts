/**
 * Fase 18-C · Bloco 4 — IA · Os commands de Dieta.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ASSERÇÃO CENTRAL DESTE ARQUIVO É UMA SÓ: NUTRIENTE AUSENTE NÃO VIRA ZERO.           ║
 * ║                                                                                       ║
 * ║ É a invariante 1 do módulo, e ela é mais perigosa aqui do que em qualquer outra tela:  ║
 * ║ o dono lê a previsão, vê "0 g de proteína" e confirma achando que a informação existe. ║
 * ║ O snapshot congelado guarda `null` de qualquer forma — então a tela e o histórico      ║
 * ║ passariam a discordar, e o histórico é imutável.                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import { EfeitoImpossivel } from "../contracts";
import {
  desfazerConsumoEntrada,
  parseComConsumo,
  registrarConsumoEntrada,
  rotaDoDiario,
  umSo,
  valorOuAusente,
  type RegistrarConsumoEntrada,
} from "./nutrition-preview";

const UUID = "3f1a7c60-9d2b-4a11-8f37-2c9a1b7e5d40";

/* ══════════════════════════════════════════════════════════════════════════════════════
   ⛔ Ausência de dado
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("valorOuAusente — a invariante 1 aplicada à previsão", () => {
  it("`null` NUNCA vira zero", () => {
    expect(valorOuAusente(null, "g")).toBe("não informado na fonte");
    expect(valorOuAusente(null, "kcal", 0)).toBe("não informado na fonte");
    // A asserção que importa, dita do jeito que erraria: o texto não pode conter um número.
    expect(valorOuAusente(null, "g")).not.toMatch(/\d/);
  });

  /**
   * ⚠️ E o contrário também: ZERO MEDIDO É ZERO, e tem de aparecer como zero. Um alimento com
   * 0 g de gordura medida (clara de ovo) informa isso; trocar por "não informado" seria o
   * mesmo erro na direção oposta — esconder uma medição que existe.
   */
  it("zero MEDIDO continua sendo zero", () => {
    expect(valorOuAusente(0, "g")).toBe("0 g");
    expect(valorOuAusente(0, "kcal", 0)).toBe("0 kcal");
  });

  it("arredonda como a tela do diário: energia sem casas, macro com uma", () => {
    expect(valorOuAusente(123.456, "kcal", 0)).toBe("123 kcal");
    expect(valorOuAusente(12.345, "g")).toBe("12,3 g");
  });

  it("valor não finito é tratado como ausente, não como número", () => {
    expect(valorOuAusente(Number.NaN, "g")).toBe("não informado na fonte");
    expect(valorOuAusente(Number.POSITIVE_INFINITY, "g")).toBe("não informado na fonte");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   A entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("o schema de entrada", () => {
  it("é `.strict()` — campo a mais é recusado, não ignorado", () => {
    const r = registrarConsumoEntrada.safeParse({
      alimento: "arroz",
      quantidade: 100,
      refeicao: "Almoço",
      user_id: UUID,
    });
    expect(r.success).toBe(false);
  });

  it("não existe campo de identificação de usuário", () => {
    const chaves = Object.keys(registrarConsumoEntrada.shape);
    expect(chaves).not.toContain("user_id");
    expect(chaves).not.toContain("owner_id");
  });

  /**
   * ⛔ O CAMPO QUE NÃO EXISTE, E É A TRAVA MAIS IMPORTANTE DESTA FERRAMENTA.
   *
   * Não há `calorias`, `proteina`, `nutrientes` nem `snapshot` na entrada. O modelo não tem
   * como informar valor nutricional: ele diz o alimento e a quantidade, e o servidor lê o
   * catálogo. Aceitar um número dele gravaria história nutricional inventada num registro que
   * é imutável por desenho — e que a tela apresentaria como medição.
   */
  it("o modelo NÃO tem como informar valor nutricional", () => {
    const chaves = Object.keys(registrarConsumoEntrada.shape);
    for (const proibido of [
      "calorias",
      "energia",
      "kcal",
      "proteina",
      "carboidrato",
      "gordura",
      "nutrientes",
      "snapshot",
      "nutrients_snapshot",
    ]) {
      expect(chaves, proibido).not.toContain(proibido);
    }
    // E `.strict()` recusa mesmo que alguém tente mandar assim mesmo.
    expect(
      registrarConsumoEntrada.safeParse({
        alimento: "arroz",
        quantidade: 100,
        refeicao: "Almoço",
        calorias: 130,
      }).success,
    ).toBe(false);
  });

  it("recusa quantidade zero, negativa e absurda", () => {
    const base = { alimento: "arroz", refeicao: "Almoço" };
    expect(registrarConsumoEntrada.safeParse({ ...base, quantidade: 0 }).success).toBe(false);
    expect(registrarConsumoEntrada.safeParse({ ...base, quantidade: -50 }).success).toBe(false);
    expect(registrarConsumoEntrada.safeParse({ ...base, quantidade: 1e9 }).success).toBe(false);
    expect(registrarConsumoEntrada.safeParse({ ...base, quantidade: 100 }).success).toBe(true);
  });

  it("recusa data fora do formato", () => {
    const base = { alimento: "arroz", quantidade: 100, refeicao: "Almoço" };
    expect(registrarConsumoEntrada.safeParse({ ...base, data: "07/08/2026" }).success).toBe(false);
    expect(registrarConsumoEntrada.safeParse({ ...base, data: "ontem" }).success).toBe(false);
    expect(registrarConsumoEntrada.safeParse({ ...base, data: "2026-08-07" }).success).toBe(true);
  });

  /**
   * Uma letra só não é busca — é o começo de uma. `searchFoodsByTerm` já recusa termo com
   * menos de 2 caracteres devolvendo lista vazia, e o schema recusa antes, com erro claro.
   */
  it("exige termo de busca com pelo menos duas letras", () => {
    expect(
      registrarConsumoEntrada.safeParse({ alimento: "a", quantidade: 1, refeicao: "Almoço" })
        .success,
    ).toBe(false);
  });

  it("desfazer exige um id de entrada de verdade", () => {
    expect(desfazerConsumoEntrada.safeParse({ entrada_id: "abc" }).success).toBe(false);
    expect(desfazerConsumoEntrada.safeParse({ entrada_id: UUID }).success).toBe(true);
  });

  it("o `parse` do contrato devolve o valor já transformado", () => {
    const p = parseComConsumo(registrarConsumoEntrada);
    const r = p({ alimento: "  arroz  ", quantidade: 100, refeicao: " Almoço " });
    expect(r.ok).toBe(true);
    expect(r.ok && (r.valor as RegistrarConsumoEntrada).alimento).toBe("arroz");
    expect(r.ok && (r.valor as RegistrarConsumoEntrada).refeicao).toBe("Almoço");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   ⛔ A resolução de nome — a regra que uma mutação passou VERDE por não ter teste
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("umSo — o sistema nunca desempata sozinho", () => {
  const nome = (s: string) => s;

  it("um candidato só é escolhido", () => {
    expect(umSo(["Arroz branco cozido"], nome, "arroz", "alimento", "Dieta")).toBe(
      "Arroz branco cozido",
    );
  });

  /**
   * ⛔ O CASO QUE MOTIVA A FUNÇÃO INTEIRA.
   *
   * "arroz" casa com o branco e com o integral, que têm valores nutricionais diferentes.
   * Escolher o primeiro registraria no histórico IMUTÁVEL uma comida que o dono não disse que
   * comeu — e ele confirmaria a proposta lendo "arroz", que é o que ele falou.
   */
  it("dois candidatos RECUSAM, com os nomes na mensagem", () => {
    expect(() =>
      umSo(["Arroz branco cozido", "Arroz integral cru"], nome, "arroz", "alimento", "Dieta"),
    ).toThrow(EfeitoImpossivel);

    try {
      umSo(["Arroz branco cozido", "Arroz integral cru"], nome, "arroz", "alimento", "Dieta");
    } catch (e) {
      const m = (e as EfeitoImpossivel).motivo;
      expect(m).toContain("Arroz branco cozido");
      expect(m).toContain("Arroz integral cru");
      // A frase precisa dizer POR QUE não dá para escolher — senão soa como capricho.
      expect(m).toContain("valores nutricionais são diferentes");
    }
  });

  /**
   * O casamento EXATO desempata: quem tem um alimento chamado exatamente "Arroz" e outro
   * chamado "Arroz integral" está pedindo o primeiro quando digita "Arroz". Sem esta regra, o
   * nome exato ficaria impossível de usar em qualquer catálogo com prefixos.
   */
  it("casamento exato vence o parcial", () => {
    expect(umSo(["Arroz", "Arroz integral"], nome, "arroz", "alimento", "Dieta")).toBe("Arroz");
  });

  it("dois casamentos EXATOS continuam recusando", () => {
    // Duplicata real no catálogo (um do sistema, um do usuário). Escolher seria adivinhar.
    expect(() => umSo(["Arroz", "Arroz"], nome, "arroz", "alimento", "Dieta")).toThrow(
      EfeitoImpossivel,
    );
  });

  it("nenhum candidato recusa dizendo onde procurar", () => {
    try {
      umSo([], nome, "quiabo", "alimento", "Dieta › Alimentos");
    } catch (e) {
      const m = (e as EfeitoImpossivel).motivo;
      expect(m).toContain("quiabo");
      expect(m).toContain("Nada foi registrado");
      expect(m).toContain("Dieta › Alimentos");
    }
    expect.assertions(3);
  });

  it("a lista de candidatos é truncada, mas a CONTAGEM é honesta", () => {
    const muitos = Array.from({ length: 12 }, (_, i) => `Pão ${i}`);
    try {
      umSo(muitos, nome, "pão", "alimento", "Dieta");
    } catch (e) {
      const m = (e as EfeitoImpossivel).motivo;
      expect(m).toContain("12");
      expect(m).toContain("...");
    }
    expect.assertions(2);
  });
});

describe("a rota que a tela recebe", () => {
  it("leva ao DIA do registro no diário", () => {
    expect(rotaDoDiario("2026-08-07")).toBe("/nutricao/diario?date=2026-08-07");
  });
});

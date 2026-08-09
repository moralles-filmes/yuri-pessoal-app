/**
 * Fase 18-E — os seis módulos puros do Engine: dedupe · expiry · confidence · state ·
 * render · validate.
 *
 * O que estes testes travam:
 *  • a chave de deduplicação NÃO muda com apresentação, e MUDA com fato;
 *  • um insight sobre período em curso vence quando o período acaba;
 *  • a confiança só desce;
 *  • decisão do dono vence o prazo;
 *  • indicador não medido renderiza "não medido", nunca "—" e nunca "0";
 *  • fora dos tokens, dígito nenhum.
 */
import { describe, expect, it } from "vitest";

import type { Indicador, InsightGerado } from "./contracts";
import { chaveDeDeduplicacao, serializarParaDeduplicacao } from "./dedupe";
import { DIAS_DE_VIDA_DE_PERIODO_FECHADO, expiraEm, jaExpirou } from "./expiry";
import { confiancaDoInsight, rebaixar } from "./confidence";
import { estaVisivel, estadoDoInsight, type LinhaDeFeedback } from "./state";
import {
  TOKEN_SEM_FONTE,
  type FonteDoInsight,
  formatarValor,
  renderizarExplicacao,
  ressalvaDaFonte,
  textoDaFonte,
} from "./render";
import { validarInsight } from "./validate";

const IND: Indicador = {
  id: "financeiro.gasto_mes",
  modulo: "financeiro",
  rotulo: "Gasto do mês",
  valor: 1234.5,
  unidade: "R$",
  qualidade: "exato",
  periodo: { de: "2026-07-01", ate: "2026-07-31" },
  n: 42,
  rota: "/financeiro/lancamentos",
};

const com = (p: Partial<Indicador>): Indicador => ({ ...IND, ...p });

/* ══════════════════════════════════ dedupe ══════════════════════════════════ */

describe("dedupe — a chave é sobre os FATOS, não sobre a apresentação", () => {
  const base = {
    modulo: "financeiro" as const,
    periodo: { de: "2026-07-01", ate: "2026-07-31" },
    indicadores: [IND],
  };

  it("a mesma leitura dá a mesma chave", () => {
    expect(chaveDeDeduplicacao(base)).toBe(chaveDeDeduplicacao(base));
  });

  it("a chave é sha256 hex minúsculo, como o hash do efeito", () => {
    expect(chaveDeDeduplicacao(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carrega o prefixo de versão — mudar a regra invalida chave antiga", () => {
    expect(serializarParaDeduplicacao(base).startsWith("ia-insight-v1\n")).toBe(true);
  });

  /** Renomear uma categoria não muda número nenhum. Gerar de novo por isso seria gasto. */
  it("rótulo, rota e regra de contagem NÃO mudam a chave", () => {
    const antes = chaveDeDeduplicacao(base);
    expect(
      chaveDeDeduplicacao({
        ...base,
        indicadores: [
          com({
            rotulo: "Gasto do mês (Supermercado)",
            rota: "/financeiro/lancamentos?aba=outra",
            regra_de_contagem: "sem estornos",
          }),
        ],
      }),
    ).toBe(antes);
  });

  it("valor, unidade, qualidade, n e período MUDAM a chave", () => {
    const antes = chaveDeDeduplicacao(base);
    for (const mudanca of [
      { valor: 1234.51 },
      { unidade: "kg" },
      { n: 43 },
      { periodo: { de: "2026-07-01", ate: "2026-07-30" } },
      { qualidade: "parcial" as const, motivo_incompleto: "2 dias sem registro" },
      { valor: null, indisponivel_porque: "sem lançamento no período" },
    ]) {
      expect(
        chaveDeDeduplicacao({ ...base, indicadores: [com(mudanca)] }),
        JSON.stringify(mudanca),
      ).not.toBe(antes);
    }
  });

  /**
   * `canonicalizar` preserva a ordem de array de propósito (a ordem das alternativas de
   * substituição é a prioridade do usuário). Aqui a ordem dos coletores não significa nada, e
   * sem a ordenação a deduplicação pararia de funcionar em silêncio.
   */
  it("a ordem em que os coletores devolvem NÃO muda a chave", () => {
    const outro = com({ id: "financeiro.receita_mes", valor: 9000 });
    expect(chaveDeDeduplicacao({ ...base, indicadores: [IND, outro] })).toBe(
      chaveDeDeduplicacao({ ...base, indicadores: [outro, IND] }),
    );
  });

  it("módulo e período do insight entram na chave", () => {
    const antes = chaveDeDeduplicacao(base);
    expect(chaveDeDeduplicacao({ ...base, modulo: "treinos" })).not.toBe(antes);
    expect(
      chaveDeDeduplicacao({ ...base, periodo: { de: "2026-06-01", ate: "2026-06-30" } }),
    ).not.toBe(antes);
  });
});

/* ══════════════════════════════════ expiry ══════════════════════════════════ */

describe("expiry — período em curso vence quando o período acaba", () => {
  const HOJE = "2026-08-09";

  it("mês em curso: vence na virada do último dia do mês, em BRASÍLIA", () => {
    // 01/09/2026 00:00 em Brasília (UTC-3) é 31/08/2026 03:00 em UTC.
    expect(expiraEm({ de: "2026-08-01", ate: "2026-08-31" }, HOJE)).toBe(
      "2026-09-01T03:00:00.000Z",
    );
  });

  it("período que termina HOJE ainda está em curso, e vence na virada", () => {
    expect(expiraEm({ de: "2026-08-09", ate: "2026-08-09" }, HOJE)).toBe(
      "2026-08-10T03:00:00.000Z",
    );
  });

  it("período fechado: vence no horizonte fixo contado de hoje", () => {
    // 09/08 + 30 = 08/09; vence na virada para 09/09, 00:00 BRT = 09/09 03:00 UTC.
    expect(DIAS_DE_VIDA_DE_PERIODO_FECHADO).toBe(30);
    expect(expiraEm({ de: "2026-07-01", ate: "2026-07-31" }, HOJE)).toBe(
      "2026-09-09T03:00:00.000Z",
    );
  });

  /** O CHECK do banco recusa `expires_at <= created_at`. Nenhum caso pode cair nele. */
  it("nunca devolve um instante já passado — nem no pior caso", () => {
    const agora = new Date("2026-08-09T23:59:59-03:00");
    for (const periodo of [
      { de: "2026-08-09", ate: "2026-08-09" },
      { de: "2026-08-08", ate: "2026-08-08" },
      { de: "2020-01-01", ate: "2020-01-31" },
    ]) {
      expect(jaExpirou(expiraEm(periodo, HOJE), agora), JSON.stringify(periodo)).toBe(false);
    }
  });

  it("jaExpirou compara instantes, e o limite é inclusivo", () => {
    expect(jaExpirou("2026-08-09T03:00:00.000Z", new Date("2026-08-09T03:00:00.000Z"))).toBe(
      true,
    );
    expect(jaExpirou("2026-08-09T03:00:00.000Z", new Date("2026-08-09T02:59:59.999Z"))).toBe(
      false,
    );
  });
});

/* ════════════════════════════════ confidence ════════════════════════════════ */

describe("confidence — o servidor SÓ REBAIXA", () => {
  it("rebaixar devolve sempre a menor das duas", () => {
    expect(rebaixar("alta", "baixa")).toBe("baixa");
    expect(rebaixar("baixa", "alta")).toBe("baixa");
    expect(rebaixar("media", "alta")).toBe("media");
    expect(rebaixar("alta", "alta")).toBe("alta");
  });

  /**
   * ⛔ `promover` não existe, e este teste é o que impede alguém de escrever uma sem perceber
   * que está desfazendo a invariante 57 da 18-D.
   */
  it("não existe caminho para cima: rebaixar nunca sobe acima das entradas", () => {
    const escala = { alta: 0, media: 1, baixa: 2 } as const;
    for (const a of ["alta", "media", "baixa"] as const) {
      for (const b of ["alta", "media", "baixa"] as const) {
        expect(escala[rebaixar(a, b)]).toBeGreaterThanOrEqual(
          Math.max(escala[a], escala[b]),
        );
      }
    }
  });

  it("todos os números citados medidos e exatos ⇒ alta, sem motivo", () => {
    const r = confiancaDoInsight([IND], [IND.id]);
    expect(r.confianca).toBe("alta");
    expect(r.motivos).toEqual([]);
  });

  it("um número citado não medido rebaixa, e o motivo dele vai junto", () => {
    const ausente = com({
      id: "financeiro.receita_mes",
      valor: null,
      indisponivel_porque: "nenhuma receita lançada no período",
    });
    const r = confiancaDoInsight([IND, ausente], [IND.id, ausente.id]);
    expect(r.confianca).toBe("media");
    expect(r.motivos[0]).toContain("nenhuma receita lançada no período");
  });

  it("parcial e não medido juntos rebaixam duas vezes", () => {
    const ausente = com({ id: "a.b", valor: null, indisponivel_porque: "sem registro" });
    const parcial = com({ id: "c.d", qualidade: "parcial", motivo_incompleto: "2 dias" });
    expect(
      confiancaDoInsight([ausente, parcial], [ausente.id, parcial.id]).confianca,
    ).toBe("baixa");
  });

  it("nunca desce abaixo de baixa", () => {
    const ruins = [
      com({ id: "a.b", valor: null, indisponivel_porque: "x" }),
      com({ id: "c.d", qualidade: "parcial", motivo_incompleto: "y" }),
      com({ id: "e.f", valor: 0, n: 0 }),
    ];
    expect(confiancaDoInsight(ruins, ruins.map((r) => r.id)).confianca).toBe("baixa");
  });

  /**
   * Um indicador enviado e NÃO citado não sustenta afirmação nenhuma do texto. Rebaixar por
   * causa dele puniria um insight impecável sobre os três números que ele de fato usou.
   */
  it("indicador enviado mas NÃO citado não rebaixa", () => {
    const ausente = com({ id: "z.z", valor: null, indisponivel_porque: "sem registro" });
    expect(confiancaDoInsight([IND, ausente], [IND.id]).confianca).toBe("alta");
  });

  it("texto que não cita número nenhum ⇒ baixa, com o motivo escrito", () => {
    const r = confiancaDoInsight([IND], []);
    expect(r.confianca).toBe("baixa");
    expect(r.motivos.join(" ")).toContain("não cita nenhum número");
  });

  it("zero medido sobre zero registros rebaixa — o número está certo e é frágil", () => {
    expect(confiancaDoInsight([com({ valor: 0, n: 0 })], [IND.id]).confianca).toBe("media");
  });
});

/* ══════════════════════════════════ state ══════════════════════════════════ */

const FUTURO = "2026-09-01T03:00:00.000Z";
const PASSADO = "2026-08-01T03:00:00.000Z";
const AGORA = new Date("2026-08-09T15:00:00-03:00");

const fb = (
  decisao: LinhaDeFeedback["decisao"],
  created_at: string,
  adiado_ate?: string,
): LinhaDeFeedback => ({ decisao, created_at, ...(adiado_ate ? { adiado_ate } : {}) });

describe("state — decisão do dono vence o prazo", () => {
  it("sem feedback: o prazo manda", () => {
    expect(estadoDoInsight(FUTURO, [], AGORA).estado).toBe("vigente");
    expect(estadoDoInsight(PASSADO, [], AGORA).estado).toBe("expirado");
  });

  it("dispensado vence o prazo NOS DOIS SENTIDOS", () => {
    // Não volta porque ainda não venceu…
    expect(
      estadoDoInsight(FUTURO, [fb("dispensado", "2026-08-05T10:00:00Z")], AGORA).estado,
    ).toBe("dispensado");
    // …e não deixa de estar dispensado porque venceu.
    expect(
      estadoDoInsight(PASSADO, [fb("dispensado", "2026-08-05T10:00:00Z")], AGORA).estado,
    ).toBe("dispensado");
  });

  it("a ÚLTIMA decisão de exibição vence, em qualquer ordem de chegada", () => {
    const linhas = [
      fb("dispensado", "2026-08-05T10:00:00Z"),
      fb("adiado", "2026-08-07T10:00:00Z", "2026-08-20"),
    ];
    expect(estadoDoInsight(FUTURO, linhas, AGORA).estado).toBe("adiado");
    expect(estadoDoInsight(FUTURO, [...linhas].reverse(), AGORA).estado).toBe("adiado");
  });

  it("adiado com data futura fica adiado, e a tela sabe quando ele volta", () => {
    const r = estadoDoInsight(FUTURO, [fb("adiado", "2026-08-07T10:00:00Z", "2026-08-20")], AGORA);
    expect(r.estado).toBe("adiado");
    expect(r.voltaEm).toBe("2026-08-20");
  });

  it("adiamento vencido sai de cena e o prazo volta a mandar", () => {
    expect(
      estadoDoInsight(FUTURO, [fb("adiado", "2026-08-01T10:00:00Z", "2026-08-05")], AGORA).estado,
    ).toBe("vigente");
    expect(
      estadoDoInsight(PASSADO, [fb("adiado", "2026-08-01T10:00:00Z", "2026-08-05")], AGORA).estado,
    ).toBe("expirado");
  });

  /** Adiado ATÉ hoje já venceu: o dono pediu para ver de novo hoje. */
  it("adiado até HOJE já voltou", () => {
    expect(
      estadoDoInsight(FUTURO, [fb("adiado", "2026-08-01T10:00:00Z", "2026-08-09")], AGORA).estado,
    ).toBe("vigente");
  });

  it("nao_mostrar oculta, e nada o traz de volta", () => {
    expect(
      estadoDoInsight(FUTURO, [fb("nao_mostrar", "2026-08-05T10:00:00Z")], AGORA).estado,
    ).toBe("oculto");
  });

  /** Polegar não é decisão de exibição: útil e vigente são coisas independentes. */
  it("util e inutil NÃO mudam o estado, e viajam separados", () => {
    const r = estadoDoInsight(FUTURO, [fb("util", "2026-08-05T10:00:00Z")], AGORA);
    expect(r.estado).toBe("vigente");
    expect(r.avaliacao).toBe("util");

    const s = estadoDoInsight(
      FUTURO,
      [fb("inutil", "2026-08-05T10:00:00Z"), fb("dispensado", "2026-08-06T10:00:00Z")],
      AGORA,
    );
    expect(s.estado).toBe("dispensado");
    expect(s.avaliacao).toBe("inutil");
  });

  it("só vigente aparece na lista e no card", () => {
    expect(estaVisivel("vigente")).toBe(true);
    for (const e of ["expirado", "dispensado", "adiado", "oculto"] as const) {
      expect(estaVisivel(e), e).toBe(false);
    }
  });
});

/* ══════════════════════════════════ render ══════════════════════════════════ */

const fonte = (p: Partial<FonteDoInsight> = {}): FonteDoInsight => ({
  indicador_id: "financeiro.gasto_mes",
  rotulo: "Gasto do mês",
  valor: 1234.5,
  indisponivel_porque: null,
  unidade: "R$",
  qualidade: "exato",
  motivo_incompleto: null,
  periodo_de: "2026-07-01",
  periodo_ate: "2026-07-31",
  n: 42,
  regra_de_contagem: null,
  rota: "/financeiro/lancamentos",
  ...p,
});

describe("render — o número só aparece aqui", () => {
  it("R$ sai por formatCurrency; % cola no número; o resto vai com espaço", () => {
    expect(formatarValor(1234.5, "R$")).toContain("1.234,50");
    expect(formatarValor(20, "%")).toBe("+20%");
    expect(formatarValor(-12.5, "%")).toBe("-12,5%");
    expect(formatarValor(12, "sessões")).toBe("12 sessões");
  });

  it("resolve o token pelo id", () => {
    expect(
      renderizarExplicacao("Você gastou {{ind:financeiro.gasto_mes}} no mês.", [fonte()]),
    ).toContain("R$");
  });

  /** ⛔ A invariante 1 da Dieta chegando ao pixel: "—" não distingue os dois casos. */
  it("indicador não medido vira 'não medido' COM o motivo — nunca '—', nunca 0", () => {
    const texto = renderizarExplicacao("Gasto: {{ind:financeiro.gasto_mes}}.", [
      fonte({ valor: null, indisponivel_porque: "nenhum lançamento no período" }),
    ]);
    expect(texto).toBe("Gasto: não medido (nenhum lançamento no período).");
    expect(texto).not.toContain("—");
    expect(texto).not.toMatch(/\b0\b/);
  });

  it("zero MEDIDO é zero, não 'não medido'", () => {
    expect(renderizarExplicacao("{{ind:financeiro.gasto_mes}}", [fonte({ valor: 0 })])).toContain(
      "0,00",
    );
  });

  it("token sem fonte vira marcador explícito, nunca o token cru", () => {
    const texto = renderizarExplicacao("Gasto: {{ind:nao.existe}}.", [fonte()]);
    expect(texto).toBe(`Gasto: ${TOKEN_SEM_FONTE}.`);
    expect(texto).not.toContain("{{ind:");
  });

  /**
   * Uma passada só: o texto já substituído não é reexaminado. Com um laço de `replaceAll` por
   * fonte, o conteúdo de uma fonte viraria instrução de renderização na volta seguinte.
   */
  it("valor que contenha um token NÃO é resolvido de novo", () => {
    const texto = renderizarExplicacao("{{ind:a.b}} e {{ind:c.d}}", [
      fonte({ indicador_id: "a.b", valor: null, indisponivel_porque: "{{ind:c.d}}" }),
      fonte({ indicador_id: "c.d", valor: 99, unidade: "kg" }),
    ]);
    expect(texto).toBe("não medido ({{ind:c.d}}) e 99 kg");
  });

  it("textoDaFonte sem motivo não inventa parênteses vazios", () => {
    expect(textoDaFonte(fonte({ valor: null, indisponivel_porque: "  " }))).toBe("não medido");
  });

  it("a ressalva carrega incompletude, regra de contagem e quantos registros entraram", () => {
    expect(
      ressalvaDaFonte(
        fonte({
          qualidade: "parcial",
          motivo_incompleto: "2 dias sem peso",
          regra_de_contagem: "aquecimento não conta",
          n: 1,
        }),
      ),
    ).toEqual([
      "Incompleto: 2 dias sem peso",
      "Regra de contagem: aquecimento não conta",
      "1 registro no período",
    ]);
  });

  it("fonte não medida não afirma quantos registros entraram", () => {
    expect(ressalvaDaFonte(fonte({ valor: null, indisponivel_porque: "x" }))).toEqual([]);
  });
});

/* ═════════════════════════════════ validate ═════════════════════════════════ */

const OK: InsightGerado = {
  tipo: "observacao",
  prioridade: "media",
  titulo: "Seu gasto do mês",
  resumo: "O gasto do período analisado foi de {{ind:financeiro.gasto_mes}}.",
  explicacao: "No período, o total lançado foi {{ind:financeiro.gasto_mes}}.",
  evidencias: [
    { afirmacao: "o total do período", indicador_id: "financeiro.gasto_mes" },
  ],
};

const insight = (p: Partial<InsightGerado>): InsightGerado => ({ ...OK, ...p });

describe("validate — fora dos tokens, dígito nenhum", () => {
  it("aceita o insight bem formado, e devolve os ids citados", () => {
    const r = validarInsight(OK, [IND]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.citados).toEqual(["financeiro.gasto_mes"]);
  });

  it("recusa número escrito à mão, em qualquer campo", () => {
    for (const campo of ["titulo", "resumo", "explicacao"] as const) {
      const r = validarInsight(insight({ [campo]: "Você gastou 1234 reais" }), [IND]);
      expect(r.ok, campo).toBe(false);
      if (!r.ok) expect(r.recusas.some((x) => x.codigo === "NUMERO_NO_TEXTO")).toBe(true);
    }
  });

  it("recusa número dentro da afirmação da evidência também", () => {
    const r = validarInsight(
      insight({ evidencias: [{ afirmacao: "42 lançamentos", indicador_id: IND.id }] }),
      [IND],
    );
    expect(r.ok).toBe(false);
  });

  /** Proibir "nos últimos 7 dias" é deliberado: o período é do indicador, não do texto. */
  it("recusa até um período escrito no texto — o período viaja com o indicador", () => {
    expect(validarInsight(insight({ resumo: "Nos últimos 7 dias, o gasto subiu." }), [IND]).ok).toBe(
      false,
    );
  });

  it("recusa token que aponta indicador não enviado", () => {
    const r = validarInsight(insight({ explicacao: "Total: {{ind:treinos.sessoes}}." }), [IND]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.recusas.some((x) => x.codigo === "TOKEN_DESCONHECIDO")).toBe(true);
  });

  it("recusa insight sem evidência", () => {
    const r = validarInsight(insight({ evidencias: [] }), [IND]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.recusas.some((x) => x.codigo === "SEM_EVIDENCIA")).toBe(true);
  });

  it("recusa evidência apontando indicador não enviado", () => {
    const r = validarInsight(
      insight({ evidencias: [{ afirmacao: "algo", indicador_id: "nao.enviado" }] }),
      [IND],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.recusas.some((x) => x.codigo === "EVIDENCIA_DESCONHECIDA")).toBe(true);
  });

  it("recusa campo vazio", () => {
    const r = validarInsight(insight({ titulo: "   " }), [IND]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.recusas.some((x) => x.codigo === "TEXTO_VAZIO")).toBe(true);
  });

  /** ⛔ ESTA é a checagem que roda em PRODUÇÃO, e não só na suíte. */
  it("recusa linguagem de cobrança e de prescrição, em runtime", () => {
    const cobranca = validarInsight(
      insight({ resumo: "Você não registrou nada, de novo." }),
      [IND],
    );
    expect(cobranca.ok).toBe(false);
    if (!cobranca.ok) {
      expect(cobranca.recusas.some((x) => x.codigo === "VOCABULARIO_DE_COBRANCA")).toBe(true);
    }

    const prescricao = validarInsight(
      insight({ resumo: "Tente reduzir o gasto no próximo período." }),
      [IND],
    );
    expect(prescricao.ok).toBe(false);
    if (!prescricao.ok) {
      expect(prescricao.recusas.some((x) => x.codigo === "VOCABULARIO_DE_PRESCRICAO")).toBe(
        true,
      );
    }
  });

  it("pega a cobrança independentemente da caixa", () => {
    expect(validarInsight(insight({ titulo: "VOCÊ NÃO treinou" }), [IND]).ok).toBe(false);
  });

  /**
   * Sem coletar tudo, consertar o primeiro problema revelaria o segundo só na tentativa
   * seguinte — e cada tentativa custa dinheiro do dono.
   */
  it("coleta TODAS as recusas, não só a primeira", () => {
    const r = validarInsight(
      insight({ titulo: "Você não gastou 500", evidencias: [] }),
      [IND],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(new Set(r.recusas.map((x) => x.codigo)).size).toBeGreaterThanOrEqual(3);
    }
  });
});

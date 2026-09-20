import "server-only";

/**
 * Fase 18-F · Bloco 3 — IA · A METADE QUE SÓ LÊ dos commands de Memória.
 *
 * Mesma partição de `habits-preview.ts`, e pelo mesmo motivo (invariante 40): a partir de
 * `tools/` não pode existir caminho de import até uma função que escreve.
 *
 * ⚠️ E a leitura entra por `@/lib/ai/memory/queries`, NÃO por `@/lib/ai/server/`: `approval/`
 * é camada pura no `boundaries.test.ts` e não pode alcançar `ai/server/`. É a mesma razão pela
 * qual `approval/queries.ts` fala com o banco de dentro de `approval/`.
 */

import { z } from "zod";
import { hojeISO } from "@/lib/format";
import { MAX_MEMORIA, MODULOS_DE_MEMORIA } from "@/lib/ai/memory/contracts";
import { formaDaMemoria, MOTIVO_DA_RECUSA } from "@/lib/ai/memory/forma";
import { getMemorias } from "@/lib/ai/memory/queries";
import { EfeitoImpossivel, type CommandContext, type EfeitoProposto } from "../contracts";

const ROTA_DO_PAINEL = "/ia/memoria";

/* ══════════════════════════════════════════════════════════════════════════════════════
   Entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ `conteudo` É A FRASE, não um id e não um rótulo. O dono vai LER exatamente este texto na
 * tela de confirmação — é o que torna "nada sensível é salvo automaticamente" verdadeiro por
 * construção: nada é salvo automaticamente.
 */
export const lembrarPreferenciaEntrada = z
  .object({
    conteudo: z.string().trim().min(1).max(MAX_MEMORIA),
    modulo: z.enum(MODULOS_DE_MEMORIA, { error: "Módulo inválido." }).nullable().optional(),
    expira_em: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .nullable()
      .optional(),
  })
  .strict();
export type LembrarPreferenciaEntrada = z.infer<typeof lembrarPreferenciaEntrada>;

export const esquecerPreferenciaEntrada = z.object({ memoria_id: z.uuid() }).strict();
export type EsquecerPreferenciaEntrada = z.infer<typeof esquecerPreferenciaEntrada>;

/** O `parse` na forma que o contrato pede. Reusado dos dois lados. */
export function parseComMemoria<T extends z.ZodType>(schema: T) {
  return (payload: unknown): { ok: true; valor: unknown } | { ok: false } => {
    const r = schema.safeParse(payload);
    return r.success ? { ok: true, valor: r.data } : { ok: false };
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   lembrarPreferencia
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverLembrarPreferencia(
  ctx: CommandContext,
  payload: unknown,
): Promise<EfeitoProposto> {
  const d = payload as LembrarPreferenciaEntrada;

  /**
   * ⛔ A FORMA É CONFERIDA AQUI TAMBÉM, e não só na gravação. Sem isto, o dono leria e
   * confirmaria uma proposta que o serviço recusaria depois — e a ação apareceria em
   * `/ia/acoes` como falha, sem ele entender por quê.
   */
  const forma = formaDaMemoria(d.conteudo);
  if (!forma.ok) throw new EfeitoImpossivel(MOTIVO_DA_RECUSA[forma.motivo]);

  const hoje = hojeISO();
  if (d.expira_em && d.expira_em <= hoje) {
    throw new EfeitoImpossivel(
      "O prazo da memória precisa ser uma data futura. Sem prazo, ela vale até você desativá-la.",
    );
  }

  /**
   * ⚠️ Memória repetida é recusada — e a checagem é por texto normalizado, não por igualdade
   * crua. Duas preferências dizendo a mesma coisa não se contradizem, mas ocupam duas das 20
   * vagas do prompt e fazem o assistente parecer que "tem muita regra".
   *
   * ⚠️ `esquecida` fica DE FORA da comparação de propósito: o dono já disse que não quer
   * aquela frase orientando o assistente, e propor de novo é legítimo — é ele reconsiderando.
   */
  const existentes = await getMemorias(ctx.userId, new Date());
  const igual = existentes.find(
    (m) => m.estado !== "esquecida" && m.conteudo.toLowerCase() === forma.valor.toLowerCase(),
  );
  if (igual) {
    throw new EfeitoImpossivel("Essa preferência já está salva na memória. Nada foi preparado.");
  }

  const linhas = [
    { rotulo: "Preferência", valor: forma.valor },
    {
      rotulo: "Vale para",
      valor: d.modulo ? `o módulo ${d.modulo}` : "todas as conversas",
    },
    { rotulo: "Prazo", valor: d.expira_em ?? "sem prazo" },
  ];

  const ressalvas = [
    // ⚠️ As negações em PARALELO, como na seção do prompt (`memory/prompt.ts`): "não desliga
    // … não autoriza …". O dono lê esta frase antes de confirmar, e ela precisa dizer o mesmo
    // que o assistente vai ler depois — em duas formas diferentes, uma das duas envelhece.
    "A memória entra no prompt do assistente como PREFERÊNCIA — ela orienta o estilo e a escolha dele: não desliga nenhuma regra e não autoriza nenhuma leitura.",
    "Você pode desativar, editar ou apagar em IA · Memória, a qualquer momento.",
  ];
  if (d.modulo) {
    ressalvas.push(
      "Como ela está amarrada a um módulo, só entra nas conversas daquele módulo — e só enquanto a leitura dele estiver autorizada.",
    );
  }

  return {
    command: "lembrarPreferencia",
    // O payload guarda a frase JÁ NORMALIZADA: é ela que entra no hash e é ela que será
    // gravada. Guardar o texto cru faria a previsão e a execução divergirem no espaço.
    payload: { ...d, conteudo: forma.valor },
    entidades: [],
    previsao: {
      resumo: `Salvar na memória: "${forma.valor}".`,
      linhas,
      ressalvas,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   esquecerPreferencia — o `undo` declarado
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverEsquecerPreferencia(
  ctx: CommandContext,
  payload: unknown,
): Promise<EfeitoProposto> {
  const d = payload as EsquecerPreferenciaEntrada;
  const memorias = await getMemorias(ctx.userId, new Date());
  const alvo = memorias.find((m) => m.id === d.memoria_id);

  if (!alvo) {
    throw new EfeitoImpossivel("Essa memória não existe mais (ou não é sua). Nada foi alterado.");
  }

  return {
    command: "esquecerPreferencia",
    payload: { ...d },
    entidades: [{ tipo: "memoria", id: alvo.id, rota: ROTA_DO_PAINEL }],
    previsao: {
      resumo: `Esquecer a preferência "${alvo.conteudo}".`,
      linhas: [{ rotulo: "Preferência", valor: alvo.conteudo }],
      // A distinção que a invariante 20 da Dieta fixou, aplicada aqui: esquecer ≠ apagar.
      ressalvas: [
        "A preferência para de orientar o assistente e CONTINUA LEGÍVEL em IA · Memória, marcada como esquecida. Apagar de vez é outro botão, na própria tela.",
      ],
    },
  };
}

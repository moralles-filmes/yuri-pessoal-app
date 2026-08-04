import { z } from "zod";

/** Data no formato 'AAAA-MM-DD' (valor de <input type="date">). */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/**
 * Texto opcional: string vazia/ausente/null vira null.
 *
 * ⛔ **Aceitar `null` na ENTRADA não é detalhe — é o que torna o schema idempotente.**
 * O `zodResolver` entrega ao `onSubmit` a saída JÁ TRANSFORMADA (é assim que o
 * react-hook-form funciona), e o formulário manda exatamente isso para a Server Action,
 * que valida de novo com o MESMO schema. Como a transformação emite `null`, um schema que
 * só aceitasse `string | undefined` recusaria a própria saída: o usuário preenchia tudo,
 * clicava em salvar e recebia "Verifique os campos destacados" sem campo nenhum destacado.
 * Pior: campo opcional que nem aparece no formulário (`icon`) entrava como `null` e
 * quebrava o salvamento SEMPRE. Coberto por `round-trip.test.ts`.
 */
export function optionalText(max = 1000) {
  return z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .nullish()
    .transform((v) => (v && v.length ? v : null));
}

/** UUID opcional: "" ou ausente vira null. */
export const optionalUuid = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.uuid("Seleção inválida").nullable(),
);

/**
 * Normaliza um valor monetário digitado no padrão BR ("1.234,56", "500,01")
 * para o formato que `Number()` entende ("1234.56"). Sem vírgula, passa intacto
 * (ex.: "1234.56" vindo do banco). Não-string passa direto.
 */
export function normalizeBRMoney(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const cleaned = v.trim().replace(/\s/g, "").replace(/R\$/gi, "");
  return cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
}

/** Valor monetário (>= 0), aceitando vírgula ou ponto. */
export const moneyAmount = z.preprocess(
  normalizeBRMoney,
  z.coerce
    .number({ message: "Informe um valor" })
    .finite("Valor inválido")
    .nonnegative("O valor não pode ser negativo"),
);

/** Valor monetário com sinal (ex.: saldo inicial de conta). */
export const moneyAmountSigned = z.preprocess(
  normalizeBRMoney,
  z.coerce.number({ message: "Informe um valor" }).finite("Valor inválido"),
);

/** Lista de tags opcional. */
export const tagsArray = z
  .array(z.string().trim().min(1))
  .optional()
  .transform((v) => v ?? []);

/** Cor opcional (hex). "" / ausente vira null. */
export const optionalColor = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .regex(/^#?[0-9a-fA-F]{3,8}$/, "Cor inválida")
    .nullable(),
);

/** Data 'AAAA-MM-DD' opcional: "" / ausente vira null. */
export const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  dateString.nullable(),
);

/** Horário 'HH:MM' (ou 'HH:MM:SS') opcional: "" / ausente vira null. */
export const optionalTime = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido")
    .nullable(),
);

/**
 * Link opcional ("" / ausente vira null). Aceita URL com ou sem esquema (ex.:
 * "udemy.com/curso" ou "https://..."), exigindo um host com ponto e sem espaços —
 * tolerante o suficiente para links colados pelo usuário, mas rejeita lixo.
 */
export const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z
      .string()
      .max(2048, "Link muito longo")
      .regex(/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i, "Link inválido")
      .nullable(),
  ),
);

/** Inteiro de minutos (>= 0), com coerção de string/number. Vazio/ausente vira 0. */
export const minutesInt = z.coerce
  .number({ message: "Informe um valor" })
  .int("Use minutos inteiros")
  .min(0, "Não pode ser negativo")
  .max(100000, "Valor muito alto");

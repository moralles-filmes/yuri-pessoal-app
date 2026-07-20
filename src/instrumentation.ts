/**
 * Fixa o fuso do processo em America/Sao_Paulo.
 *
 * Por que: na Vercel o Node roda em **UTC**. Tudo que lê o fuso "local" do processo —
 * `date-fns` (`startOfDay`, `isSameDay`, `format`), os getters de `Date`
 * (`getFullYear`/`getHours`) e `Intl` sem `timeZone` explícito — passa a responder em UTC
 * no servidor. Resultado prático: entre **21h e 00h (BRT) o dia "vira"**, e um evento das
 * 22h aparece no dia seguinte, uma fatura parece atrasada um dia antes, um streak quebra.
 *
 * `register()` roda **uma vez, antes do código da aplicação**, em cada boot do servidor
 * (inclusive em cold start de função na Vercel) — então os formatadores criados no topo
 * dos módulos já nascem no fuso certo. No Node ≥ 16 atribuir `process.env.TZ` reconfigura
 * o fuso do processo na hora.
 *
 * Isto é a **rede de segurança**, não a única defesa: os formatadores compartilhados em
 * `src/lib/format.ts` e `src/lib/calendar/format.ts` declaram `timeZone` explicitamente,
 * então continuam corretos mesmo onde o fuso ambiente não se aplica (o browser do usuário).
 */
export const TIMEZONE = "America/Sao_Paulo";

export async function register() {
  process.env.TZ = TIMEZONE;
}

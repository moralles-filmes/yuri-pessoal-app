/**
 * Leitura com teto visível (03-B2, A5). Desde a 03-G (D-G1) a regra mora no núcleo neutro
 * `@/lib/supabase/leitura` (o Cron também a usa); este arquivo só reexporta, para nenhum
 * import existente quebrar.
 */
export { leituraComTeto, type LeituraComTeto } from "@/lib/supabase/leitura";

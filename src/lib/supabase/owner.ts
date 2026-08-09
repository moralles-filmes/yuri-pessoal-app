import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Fase 18-E (Bloco 4) — LEITURA COM O DONO EXPLÍCITO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ SEM SESSÃO, O ESCOPO DO USUÁRIO DEIXA DE VIR DA RLS E PASSA A SER NOSSO.           ║
 * ║                                                                                       ║
 * ║ O Cron da Vercel roda com service role, que IGNORA a RLS. Sem `auth.uid()`, uma       ║
 * ║ consulta não erra: ela devolve VAZIO em silêncio (ou, sob service role, devolve o     ║
 * ║ mundo inteiro). Os dois são o pior modo de falha possível — por isso toda consulta    ║
 * ║ que recebe este objeto passa a filtrar `user_id` explicitamente.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ POR QUE UM OBJETO, E NÃO DOIS CAMPOS ═══════════════════════
 *
 * `getSessionHistory` (17-F) recebe `client` e `userId` como campos separados de um mesmo
 * objeto de opções, e por isso precisa do guard `if (range.client && !owner) return []`: dá
 * para mandar um sem o outro, e o resultado seria uma leitura SEM ESCOPO rodando com service
 * role.
 *
 * Aqui os dois viajam juntos ou não viajam. **"Client sem userId" deixa de ser
 * representável**, e o guard vira desnecessário porque o estado que ele protegia não existe.
 * É a mesma escolha do campo `confianca`, que não existe no schema de saída do modelo
 * (invariante 67): irrepresentável vence recusado, porque uma recusa é um `if` que alguém
 * remove e um tipo é uma mudança que ninguém faz sem perceber.
 *
 * ⚠️ `getSessionHistory` NÃO é reescrita para esta forma: ela funciona, tem testes e não está
 * no caminho deste bloco. A forma nova vale para as assinaturas novas.
 *
 * ═══════════════════════ POR QUE O TIPO MORA AQUI ═══════════════════════
 *
 * Em `src/lib/supabase/`, junto dos três clientes — e NÃO em `src/lib/ai/`. Pôr o tipo dentro
 * do módulo de IA faria `finance/`, `nutrition/`, `training/` e `dashboard/` passarem a
 * importar dele: a seta ao contrário, exatamente o que mandou o vocabulário proibido para
 * `src/lib/tone/` no Bloco 1 desta subfase.
 */
export type LeituraDoDono = {
  /** Aceita o client de sessão e o de service role — o shape é o mesmo. */
  readonly client: SupabaseClient<Database>;
  /** Obrigatório: é ele que substitui a RLS como escopo da consulta. */
  readonly userId: string;
};

import "server-only";

import type { LeituraDoDono } from "@/lib/supabase/owner";

/**
 * Fase 18-E (Bloco 4) — o client alternativo da camada `ai_*`.
 *
 * ═══════════════ POR QUE AQUI É SÓ O CLIENT, E NÃO O PAR `LeituraDoDono` ═══════════════
 *
 * As nove leituras de módulo (Financeiro, Dieta, Treinos) recebem o PAR, porque elas não
 * tinham `user_id` nenhum: o escopo vinha inteiro da RLS, e sem sessão elas ficariam sem
 * escopo — o motivo de `LeituraDoDono` existir.
 *
 * A camada `ai_*` é o caso oposto. `run-store`, `credential-store`, `insight-store` e
 * `ai/queries` **sempre** receberam `userId` explícito e **sempre** filtraram por ele: a RLS
 * ali é a segunda tranca, nunca a única. O que falta a elas sem sessão é só o CLIENT.
 *
 * Pedir o par aqui obrigaria a passar o mesmo `userId` duas vezes na mesma chamada — e duas
 * cópias do mesmo dado é um jeito de elas discordarem.
 */
export type ClienteDaIa = LeituraDoDono["client"];

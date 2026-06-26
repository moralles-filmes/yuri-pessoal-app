/**
 * Fase 12 — Leitura server-only das preferências do dashboard. A RLS garante que só
 * vem a linha do próprio usuário. O jsonb cru é reconciliado por normalizeLayout
 * (absorve cards novos de fases futuras e descarta lixo) — read-your-writes sem flash.
 */
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeLayout,
  type DashboardLayout,
} from "@/lib/dashboard/cards";

export async function getDashboardLayout(): Promise<DashboardLayout> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("dashboard_layout")
    .maybeSingle();
  if (!data) return DEFAULT_DASHBOARD_LAYOUT;
  return normalizeLayout(data.dashboard_layout);
}

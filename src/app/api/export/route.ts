/**
 * Fase 14 — Exportação/backup dos dados do usuário (JSON). Rota PRIVADA: o proxy.ts
 * exige sessão e a própria rota revalida `auth.getUser()`. Cada SELECT roda sob a sessão
 * do usuário, então a RLS garante que NUNCA vaza dados de outro usuário.
 *
 * Segurança: `google_integrations` (tokens OAuth) é DELIBERADAMENTE omitido do backup —
 * nada sensível de credencial sai daqui.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import { EXPORT_TABLES, type ExportTableName } from "@/lib/settings/export-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/**
 * Lê uma tabela inteira do usuário.
 *
 * DOIS DETALHES QUE PARECEM DE ESTILO E NÃO SÃO:
 *
 * 1. `.eq("user_id", …)` é REDUNDANTE para a maioria das tabelas (a RLS já filtra), mas é
 *    ESSENCIAL para as do módulo Dieta que aceitam `user_id` nulo: nelas a policy de SELECT
 *    alcança também as linhas globais, e sem o filtro o backup viria com os 597 alimentos da
 *    TACO e seus 21.147 valores — dado que não é do usuário e que a migration recria.
 *
 * 2. O cast localizado existe por causa do TS2589. O `from()` do supabase-js resolve o tipo
 *    da tabela a partir do LITERAL da string; com a união de todas as tabelas do projeto (67
 *    desde a Fase 16-B) o compilador estoura o limite de instanciação. Aqui a tabela é
 *    dinâmica e as linhas vão direto para o JSON do backup — nenhum tipo de linha é usado —
 *    então um cast único e explicado resolve sem espalhar `any` pelo arquivo.
 */
async function dumpTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: ExportTableName,
  userId: string,
): Promise<unknown[]> {
  const dynamicClient = supabase as unknown as {
    from: (t: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await dynamicClient
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .limit(100000);
  return error ? [] : (data ?? []);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `exported_at` é instante (ISO/UTC, correto); o nome do arquivo usa o dia em Brasília,
  // senão um backup baixado às 22h sai nomeado com a data de amanhã.
  const result: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    app: "Sistema Pessoal Yuri",
    user: { id: user.id, email: user.email },
  };

  const entries = await Promise.all(
    EXPORT_TABLES.map(async (table) => {
      return [table, await dumpTable(supabase, table, user.id)] as const;
    }),
  );
  for (const [table, rows] of entries) result[table] = rows;

  const body = JSON.stringify(result, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-yuri-${hojeISO()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

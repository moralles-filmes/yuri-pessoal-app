import { PageHeader } from "@/components/shared/page-header";
import { searchAll } from "@/lib/search/queries";
import { BuscaClient } from "./busca-client";

export const dynamic = "force-dynamic";

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const groups = q.trim().length >= 2 ? await searchAll(q) : [];
  // REDESIGN-07-D · D6 — `key={q}`: digitar troca a URL sem ir ao servidor (`replaceState`); uma
  // navegação de fora (paleta, voltar, link) troca o `q` do servidor e remonta com os resultados dele.
  return (
    // O cabeçalho mora aqui, no servidor: é estático e não precisa entrar no JS da tela (D6).
    <div className="space-y-6">
      <PageHeader
        title="Busca"
        description="Encontre transações, faturas, pessoas, tarefas, hábitos, estudos, eventos e mais."
      />
      <BuscaClient key={q} initialQuery={q} initialGroups={groups} />
    </div>
  );
}

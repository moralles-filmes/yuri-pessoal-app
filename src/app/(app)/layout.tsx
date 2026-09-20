import { cookies } from "next/headers";
import {
  AppShell,
  SIDEBAR_COOKIE,
  SIDEBAR_HIDDEN_COOKIE,
} from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/supabase/server";
import { getUnreadCount } from "@/lib/notifications/queries";
import { getDisplayName } from "@/lib/settings/queries";
import { getFloatingButtonPrefs } from "@/lib/ai/queries";
import { CANTO_PADRAO } from "@/lib/ai/painel";

/**
 * Layout autenticado: envolve as rotas em (app) com a casca (sidebar + header).
 * A proteção real de rotas é feita no `proxy.ts`. Aqui buscamos o usuário (se
 * houver), a preferência de sidebar (cookie) e o nº de notificações não lidas
 * (badge do sino) — tudo seguro/degradável sem Supabase configurado.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cookieStore, unreadCount, displayName] = await Promise.all([
    getCurrentUser(),
    cookies(),
    getUnreadCount(),
    getDisplayName(),
  ]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "true";
  const sidebarHidden = cookieStore.get(SIDEBAR_HIDDEN_COOKIE)?.value === "true";

  /*
    18-F Bloco 2 — duas colunas, DEPENDENTES do usuário (por isso fora do `Promise.all`
    acima). Sem sessão não há preferência a ler, e o botão cai no padrão: a casca já degrada
    com elegância sem Supabase configurado, e esta leitura não pode ser a que quebra isso.
  */
  const botao = user
    ? await getFloatingButtonPrefs(user.id)
    : { canto: CANTO_PADRAO, oculto: false };

  return (
    <AppShell
      email={user?.email}
      displayName={displayName}
      unreadCount={unreadCount}
      defaultCollapsed={collapsed}
      defaultHidden={sidebarHidden}
      cantoDoAssistente={botao.canto}
      assistenteOculto={botao.oculto}
    >
      {children}
    </AppShell>
  );
}

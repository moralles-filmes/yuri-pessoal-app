import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Database, Download, FolderTree } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SecurityCard } from "@/components/settings/security-card";
import { RegionalCard } from "@/components/settings/regional-card";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { DashboardPrefsCard } from "@/components/settings/dashboard-prefs-card";
import { AiCard } from "@/components/settings/ai-card";
import { GoogleConnectCard } from "@/app/(app)/agenda/google-connect-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/settings/queries";
import { getGoogleConnectionStatus } from "@/lib/calendar/queries";
import { getProviderCards } from "@/lib/ai/queries";
import { cryptoProblemMessage } from "@/lib/ai/server/crypto-readiness";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const SHORTCUTS = [
  {
    icon: FolderTree,
    title: "Categorias",
    description: "Gerencie categorias e subcategorias financeiras.",
    href: "/financeiro/categorias",
  },
  {
    icon: CreditCard,
    title: "Cartões",
    description: "Cadastre e edite seus cartões, fechamento e vencimento.",
    href: "/cartoes",
  },
] as const;

export default async function ConfiguracoesPage() {
  const [user, settings, google] = await Promise.all([
    getCurrentUser(),
    getUserSettings(),
    getGoogleConnectionStatus(),
  ]);

  // Fase 18-A: as chaves dos provedores de IA moram aqui, em Configurações — é onde o
  // usuário procura por "chave de API". A tela completa fica em `/ia/configuracoes`.
  const aiCards = user ? await getProviderCards(user.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Perfil, aparência, regional (BRL · data brasileira), notificações, integrações e backup."
      />

      <ProfileCard
        email={user?.email}
        displayName={settings.displayName}
        avatarUrl={settings.avatarUrl}
      />

      <SecurityCard email={user?.email} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AppearanceCard />
        <RegionalCard dateFormat={settings.dateFormat} />
      </div>

      <NotificationsCard prefs={settings.notificationPrefs} />

      <AiCard cards={aiCards} problemaCripto={cryptoProblemMessage()} />

      {/* Integração Google Agenda */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Integração Google Agenda</h2>
        <GoogleConnectCard status={google.status} configured={google.configured} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardPrefsCard />

        {/* Exportação & backup (server-rendered: link de download protegido pelo proxy) */}
        <Card>
          <CardHeader>
            <CardTitle>Exportação & backup</CardTitle>
            <CardDescription>
              Baixe todos os seus dados em JSON. Não inclui tokens/segredos e respeita
              o seu acesso (RLS).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild>
              <a href="/api/export">
                <Download /> Baixar backup (JSON)
              </a>
            </Button>
            {/*
              Honestidade sobre o que o backup NÃO leva (16-E). As fotos de evolução são
              arquivos no Storage privado, e um JSON não os carrega. Dizer isso é melhor do
              que deixar o usuário descobrir na hora de restaurar.
            */}
            <p className="text-xs text-muted-foreground">
              O arquivo traz seus registros, incluindo os dados das fotos de evolução (data,
              ângulo e observações) — mas <strong>não as imagens em si</strong>, que ficam
              guardadas em área privada e precisam ser baixadas pela tela de medidas.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Atalhos de configuração de domínio */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SHORTCUTS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-start gap-3 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Icon className="size-5" />
              </span>
              <div className="space-y-0.5">
                <p className="font-medium group-hover:text-primary">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="size-3.5" />
        Seus dados são protegidos por RLS no Supabase (cada acesso filtra por usuário).
      </p>
    </div>
  );
}

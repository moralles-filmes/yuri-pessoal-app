"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutDashboard, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resetDashboardLayout } from "@/lib/actions/settings";

/** Card de preferências do dashboard: atalho para personalizar + restaurar padrão. */
export function DashboardPrefsCard() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onReset() {
    startTransition(async () => {
      const res = await resetDashboardLayout();
      if (res.ok) {
        toast.success("Layout do dashboard restaurado ao padrão.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
        <CardDescription>
          Ordene/oculte cards e escolha período padrão no próprio dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="outline" className="sm:flex-1">
          <Link href="/dashboard">
            <LayoutDashboard /> Personalizar dashboard
          </Link>
        </Button>
        <Button
          variant="ghost"
          onClick={onReset}
          disabled={pending}
          className="text-muted-foreground sm:flex-1"
        >
          <RotateCcw /> {pending ? "Restaurando…" : "Restaurar padrão"}
        </Button>
      </CardContent>
    </Card>
  );
}

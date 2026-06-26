"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/config/env";
import { getInitials } from "@/lib/format";

export function UserMenu({
  email,
  displayName,
}: {
  email?: string | null;
  displayName?: string | null;
}) {
  const router = useRouter();

  async function handleSignOut() {
    if (!isSupabaseConfigured) {
      toast.info("Configure o Supabase (.env.local) para ativar o login.");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Menu do usuário"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {getInitials(displayName || email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">
            {displayName || "Minha conta"}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {email ?? "Não autenticado"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings className="mr-2 size-4" />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

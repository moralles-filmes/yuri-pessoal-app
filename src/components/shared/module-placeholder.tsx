import { type LucideIcon } from "lucide-react";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * Conteúdo padrão para módulos ainda não implementados (Fase 01).
 * Mantém o app navegável e demonstra o layout/empty state premium.
 */
export function ModulePlaceholder({
  title,
  description,
  icon,
  phase,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  phase: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description}>
        <Badge variant="secondary" className="gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" />
          {phase}
        </Badge>
      </PageHeader>
      <EmptyState
        icon={icon}
        title="Módulo em construção"
        description={`Este módulo será implementado na ${phase}. A base visual, navegação e tema já estão prontos.`}
      />
    </div>
  );
}

import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vazio premium: ícone em destaque dourado, título, descrição e ação.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  nivel = 2,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /**
   * Nível do título. `2` (padrão) quando o estado vazio é a própria seção da página; `3` ou `4` quando
   * mora dentro de uma seção já titulada na mesma tela. Só troca a tag: o tamanho vem das classes.
   */
  nivel?: 2 | 3 | 4;
  className?: string;
}) {
  const Titulo = `h${nivel}` as const;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-tile px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" />
      </div>
      <Titulo className="text-base font-semibold">{title}</Titulo>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children && <div className="mt-5 flex items-center gap-2">{children}</div>}
    </div>
  );
}

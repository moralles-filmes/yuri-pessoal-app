import { cn } from "@/lib/utils";

/**
 * Cabeçalho padrão de página: título, descrição opcional e área de ações.
 */
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {/* `min-w-0` + `break-words`: título longo (ou nome cadastrado pelo usuário, sem
          espaço) não pode alargar a linha e empurrar as ações para fora da tela. */}
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm break-words text-muted-foreground">{description}</p>
        )}
      </div>
      {/* `flex-wrap`: com três ou mais botões a linha quebra em vez de estourar no celular. */}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

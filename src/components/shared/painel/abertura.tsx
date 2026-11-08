import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tituloDaAbertura } from "@/lib/painel/saudacao";

/**
 * Abertura do painel (09-D). ⛔ Server Component, SEM JS de cliente: data, saudação, nome e linha
 * chegam prontos (a hora é de Brasília, calculada no servidor).
 *
 * Fica DIRETO na névoa, sem caixa nem degradê: só `text-foreground` e `text-muted-on-fog`, os dois
 * pares de contraste medidos para esse fundo. É o único `<h1>` da tela — a página não tem
 * `PageHeader`. Nome longo e sem espaço quebra (`break-words`) em vez de empurrar a página.
 */
export function Abertura({
  data,
  saudacao,
  nome,
  linha,
  acoes,
  className,
}: {
  data: string;
  saudacao: string;
  nome: string | null;
  linha: string;
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Boas-vindas"
      className={cn(
        "flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      {/* `min-w-0`: o título longo não pode empurrar as ações para fora da tela. */}
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold text-muted-on-fog">{data}</p>
        <h1 className="mt-2.5 text-[2.375rem] leading-[1.04] font-bold tracking-[-0.04em] break-words text-foreground sm:text-[3.375rem]">
          {tituloDaAbertura(saudacao, nome)}
        </h1>
        <p className="mt-3 max-w-[46ch] text-[1.0625rem] leading-[1.45] text-muted-on-fog sm:text-[1.1875rem]">
          {linha}
        </p>
      </div>
      {acoes ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{acoes}</div> : null}
    </section>
  );
}

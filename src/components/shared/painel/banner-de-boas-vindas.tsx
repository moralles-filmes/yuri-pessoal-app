import { Montanha } from "./montanha";
import { cn } from "@/lib/utils";

/** Texto até o primeiro espaço. Nome só com espaços não é nome. */
function primeiroNomeDe(nome: string | null): string | null {
  const limpo = nome?.trim();
  if (!limpo) return null;
  return limpo.split(/\s+/)[0];
}

/**
 * Banner de boas-vindas do painel. ⛔ Server Component, SEM JS de cliente: saudação, nome, linha e
 * frase chegam prontos (a hora é de Brasília, calculada no servidor).
 *
 * Degradê com `--banner-from` → `--banner-to` só nesta superfície (exceção declarada ao TOKENS.md
 * §8). Texto branco em cima, nos dois temas — os tokens foram escolhidos para isso.
 * No celular o banner é mais baixo, sem a frase e com a montanha menor.
 */
export function BannerDeBoasVindas({
  saudacao,
  nome,
  linha,
  frase,
  className,
}: {
  saudacao: string;
  nome: string | null;
  linha: string;
  frase?: string;
  className?: string;
}) {
  const primeiro = primeiroNomeDe(nome);
  const titulo = primeiro ? `${saudacao}, ${primeiro}!` : `${saudacao}!`;

  return (
    <section
      aria-label="Boas-vindas"
      className={cn(
        "relative flex min-h-0 items-center justify-between gap-6 overflow-hidden rounded-xl bg-gradient-to-r from-[var(--banner-from)] to-[var(--banner-to)] p-4 text-white sm:min-h-[8.25rem] sm:p-7",
        className,
      )}
    >
      {/* `min-w-0`: o título longo não pode empurrar a frase para fora do banner. */}
      <div className="relative z-10 min-w-0">
        <h2 className="text-[1.375rem] font-bold tracking-tight sm:text-3xl">
          {titulo}{" "}
          <span aria-hidden="true">👋</span>
        </h2>
        <p className="mt-1.5 text-[0.8125rem] sm:text-[0.9375rem]">{linha}</p>
      </div>
      {frase ? (
        <p className="relative z-10 hidden sm:block max-w-[18.75rem] rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-[0.9375rem] leading-snug">
          {frase}
        </p>
      ) : null}
      <Montanha className="absolute right-0 bottom-0 h-[70%] w-auto text-white/15 sm:h-full" />
    </section>
  );
}

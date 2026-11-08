"use client";

import { useEffect } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { AlertTriangle } from "lucide-react";

/**
 * REDESIGN-06 (§6, aceite) — erro isolado por bloco: a falha de um card não derruba a página
 * inteira para o `error.tsx`; o bloco mostra o desenho de falha e os outros seguem.
 *
 * É o `catchError` do Next, não uma classe própria: o `retry()` relê os dados (numa Transition)
 * e só troca a falha pelo conteúdo quando a releitura dá certo — zerar o erro antes de reler
 * faria o bloco cair de novo no mesmo payload. Ele também deixa `redirect()`/`notFound()`
 * passarem e limpa o erro na navegação. "Tentar de novo" NÃO é um Link: a navegação suave
 * mantinha o limite com erro e perdia o `?periodo`.
 */
function FalhaDoBloco({ nome }: { nome: string }, { retry }: ErrorInfo) {
  useEffect(() => {
    // Só o nome do bloco: a mensagem do erro pode carregar dado do dono.
    console.error("[dashboard] bloco sem leitura:", nome);
  }, [nome]);

  return (
    <div className="space-y-2 py-4 text-center text-sm">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-left ring-1 ring-destructive/20"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <p className="min-w-0 text-muted-foreground">
          Não foi possível ler {nome}. O card fica sem valores para não mostrar um número errado.
        </p>
      </div>
      <button
        type="button"
        onClick={() => retry()}
        className="text-primary underline-offset-4 hover:underline"
      >
        Tentar de novo
      </button>
    </div>
  );
}

export const LimiteDoBloco = catchError(FalhaDoBloco);

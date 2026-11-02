"use client";

import { Component, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { estadoDoLimite } from "@/lib/dashboard/limite";

/**
 * REDESIGN-06 (§6, aceite) — erro isolado por bloco: a falha de um card não derruba a página
 * inteira para o `error.tsx`; o bloco mostra o desenho de falha e os outros seguem.
 *
 * "Tentar de novo" NÃO é um Link: navegação suave mantém o boundary com erro e perde o
 * `?periodo`. Aqui o boundary é reiniciado (`onReset`) e os dados são relidos (`router.refresh()`)
 * na mesma URL.
 */
export class LimiteDoBloco extends Component<
  { nome: string; children: ReactNode },
  { erro: unknown | null }
> {
  state: { erro: unknown | null } = { erro: null };

  static getDerivedStateFromError(erro: unknown) {
    return { erro };
  }

  componentDidCatch() {
    // Só o nome do bloco: a mensagem do erro pode carregar dado do dono.
    console.error("[dashboard] bloco sem leitura:", this.props.nome);
  }

  render() {
    if (estadoDoLimite(this.state) === "falha") {
      return (
        <FalhaDoBloco oQue={this.props.nome} onReset={() => this.setState({ erro: null })} />
      );
    }
    return this.props.children;
  }
}

function FalhaDoBloco({ oQue, onReset }: { oQue: string; onReset: () => void }) {
  const router = useRouter();
  return (
    <div className="space-y-2 py-4 text-center text-sm">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-left ring-1 ring-destructive/20"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <p className="min-w-0 text-muted-foreground">
          Não foi possível ler {oQue}. O card fica sem valores para não mostrar um número errado.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          onReset();
          router.refresh();
        }}
        className="text-primary underline-offset-4 hover:underline"
      >
        Tentar de novo
      </button>
    </div>
  );
}

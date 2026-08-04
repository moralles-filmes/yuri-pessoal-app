"use client";

/**
 * Campo de texto que alimenta a URL sem travar a digitação.
 *
 * ⛔ REGRA QUE VEIO DE UM BUG REAL: **input de busca nunca é controlado pelo valor da URL.**
 *
 * As páginas de módulo são `force-dynamic`. Gravar na URL a cada tecla faz o Next buscar o
 * RSC no servidor, e o `value` do input só atualizava quando a resposta voltava — a letra
 * atrasava, o cursor pulava e digitar rápido perdia caractere.
 *
 * Aqui o campo responde na hora (estado local) e a URL recebe o texto depois de uma pausa,
 * preservando link, botão voltar e recarregar. As decisões de sincronia são puras e testadas
 * em `url-text-sync.ts`.
 */
import * as React from "react";
import { nextLocalText, shouldCommitText } from "./url-text-sync";

/** Pausa após a última tecla antes de gravar na URL. */
export const URL_TEXT_DELAY_MS = 300;

export function useUrlText(
  urlText: string,
  commit: (value: string) => void,
  delay: number = URL_TEXT_DELAY_MS,
): [string, (value: string) => void] {
  const [local, setLocal] = React.useState(urlText);

  // A gravação roda dentro de um timer; sem a ref ela usaria o `commit` de um render velho.
  // A ref é atualizada em efeito, nunca durante o render.
  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  });

  // O que já mandamos gravar, para reconhecer o eco atrasado da própria digitação. É estado,
  // não ref, porque o render precisa lê-lo para decidir se adota o valor da URL.
  const [lastCommitted, setLastCommitted] = React.useState<string | null>(null);

  // A URL mudou por fora (Limpar filtros, voltar, link colado) → o campo acompanha.
  // Ajuste durante o render, sem `useEffect` — padrão do projeto.
  const [lastUrlText, setLastUrlText] = React.useState(urlText);
  if (urlText !== lastUrlText) {
    setLastUrlText(urlText);
    const adopted = nextLocalText({
      localText: local,
      previousUrlText: lastUrlText,
      urlText,
      lastCommittedText: lastCommitted,
    });
    if (adopted !== null) setLocal(adopted);
  }

  React.useEffect(() => {
    if (!shouldCommitText(local, urlText)) return;
    const id = setTimeout(() => {
      const value = local.trim();
      setLastCommitted(value);
      commitRef.current(value);
    }, delay);
    return () => clearTimeout(id);
  }, [local, urlText, delay]);

  return [local, setLocal];
}

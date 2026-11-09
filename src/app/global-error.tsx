"use client";

import "./globals.css";
import { inter } from "./fonts";
import { LimiteDeErro } from "@/components/shared/tela-de-erro";

/**
 * 03-G (L3, D-G14) — substitui o layout raiz quando ELE cai, por isso tem `<html>` e `<body>`
 * próprios. É também quem pega a falha do `(app)/layout.tsx` (que lê o usuário): não há
 * `src/app/error.tsx`, pelo custo de bundle escrito em `tela-de-erro.tsx` (decisão do dono). Sem o ThemeProvider (que mora no layout que caiu) a tela sai no tema claro —
 * RR-G-7, aceito. A Inter de reserva (09-B) entra pela classe em `<html>`: sem ela `--font-inter`
 * não existe aqui e o Windows/Android cairia em `Segoe UI`/`system-ui`. Sem `metadata` (é client component).
 */
export default function ErroGlobal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-full antialiased">
        <LimiteDeErro error={error} unstable_retry={unstable_retry} />
      </body>
    </html>
  );
}

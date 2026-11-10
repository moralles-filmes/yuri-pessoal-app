import type { Metadata, Viewport } from "next";
import "./globals.css";
import { inter } from "./fonts";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "Sistema Pessoal",
    template: "%s · Sistema Pessoal",
  },
  description:
    "Central pessoal: finanças, cartões e faturas, agenda, tarefas, hábitos e estudos.",
};

/**
 * `viewport-fit=cover` faz o iOS informar `env(safe-area-inset-*)`; sem ele os valores vêm
 * `0` e o recuo da barra de ações (globals.css) não teria efeito sobre o indicador de início.
 */
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} h-full`}>
      <body className="min-h-full antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          </QueryProvider>
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

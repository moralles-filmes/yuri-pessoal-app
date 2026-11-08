import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

/**
 * Fonte de reserva (09-A, spec 6.4): o corpo usa a fonte do sistema (SF no Apple) e a Inter
 * só entra onde ela não existe. `preload: false` impede o `<link rel="preload">`: quem tem a
 * fonte do sistema nunca baixa a Inter, e a rede que não é usada não é paga.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Sistema Pessoal",
    template: "%s · Sistema Pessoal",
  },
  description:
    "Central pessoal: finanças, cartões e faturas, agenda, tarefas, hábitos e estudos.",
};

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

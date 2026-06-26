import type { Metadata } from "next";
import "./globals.css";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className="h-full">
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
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

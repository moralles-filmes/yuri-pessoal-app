import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { FinanceTabsNav } from "@/components/financeiro/finance-tabs-nav";

export const metadata: Metadata = { title: "Financeiro" };

export default function FinanceiroLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Contas, categorias, lançamentos à vista, contas fixas e recorrências."
      />
      <FinanceTabsNav />
      <div className="pt-2">{children}</div>
    </div>
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * `radix-ui` (pacote unificado v1.6.0) reexporta ~30 primitivas num barrel só, e
     * `src/components/ui/*` importa dele em 15 arquivos. Sem esta linha, cada import puxa o
     * grafo inteiro do pacote — custo que aparece na compilação do `next dev` e no bundle.
     *
     * ⚠️ NÃO acrescente `lucide-react`, `date-fns` nem `recharts` aqui: os três JÁ estão na
     * lista padrão do Next 16 (`node_modules/next/dist/server/config.js`, a lista é unida com
     * a do usuário). Repeti-los não muda nada e dá a impressão falsa de que foram o gargalo.
     */
    optimizePackageImports: ["radix-ui"],
  },
};

export default nextConfig;

"use client";

import { createContext, useContext, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { COOKIE_DO_OLHO } from "@/lib/painel/olho";

type EstadoDoOlho = { oculto: boolean; alternar: () => void };

const OlhoContext = createContext<EstadoDoOlho | null>(null);

/**
 * O "olho" dos valores do painel — única ilha cliente das peças comuns. Estado inicial vem do
 * servidor (cookie); ao alternar, grava o cookie e troca `data-ocultar` no invólucro, e o CSS dos
 * indicadores (`group-data-[ocultar=true]/olho`) escolhe entre o valor e "R$ ••••" sem recarregar.
 *
 * O invólucro é uma caixa comum (bloco), e não `display: contents`: com `contents` ele não recebia
 * o espaçamento do `space-y` do pai e os indicadores encostavam no bloco seguinte (conferência 04-A).
 * sendo Server Components passados de fora: esta ilha não os renderiza, só os envolve.
 *
 * O botão é um componente à parte (`BotaoDoOlho`), que lê o estado por contexto — assim a página
 * o passa como `acessorio` do indicador de saldo e ele aparece ao lado do rótulo, sem que o
 * indicador (Server Component) conheça o estado.
 *
 * ⛔ É discrição, não sigilo: os valores reais continuam no HTML.
 */
export function OlhoDosValores({
  ocultoInicial,
  children,
}: {
  ocultoInicial: boolean;
  children: React.ReactNode;
}) {
  const [oculto, setOculto] = useState(ocultoInicial);

  function alternar() {
    const novo = !oculto;
    setOculto(novo);
    document.cookie = `${COOKIE_DO_OLHO}=${novo ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <OlhoContext.Provider value={{ oculto, alternar }}>
      <div data-ocultar={oculto ? "true" : "false"} className="group/olho">
        {children}
      </div>
    </OlhoContext.Provider>
  );
}

/**
 * 04-B (D-B-13) — o estado do olho para quem vive num PORTAL. A gaveta de registros é desenhada
 * fora do invólucro `group/olho`, e o seletor CSS não a alcança; o portal preserva o contexto do
 * React, não o DOM. Ela lê daqui e repõe `data-ocultar` no próprio invólucro. `null` fora de um
 * `OlhoDosValores`.
 */
export function useOlhoDosValores(): { oculto: boolean } | null {
  const estado = useContext(OlhoContext);
  return estado ? { oculto: estado.oculto } : null;
}

/** Botão do olho. Só funciona dentro de `OlhoDosValores`; fora dele não renderiza nada. */
export function BotaoDoOlho() {
  const estado = useContext(OlhoContext);
  if (!estado) return null;
  const { oculto, alternar } = estado;

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={oculto}
      aria-label={oculto ? "Mostrar valores" : "Ocultar valores"}
      title="Esconde os valores nesta tela, neste aparelho. É discrição, não sigilo."
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {oculto ? (
        <EyeOff aria-hidden="true" className="size-4" />
      ) : (
        <Eye aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}

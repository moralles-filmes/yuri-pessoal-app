"use client"

import * as React from "react"

/**
 * Guard para o bug "Select/menu dentro de Dialog fecha o Dialog".
 *
 * Enquanto um Select Radix está aberto, ele coloca `body { pointer-events: none }`, então
 * clicar ao lado do dropdown (mas dentro do diálogo) atravessa o conteúdo e atinge a
 * overlay. O dismiss do diálogo é adiado para o `click` e, quando roda, o Select já fechou
 * e o clique é interpretado como "clique fora" → o diálogo fecha indevidamente.
 *
 * Solução: no `pointerdown` (fase de captura, antes do Radix), gravamos se havia um popper
 * portalizado aberto. O handler retornado cancela o dismiss de clique-fora nesse caso.
 */
export function usePortalDismissGuard() {
  const popperWasOpenRef = React.useRef(false)

  React.useEffect(() => {
    const onPointerDown = () => {
      popperWasOpenRef.current = Boolean(
        document.querySelector(
          '[data-slot="select-content"][data-state="open"], [data-radix-popper-content-wrapper]',
        ),
      )
    }
    // capture: true garante que rodamos antes do handler de pointerdown do Radix.
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [])

  return React.useCallback((event: { preventDefault: () => void }) => {
    if (popperWasOpenRef.current) event.preventDefault()
  }, [])
}

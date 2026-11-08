"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// Interruptor de vidro (spec 6.x): trilho 52x32, botão branco de 28 px. Ao pressionar, o
// botão estica (34 px); ligado, ele também recua 6 px para a borda direita ficar no lugar.
// `translate-x-*` é a propriedade `translate` no Tailwind v4, não `transform`: por isso a
// transição lista `translate` e `width`.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group peer inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-300 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none data-[state=checked]:bg-primary-fill data-[state=unchecked]:bg-[color-mix(in_oklch,var(--foreground)_16%,transparent)] data-[state=unchecked]:ring-1 data-[state=unchecked]:ring-foreground/50 data-[state=unchecked]:ring-inset",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-7 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.25)] transition-[translate,width] duration-450 ease-mola motion-reduce:transition-none data-[state=checked]:translate-x-5 data-[state=unchecked]:ring-1 data-[state=unchecked]:ring-foreground/60 motion-safe:group-active:w-[34px] motion-safe:data-[state=checked]:group-active:translate-x-[14px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

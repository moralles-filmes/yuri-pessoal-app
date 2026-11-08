"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

import { MATERIAL_LADRILHO } from "./materiais"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        MATERIAL_LADRILHO,
        "peer size-4.5 shrink-0 rounded-[6px] border-foreground/50 transition-colors outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary-fill data-[state=checked]:bg-primary-fill data-[state=checked]:text-primary-fill-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current duration-300 ease-estalo data-[state=checked]:animate-in data-[state=checked]:zoom-in-50 motion-reduce:animate-none"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

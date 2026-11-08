import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

import { MATERIAL_PILULA } from "./materiais"

// O `active:` só vale fora de gatilho de menu (`not-aria-[haspopup]`), como já era; a escala usa
// `motion-safe:` para o movimento reduzido ficar parado. As classes são escritas por extenso
// (o Tailwind só gera CSS para texto literal), o que repete `PRESSAO` de ./materiais com o filtro.
// `outline-none` zera o estilo do contorno no Tailwind v4: sem `outline-solid` o foco não aparece.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[transform,scale,color,background-color,border-color,box-shadow,filter] duration-500 ease-mola motion-reduce:transition-none motion-safe:not-aria-[haspopup]:active:scale-[.96] motion-safe:not-aria-[haspopup]:active:duration-120 outline-none select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary-fill text-primary-fill-foreground bg-[linear-gradient(180deg,rgba(255,255,255,.24),transparent_55%)] shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_-8px_color-mix(in_oklch,var(--primary-fill)_70%,transparent)] hover:brightness-110",
        outline: `${MATERIAL_PILULA} text-foreground hover:bg-pill-strong aria-expanded:bg-pill-strong`,
        secondary: `${MATERIAL_PILULA} text-foreground hover:bg-pill-strong aria-expanded:bg-pill-strong`,
        ghost:
          "hover:bg-primary/10 hover:text-foreground aria-expanded:bg-primary/10 aria-expanded:text-foreground",
        destructive:
          "bg-destructive/3 text-destructive border-destructive/25 hover:bg-destructive/6",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

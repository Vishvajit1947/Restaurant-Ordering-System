import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/**
 * Mercury button system: one solid indigo pill (default) for the primary action,
 * everything else is a translucent capsule.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent text-[15px] font-[450] whitespace-nowrap transition-[background-color,color,border-color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // button-primary
        default: "bg-primary text-primary-foreground hover:bg-[#4457dc]",
        // button-tint-light
        secondary: "bg-primary/10 text-ink hover:bg-primary/15",
        // button-outline-light
        outline:
          "border-[rgba(112,115,147,0.22)] bg-[rgba(112,115,147,0.08)] text-ink hover:bg-[rgba(112,115,147,0.14)]",
        ghost: "text-ink hover:bg-[rgba(112,115,147,0.1)]",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:ring-destructive/20",
        "destructive-solid": "bg-destructive text-white hover:bg-destructive/90",
        // button-glass-dark (for night surfaces)
        glass:
          "border-[rgba(175,178,206,0.36)] bg-[rgba(175,178,206,0.2)] text-on-dark hover:bg-[rgba(175,178,206,0.28)]",
        // button-tint-dark
        "tint-dark": "bg-[rgba(156,180,232,0.2)] text-on-dark hover:bg-[rgba(156,180,232,0.28)]",
        "ghost-dark": "text-on-dark hover:bg-white/8",
        link: "rounded-none px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-4 text-sm",
        xs: "h-7 gap-1 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-12",
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

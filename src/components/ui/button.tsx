import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-sakura-light active:scale-[0.98] cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-plum text-white shadow-[var(--shadow-soft)] hover:bg-plum-dark",
        sakura: "bg-sakura text-white shadow-[var(--shadow-soft)] hover:bg-[#dd7d8e]",
        gold: "bg-gold text-white shadow-[var(--shadow-gold)] hover:bg-[#c9925a]",
        destructive: "bg-error text-white shadow-sm hover:bg-[#b3242e]",
        outline: "border-2 border-dusty-pink bg-white text-plum-dark hover:bg-blush",
        secondary: "bg-lavender-mist text-plum-dark hover:bg-[#e4d8ea]",
        ghost: "text-plum-dark hover:bg-blush",
        link: "text-plum underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-10 px-5 text-sm",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-7 text-base",
        xl: "h-16 px-10 text-xl",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

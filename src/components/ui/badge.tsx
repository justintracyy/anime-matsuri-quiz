import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-plum text-white",
        sakura: "border-transparent bg-sakura-light text-plum-dark",
        lavender: "border-transparent bg-lavender-mist text-plum",
        gold: "border-transparent bg-gold/20 text-[#8a5c2a]",
        outline: "border-dusty-pink bg-white text-plum-dark",
        destructive: "border-transparent bg-error/10 text-error",
        success: "border-transparent bg-emerald-100 text-emerald-800",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-xl border-2 border-dusty-pink bg-white px-3.5 py-2.5 text-base text-plum-dark shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-text/70 focus-visible:border-sakura focus-visible:ring-4 focus-visible:ring-sakura-light/60 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

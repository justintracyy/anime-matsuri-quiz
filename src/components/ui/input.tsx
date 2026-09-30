import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-xl border-2 border-dusty-pink bg-white px-3.5 py-2 text-base text-plum-dark shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-text/70 focus-visible:border-sakura focus-visible:ring-4 focus-visible:ring-sakura-light/60 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error aria-invalid:ring-error/20 file:border-0 file:bg-transparent file:text-sm file:font-medium md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

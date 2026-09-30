"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root className={cn("relative h-3 w-full overflow-hidden rounded-full bg-blush", className)} value={value} {...props}>
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 bg-sakura transition-transform duration-300 ease-linear", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };

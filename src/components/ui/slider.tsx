"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Slider({ className, value, defaultValue, thumbLabels, ...props }: React.ComponentProps<typeof SliderPrimitive.Root> & { thumbLabels?: string[] }) {
  const thumbs = (value ?? defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      className={cn("relative flex w-full touch-none select-none items-center py-2 data-[disabled]:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-blush">
        <SliderPrimitive.Range className="absolute h-full bg-sakura" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={thumbLabels?.[i]}
          className="block size-5 rounded-full border-2 border-sakura bg-white shadow transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sakura-light"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };

import { EVENT_NAME, EVENT_THEME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { SakuraBlossom } from "./decorations";

export function EventLogo({ size = "md", className }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const title = { sm: "text-lg", md: "text-2xl", lg: "text-4xl md:text-5xl", xl: "text-5xl md:text-7xl" }[size];
  const sub = { sm: "text-[10px]", md: "text-xs", lg: "text-sm md:text-base", xl: "text-base md:text-xl" }[size];
  const flower = { sm: "w-6", md: "w-8", lg: "w-12", xl: "w-16" }[size];
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SakuraBlossom className={cn("shrink-0", flower)} />
      <div className="leading-none">
        <p className={cn("font-sans font-bold uppercase tracking-[0.25em] text-lavender", sub)}>{EVENT_NAME}</p>
        <p className={cn("font-serif font-bold text-plum-dark", title)}>{EVENT_THEME}</p>
      </div>
    </div>
  );
}

export function SectionEyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-sakura", className)}>
      <span className="h-px w-6 bg-sakura" />
      {children}
      <span className="h-px w-6 bg-sakura" />
    </p>
  );
}

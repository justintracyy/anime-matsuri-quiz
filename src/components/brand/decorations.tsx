import { cn } from "@/lib/utils";

/** Original festival artwork — sakura, lanterns, spirits, clouds and mountains. */

export function SakuraBlossom({ className, color = "#F7B7C3", center = "#E991A0" }: { className?: string; color?: string; center?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g transform="translate(50 50)">
        {[0, 72, 144, 216, 288].map((r) => (
          <path
            key={r}
            transform={`rotate(${r})`}
            d="M0 -6 C -14 -18 -16 -36 -6 -44 L0 -38 L6 -44 C 16 -36 14 -18 0 -6 Z"
            fill={color}
            stroke={center}
            strokeOpacity="0.35"
            strokeWidth="1.5"
          />
        ))}
        <circle r="7" fill={center} />
        {[0, 72, 144, 216, 288].map((r) => (
          <circle key={r} transform={`rotate(${r + 36}) translate(0 -11)`} r="2" fill="#D8A56D" />
        ))}
      </g>
    </svg>
  );
}

export function SakuraPetal({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path d="M12 2 C 5 7 4 15 12 22 C 20 15 19 7 12 2 Z M12 2 L10.5 5.5 L12 4.6 L13.5 5.5 Z" fill="#F7B7C3" stroke="#E991A0" strokeWidth="0.8" />
    </svg>
  );
}

export function PaperLantern({ className, glow = true, label }: { className?: string; glow?: boolean; label?: string }) {
  return (
    <svg viewBox="0 0 80 150" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="lantern-glow" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#FFE8C2" />
          <stop offset="55%" stopColor="#F7B7C3" />
          <stop offset="100%" stopColor="#E991A0" />
        </radialGradient>
      </defs>
      <line x1="40" y1="0" x2="40" y2="18" stroke="#4B3D4F" strokeWidth="2" />
      <rect x="26" y="16" width="28" height="9" rx="2" fill="#4B3D4F" />
      {glow && <ellipse cx="40" cy="70" rx="44" ry="50" fill="#F7B7C3" opacity="0.18" />}
      <ellipse cx="40" cy="68" rx="32" ry="44" fill="url(#lantern-glow)" stroke="#6E4F74" strokeWidth="2" />
      {[-30, -18, -6, 6, 18, 30].map((dy) => (
        <path
          key={dy}
          d={`M${40 - Math.sqrt(Math.max(0, 1 - (dy / 44) ** 2)) * 32} ${68 + dy} Q 40 ${68 + dy + 4} ${40 + Math.sqrt(Math.max(0, 1 - (dy / 44) ** 2)) * 32} ${68 + dy}`}
          stroke="#6E4F74"
          strokeOpacity="0.3"
          strokeWidth="1.2"
          fill="none"
        />
      ))}
      {label && (
        <text x="40" y="76" textAnchor="middle" fontSize="22" fontFamily="serif" fill="#6E4F74" fontWeight="700">
          {label}
        </text>
      )}
      <rect x="26" y="110" width="28" height="9" rx="2" fill="#4B3D4F" />
      <line x1="40" y1="119" x2="40" y2="130" stroke="#D8A56D" strokeWidth="2" />
      <path d="M34 130 h12 l-2 18 h-8 z" fill="#D8A56D" />
    </svg>
  );
}

/** A small original spirit wisp. */
export function Spirit({ className, color = "#FFFFFF", mood = "happy" }: { className?: string; color?: string; mood?: "happy" | "wow" }) {
  return (
    <svg viewBox="0 0 80 90" className={className} aria-hidden="true">
      <ellipse cx="40" cy="84" rx="18" ry="3" fill="#6E4F74" opacity="0.12" />
      <path
        d="M40 6 C 20 22 12 40 14 54 C 16 70 28 78 40 78 C 54 78 66 70 66 54 C 66 40 58 30 50 24 C 52 34 48 38 44 38 C 48 26 46 14 40 6 Z"
        fill={color}
        stroke="#8D6E95"
        strokeWidth="2"
      />
      <ellipse cx="31" cy="54" rx="3" ry={mood === "wow" ? 4 : 3.5} fill="#4B3D4F" />
      <ellipse cx="49" cy="54" rx="3" ry={mood === "wow" ? 4 : 3.5} fill="#4B3D4F" />
      <ellipse cx="25" cy="61" rx="4" ry="2.4" fill="#F7B7C3" />
      <ellipse cx="55" cy="61" rx="4" ry="2.4" fill="#F7B7C3" />
      {mood === "wow" ? (
        <ellipse cx="40" cy="64" rx="3" ry="3.5" fill="#4B3D4F" />
      ) : (
        <path d="M35 62 Q 40 67 45 62" stroke="#4B3D4F" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function FestivalCloud({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 70" className={className} aria-hidden="true">
      <path
        d="M10 55 C 10 40 26 34 38 40 C 40 22 64 16 76 30 C 86 12 118 12 126 32 C 138 22 160 26 162 42 C 178 38 192 46 190 58 Z"
        fill="#FFFFFF"
        stroke="#ECC9CF"
        strokeWidth="2"
      />
      <path d="M52 48 q 10 -10 20 0 M104 44 q 12 -12 24 0" stroke="#ECC9CF" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Mountains({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d="M0 220 L0 160 L180 70 L300 140 L470 30 L640 150 L780 80 L960 160 L1080 100 L1200 150 L1200 220 Z" fill="#8D6E95" opacity="0.18" />
      <path d="M470 30 L420 62 L445 58 L470 72 L495 58 L520 62 Z" fill="#FFFFFF" opacity="0.8" />
      <path d="M0 220 L0 190 L150 130 L320 190 L520 110 L700 190 L880 130 L1050 185 L1200 140 L1200 220 Z" fill="#6E4F74" opacity="0.16" />
    </svg>
  );
}

export function Torii({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true">
      <path d="M4 14 Q 60 2 116 14 L112 22 Q 60 12 8 22 Z" fill="#E991A0" />
      <rect x="14" y="30" width="92" height="7" rx="2" fill="#E991A0" />
      <rect x="24" y="18" width="9" height="82" fill="#E991A0" />
      <rect x="87" y="18" width="9" height="82" fill="#E991A0" />
      <rect x="56" y="22" width="8" height="12" fill="#6E4F74" />
    </svg>
  );
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Deterministic positions so server and client render identically. */
export function FallingPetals({ count = 14, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("pointer-events-none fixed inset-0 z-0 overflow-hidden", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const left = pseudoRandom(i + 1) * 100;
        const size = 12 + pseudoRandom(i + 7) * 14;
        const duration = 12 + pseudoRandom(i + 13) * 14;
        const delay = -pseudoRandom(i + 21) * duration;
        const drift = (pseudoRandom(i + 31) - 0.5) * 220;
        return (
          <SakuraPetal
            key={i}
            className="absolute top-0 animate-petal-fall opacity-80"
            style={
              {
                left: `${left}%`,
                width: size,
                height: size,
                animationDuration: `${duration}s`,
                animationDelay: `${delay}s`,
                "--petal-drift": `${drift}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/** Page backdrop: lanterns, clouds, mountains and drifting petals. */
export function FestivalBackdrop({ petals = 14, lanterns = true, spirits = true }: { petals?: number; lanterns?: boolean; spirits?: boolean }) {
  return (
    <>
      <FallingPetals count={petals} />
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        {lanterns && (
          <>
            <PaperLantern className="absolute -top-2 left-[4%] hidden w-14 origin-top animate-lantern-sway sm:block md:w-20" label="祭" />
            <PaperLantern className="absolute -top-6 left-[14%] hidden w-10 origin-top animate-lantern-sway [animation-delay:-2s] md:block" />
            <PaperLantern className="absolute -top-2 right-[4%] hidden w-14 origin-top animate-lantern-sway [animation-delay:-1s] sm:block md:w-20" label="桜" />
            <PaperLantern className="absolute -top-6 right-[14%] hidden w-10 origin-top animate-lantern-sway [animation-delay:-3s] md:block" />
          </>
        )}
        <FestivalCloud className="absolute left-[-40px] top-[18%] w-40 opacity-70 md:w-56" />
        <FestivalCloud className="absolute right-[-30px] top-[40%] w-32 opacity-60 md:w-48" />
        {spirits && (
          <>
            <Spirit className="absolute bottom-[14%] left-[3%] hidden w-12 animate-spirit-float md:block" />
            <Spirit className="absolute bottom-[22%] right-[4%] hidden w-10 animate-spirit-float [animation-delay:-3s] md:block" color="#FBE9EC" mood="wow" />
          </>
        )}
        <Mountains className="absolute bottom-0 left-0 h-28 w-full md:h-40" />
        <SakuraBlossom className="absolute -bottom-6 -left-6 w-28 opacity-60 md:w-40" />
        <SakuraBlossom className="absolute -bottom-8 right-10 w-20 opacity-50 md:w-28" />
      </div>
    </>
  );
}

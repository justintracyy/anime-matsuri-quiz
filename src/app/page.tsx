import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { EventLogo, SectionEyebrow } from "@/components/brand/brand";
import { FestivalBackdrop, Spirit } from "@/components/brand/decorations";
import { PinEntry } from "@/components/player/pin-entry";
import { Button } from "@/components/ui/button";
import { GAME_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <FestivalBackdrop />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8 text-center">
        <EventLogo size="lg" />
        <div className="space-y-2">
          <SectionEyebrow className="justify-center">{GAME_NAME}</SectionEyebrow>
          <h1 className="text-balance font-serif text-3xl font-bold md:text-4xl">Guess the anime. Win the festival.</h1>
          <p className="text-muted-text">Scan the QR code on the big screen, or enter the six-digit game PIN.</p>
        </div>
        <div className="card-matsuri w-full p-6">
          <PinEntry />
        </div>
        <Spirit className="w-14 animate-spirit-float" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <LayoutDashboard /> Organizer dashboard
          </Link>
        </Button>
      </div>
    </main>
  );
}

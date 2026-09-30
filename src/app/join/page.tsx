import type { Metadata } from "next";
import { EventLogo } from "@/components/brand/brand";
import { FestivalBackdrop } from "@/components/brand/decorations";
import { PinEntry } from "@/components/player/pin-entry";

export const metadata: Metadata = { title: "Join a game" };

export default function JoinPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <FestivalBackdrop petals={8} />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <EventLogo />
        <div className="card-matsuri w-full p-6">
          <h1 className="mb-4 text-center font-serif text-2xl font-bold">Enter the game PIN</h1>
          <PinEntry />
        </div>
      </div>
    </main>
  );
}

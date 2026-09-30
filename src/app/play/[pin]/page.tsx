import type { Metadata } from "next";
import { PlayClient } from "@/components/player/join-client";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  return <PlayClient pin={pin} />;
}

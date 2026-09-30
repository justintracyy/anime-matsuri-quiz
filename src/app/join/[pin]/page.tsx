import type { Metadata } from "next";
import { JoinClient } from "@/components/player/join-client";

export const metadata: Metadata = { title: "Join game" };

export default async function JoinWithPinPage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  return <JoinClient pin={pin} />;
}

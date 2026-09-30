import type { Metadata } from "next";
import { HostClient } from "@/components/host/host-client";

export const metadata: Metadata = { title: "Host live game" };

export default async function HostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <HostClient sessionId={sessionId} />;
}

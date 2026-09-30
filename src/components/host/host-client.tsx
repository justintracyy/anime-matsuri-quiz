"use client";

import dynamic from "next/dynamic";
import { FullPageSpinner } from "@/components/states";

export const HostClient = dynamic(() => import("./host-game").then((m) => m.HostGame), {
  ssr: false,
  loading: () => <FullPageSpinner label="Restoring the live game…" />,
});

"use client";

import dynamic from "next/dynamic";
import { FullPageSpinner } from "@/components/states";

/** Player pages read localStorage on first render, so they render only in the browser. */
export const JoinClient = dynamic(() => import("./join-form").then((m) => m.JoinForm), {
  ssr: false,
  loading: () => <FullPageSpinner label="Opening the festival gates…" />,
});

export const PlayClient = dynamic(() => import("./player-game").then((m) => m.PlayerGame), {
  ssr: false,
  loading: () => <FullPageSpinner label="Reconnecting to your game…" />,
});

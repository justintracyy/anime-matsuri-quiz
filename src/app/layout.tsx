import type { Metadata, Viewport } from "next";
import { Nunito, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import { EVENT_FULL_NAME, GAME_NAME } from "@/lib/constants";
import "./globals.css";

const heading = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const body = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${GAME_NAME} • ${EVENT_FULL_NAME}`, template: `%s • ${GAME_NAME}` },
  description: `A live multiplayer anime guessing game for ${EVENT_FULL_NAME}.`,
  applicationName: GAME_NAME,
};

export const viewport: Viewport = {
  themeColor: "#FFF8F3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{ className: "!rounded-2xl !border-2 !border-dusty-pink !font-sans" }}
        />
      </body>
    </html>
  );
}

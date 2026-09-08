import type { Metadata } from "next";
import "./globals.css";
import "./day-styles.css";
import "./community-styles.css";
import "./account-styles.css";
import "./refinement.css";
import { getSiteSettings } from "@/lib/data";
import { eventStyle } from "@/lib/presentation";

export const metadata: Metadata = {
  title: {
    default: "Splatify | Less group chat. More game time.",
    template: "%s | Splatify",
  },
  description:
    "Your crew. Your field. One great day. Plan paintball parties, invite friends, and get everyone game-day ready. Free, simple, and built for players.",
  icons: { icon: "/mark.svg", apple: "/icons/180" },
  appleWebApp: {
    capable: true,
    title: "Splatify",
    statusBarStyle: "black-translucent",
  },
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSiteSettings();
  return (
    <html lang="en">
      <body style={eventStyle(settings.accentColor)}>{children}</body>
    </html>
  );
}

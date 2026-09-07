import type { Metadata } from "next";
import "./globals.css";
import "./day-styles.css";
import "./community-styles.css";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

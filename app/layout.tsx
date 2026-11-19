import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minutenclub · Gemeinsam unterwegs",
  description:
    "Euer gemeinsames Minutenkonto. Fahrten erfassen, Guthaben teilen und den Überblick behalten.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Minutenclub",
  },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#101816" },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de-CH">
      <body>{children}</body>
    </html>
  );
}

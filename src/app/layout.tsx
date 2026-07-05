import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Space Grotesk: títulos e números. IBM Plex Sans (latin-ext p/ acentos): UI. Mono: dados.
const display = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["500", "600", "700"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Saldo", template: "%s · Saldo" },
  description: "Saldo — CRM contábil all-in-one.",
  // Sistema interno autenticado: não deve ser indexado por buscadores.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0E1512" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

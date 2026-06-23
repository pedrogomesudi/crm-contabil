import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// latin-ext garante todos os glifos acentuados do pt-BR.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "CRM Contábil",
    template: "%s · CRM Contábil",
  },
  description: "Sistema de gestão para escritório de contabilidade.",
  // Sistema interno autenticado: não deve ser indexado por buscadores.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a", // slate-900 (combina com a marca/ícone)
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

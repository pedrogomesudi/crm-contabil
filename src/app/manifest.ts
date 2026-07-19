import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portal do cliente",
    short_name: "Portal",
    description: "Guias, boletos, notas e documentos do seu escritório contábil.",
    start_url: "/portal",
    scope: "/portal",
    display: "standalone",
    background_color: "#F7F6F2",
    theme_color: "#0FA968",
    icons: [
      { src: "/icons/portal-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/portal-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/portal-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

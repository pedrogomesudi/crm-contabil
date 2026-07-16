import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Origem do Supabase (auth/PostgREST/Storage) liberada no connect-src.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
// Host do domínio de produção: usado para travar a checagem CSRF de Server Actions
// atrás do proxy do EasyPanel (allowedOrigins). Derivado de NEXT_PUBLIC_SITE_URL.
const siteHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host;
  } catch {
    return "";
  }
})();

// CSP: self por padrão. script/style com 'unsafe-inline' (Next injeta scripts inline
// de hidratação sem nonce; Tailwind usa estilos inline). 'unsafe-eval' só em dev (HMR).
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self' ${supabaseOrigin} https://*.supabase.co`.trim(),
]
  .join("; ")
  .replace(/\s+/g, " ");

const nextConfig: NextConfig = {
  output: "standalone",
  // Upload de documentos vai até 10 MB (validado na action). O default de body de
  // Server Action é 1 MB; subimos com folga para o overhead do multipart.
  // allowedOrigins: defesa CSRF determinística atrás do reverse proxy (só quando
  // o domínio de produção está definido; em dev fica o default same-origin do Next).
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      ...(siteHost ? { allowedOrigins: [siteHost] } : {}),
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

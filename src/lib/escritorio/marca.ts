import { validarDocumento } from "@/lib/validation/documento";

export type DadosMarca = {
  nome: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: Record<string, string> | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarMarca(fd: FormData): DadosMarca | { erro: string } {
  const t = (k: string, max = 160) =>
    String(fd.get(k) ?? "")
      .trim()
      .slice(0, max);

  const cnpjDigits = t("cnpj").replace(/\D/g, "");
  if (cnpjDigits && !validarDocumento("PJ", cnpjDigits)) return { erro: "CNPJ inválido." };

  const email = t("email");
  if (email && !EMAIL.test(email)) return { erro: "E-mail inválido." };

  const endereco: Record<string, string> = {};
  for (const c of ["logradouro", "numero", "bairro", "cidade", "uf", "cep"]) {
    let v = t(c, 120);
    if (c === "uf") v = v.toUpperCase().slice(0, 2);
    if (v) endereco[c] = v;
  }

  return {
    nome: t("nome") || null,
    cnpj: cnpjDigits || null,
    email: email || null,
    telefone: t("telefone", 40) || null,
    endereco: Object.keys(endereco).length ? endereco : null,
  };
}

// Tipo da imagem pelos magic bytes — a extensão é forjável. SVG (texto) não casa: proibido (XSS).
export function tipoImagem(buf: Uint8Array): "png" | "jpg" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}

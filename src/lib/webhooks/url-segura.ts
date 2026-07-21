// Bloqueia SSRF em webhooks de saída: só https público. Rejeita loopback, IPs privados,
// link-local (incl. o 169.254.169.254 de metadados de cloud) e hostnames internos.
// Nota: cobre literais de IP e sufixos internos; um alvo que resolva por DNS para um IP
// privado ainda passaria (rebinding) — o cadastro é admin-only, então isto é defesa em
// profundidade, não a única barreira.

function ehIpv4Privado(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local (metadados)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

export function urlWebhookSegura(url: string): { ok: boolean; erro?: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, erro: "URL inválida." };
  }
  if (u.protocol !== "https:") return { ok: false, erro: "A URL deve ser https." };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // tira colchetes de IPv6
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, erro: "Host interno não permitido." };
  }
  if (host === "::1" || host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return { ok: false, erro: "Endereço IPv6 interno não permitido." };
  }
  if (ehIpv4Privado(host)) return { ok: false, erro: "Endereço IP interno/privado não permitido." };
  return { ok: true };
}

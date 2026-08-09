// Decisão pura de quais canais enviar (e quais pular por falta de contato) e como agregar o
// resultado por canal num status único do cliente. Sem I/O.
export type Canal = "whatsapp" | "email";
export type StatusCanal = "ok" | "pulado" | "erro";
export type ResultadoCanal = { canal: Canal; status: StatusCanal; motivo?: string };

export function canaisParaEnvio(
  flags: { whatsapp: boolean; email: boolean },
  contatos: { temTelefone: boolean; temEmail: boolean },
): { enviar: Canal[]; pulados: ResultadoCanal[] } {
  const enviar: Canal[] = [];
  const pulados: ResultadoCanal[] = [];
  if (flags.whatsapp) {
    if (contatos.temTelefone) enviar.push("whatsapp");
    else pulados.push({ canal: "whatsapp", status: "pulado", motivo: "Cliente sem telefone." });
  }
  if (flags.email) {
    if (contatos.temEmail) enviar.push("email");
    else pulados.push({ canal: "email", status: "pulado", motivo: "Cliente sem e-mail." });
  }
  return { enviar, pulados };
}

export function agregarResultado(resultados: ResultadoCanal[]): { status: StatusCanal; motivo?: string } {
  if (resultados.length === 0) return { status: "pulado", motivo: "Cliente sem canal com contato." };
  const erros = resultados.filter((r) => r.status === "erro");
  if (erros.length) return { status: "erro", motivo: erros.map((e) => `${e.canal}: ${e.motivo ?? "falha"}`).join(" · ") };
  if (resultados.some((r) => r.status === "ok")) return { status: "ok" };
  return { status: "pulado", motivo: resultados.map((r) => r.motivo).filter(Boolean).join(" · ") };
}

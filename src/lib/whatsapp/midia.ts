// Ícone curto do documento, derivado do mime — sem depender de coluna nova no banco.
export function iconeDeMime(mime: string | null): "PDF" | "DOC" | "XLS" | "IMG" | "AUDIO" | "ARQ" {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "PDF";
  if (m.includes("word") || m === "application/msword") return "DOC";
  if (m.includes("excel") || m.includes("spreadsheet")) return "XLS";
  if (m.startsWith("image/")) return "IMG";
  if (m.startsWith("audio/")) return "AUDIO";
  return "ARQ";
}

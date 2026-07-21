// Reprocessa o acervo: extrai o texto dos PDFs já no Storage e indexa (RF-061).
// One-shot (não é cron). Rode UMA vez:
//   node --env-file=.env.producao.bak scripts/backfill-conteudo.mjs
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (use --env-file).");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

// Mesma normalização de classificarTexto (script é standalone, fora do bundle TS).
function classificar(bruto) {
  const texto = String(bruto ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return texto ? { texto, status: "ok" } : { texto: "", status: "vazio" };
}

async function main() {
  const resumo = { ok: 0, vazio: 0, erro: 0 };
  // Pendentes que são PDF (pelo sufixo do caminho no Storage).
  const { data: pend, error } = await admin
    .from("documentos")
    .select("id, caminho_storage")
    .is("texto_status", null)
    .ilike("caminho_storage", "%.pdf");
  if (error) {
    console.error("Falha ao listar pendentes:", error.message);
    process.exit(1);
  }
  console.log(`${pend.length} PDF(s) pendente(s).`);

  for (const d of pend) {
    try {
      const dl = await admin.storage.from("documentos").download(d.caminho_storage);
      if (dl.error) throw dl.error;
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      const { texto, status } = classificar(Array.isArray(text) ? text.join(" ") : text);
      await admin
        .from("documentos")
        .update({ texto_extraido: texto || null, texto_status: status })
        .eq("id", d.id);
      resumo[status] += 1;
    } catch (e) {
      console.error(`erro em ${d.id}:`, e instanceof Error ? e.message : e);
      await admin.from("documentos").update({ texto_status: "erro" }).eq("id", d.id);
      resumo.erro += 1;
    }
  }

  // Não-PDF pendentes: sem OCR, ficam como 'vazio' (status completo).
  const { count } = await admin
    .from("documentos")
    .update({ texto_status: "vazio" }, { count: "exact" })
    .is("texto_status", null)
    .not("caminho_storage", "ilike", "%.pdf");
  console.log(`Resumo: ok=${resumo.ok} vazio=${resumo.vazio} erro=${resumo.erro}; não-PDF marcados=${count ?? 0}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

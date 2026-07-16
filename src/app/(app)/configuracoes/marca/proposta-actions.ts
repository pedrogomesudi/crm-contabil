"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { validarTemplate } from "@/lib/comercial/gerar-proposta";
import { TAGS_DISPONIVEIS } from "@/lib/comercial/proposta-template";

export type EstadoProposta = {
  erro?: string;
  ok?: boolean;
  tagsOk?: string[];
  tagsDesconhecidas?: string[];
  avisos?: string[];
};

async function exigirAdmin(): Promise<boolean> {
  const p = await getPerfilAtual();
  return Boolean(p?.ativo && p.papel === "admin");
}

export async function salvarModeloProposta(_prev: EstadoProposta, fd: FormData): Promise<EstadoProposta> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const modelo = String(fd.get("modelo") ?? "padrao");
  if (modelo !== "padrao" && modelo !== "proprio") return { erro: "Modelo inválido." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("escritorio_config").update({ proposta_modelo: modelo }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/marca");
  return { ok: true };
}

export async function enviarTemplateProposta(_prev: EstadoProposta, fd: FormData): Promise<EstadoProposta> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = fd.get("template") as File | null;
  if (!arquivo || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 5 * 1024 * 1024) return { erro: "Modelo acima de 5 MB." };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const val = validarTemplate(arquivo.name, bytes);
  if (val.erro) return { erro: val.erro };

  const admin = createAdminSupabase();
  const supabase = await createServerSupabase();
  const { data: atual } = await supabase
    .from("escritorio_config")
    .select("proposta_template_path")
    .eq("id", 1)
    .maybeSingle();

  const path = `marca/proposta-template.${val.tipo}`;
  const contentType =
    val.tipo === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/html";
  const { error: upErr } = await admin.storage.from("documentos").upload(path, bytes, { contentType, upsert: true });
  if (upErr) return { erro: "Falha ao enviar o modelo." };

  const { error } = await supabase
    .from("escritorio_config")
    .update({ proposta_template_path: path, proposta_template_tipo: val.tipo })
    .eq("id", 1);
  if (error) return { erro: "Falha ao salvar o modelo." };
  // se o tipo mudou (troca docx<->html), remove o arquivo anterior de tipo diferente
  const anterior = (atual?.proposta_template_path as string | null) ?? null;
  if (anterior && anterior !== path) await admin.storage.from("documentos").remove([anterior]);
  revalidatePath("/configuracoes/marca");
  return { ok: true, tagsOk: val.tagsOk, tagsDesconhecidas: val.tagsDesconhecidas, avisos: val.avisos };
}

export async function baixarExemploHtml(): Promise<string> {
  const linhas = TAGS_DISPONIVEIS.map((t) => `    <tr><td>${t.rotulo}</td><td>{${t.tag}}</td></tr>`).join("\n");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Modelo de exemplo — Proposta</title></head>
<body>
  <h1>Proposta para {nome_cliente}</h1>
  <p>{mes_ano} · Nº {numero_proposta}</p>
  <table border="1" cellpadding="4">
    <tr><th>Campo</th><th>Tag</th></tr>
${linhas}
  </table>
  <h2>Itens</h2>
  <ul>{#itens}<li>{descricao} — {recorrencia}: {valor}</li>{/itens}</ul>
  <p>Total mensal: {total_mensal} · Total único: {total_unico}</p>
  <hr>
  <p>{responsavel_nome} · {responsavel_email} · {responsavel_telefone}</p>
</body></html>`;
}

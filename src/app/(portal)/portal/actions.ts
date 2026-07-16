"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ehCliente } from "@/lib/portal/permissoes";
import { tipoComprovante } from "@/lib/legalizacao/processo";

// PADRÃO DE SEGURANÇA (obrigatório em todo download do portal):
// 1) lê o registro com o cliente Supabase DO USUÁRIO — a RLS prova a titularidade;
// 2) só então assina a URL com service_role.
// Nunca assinar um caminho vindo do navegador sem passar pela RLS.
async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !ehCliente(p.papel) || !p.clienteId) return null;
  return p;
}

// Rastreio (RF-053): gravado SÓ server-side — portal_acesso não tem policy de INSERT.
async function registrar(
  clienteId: string,
  usuarioId: string,
  tipo: "documento" | "nfse" | "obrigacao" | "boleto",
  refId: string,
) {
  const admin = createAdminSupabase();
  await admin.from("portal_acesso").insert({ cliente_id: clienteId, usuario_id: usuarioId, tipo, ref_id: refId });
}

async function assinar(caminho: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from("documentos").createSignedUrl(caminho, 60);
  return data?.signedUrl ?? null;
}

export async function urlDocumento(id: string): Promise<{ url?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("documentos").select("caminho_storage").eq("id", id).maybeSingle();
  if (!data?.caminho_storage) return { erro: "Documento não encontrado." };
  const url = await assinar(data.caminho_storage as string);
  if (!url) return { erro: "Falha ao gerar o link." };
  await registrar(perfil.clienteId!, perfil.id, "documento", id);
  return { url };
}

export async function urlDanfse(id: string): Promise<{ url?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("nfse").select("danfse_path").eq("id", id).maybeSingle();
  if (!data?.danfse_path) return { erro: "DANFSe não disponível." };
  const url = await assinar(data.danfse_path as string);
  if (!url) return { erro: "Falha ao gerar o link." };
  await registrar(perfil.clienteId!, perfil.id, "nfse", id);
  return { url };
}

export async function urlComprovanteObrigacao(id: string): Promise<{ url?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_instancia").select("comprovante_path").eq("id", id).maybeSingle();
  if (!data?.comprovante_path) return { erro: "Comprovante não disponível." };
  const url = await assinar(data.comprovante_path as string);
  if (!url) return { erro: "Falha ao gerar o link." };
  await registrar(perfil.clienteId!, perfil.id, "obrigacao", id);
  return { url };
}

// A 2ª via do boleto é um link externo do provedor: aqui só registramos o acesso.
export async function registrarAcessoBoleto(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("boleto").select("id").eq("id", id).maybeSingle();
  if (!data) return { erro: "Boleto não encontrado." };
  await registrar(perfil.clienteId!, perfil.id, "boleto", id);
  return { ok: true };
}

function nomeSeguro(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 100) || "arquivo"
  );
}

// ÚNICA escrita do papel cliente. O caminho é gerado AQUI (nunca vem do navegador) a
// partir do clienteId do perfil; o INSERT usa o supabase DO USUÁRIO para que a RLS seja
// a barreira efetiva. A tarefa é criada com service_role (o cliente não escreve em tarefa).
export async function enviarDocumento(formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const clienteId = perfil.clienteId!;

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 10 * 1024 * 1024) return { erro: "Arquivo acima de 10 MB." };
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoComprovante(buf); // magic bytes: pdf | png | jpg
  if (!tipo) return { erro: "Envie um PDF, PNG ou JPG." };

  const caminho = `${clienteId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  const ct = tipo === "pdf" ? "application/pdf" : tipo === "png" ? "image/png" : "image/jpeg";
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, buf, { contentType: ct });
  if (up.error) {
    console.error("enviarDocumento (upload):", up.error.message);
    return { erro: "Falha no envio do arquivo." };
  }

  // INSERT pela RLS (defesa em profundidade): a policy exige cliente_id = auth_cliente_id().
  const supabase = await createServerSupabase();
  const { data: doc, error } = await supabase
    .from("documentos")
    .insert({
      cliente_id: clienteId,
      nome: arquivo.name.slice(0, 200),
      caminho_storage: caminho,
      origem: "cliente",
      enviado_por: perfil.id,
    })
    .select("id")
    .single();
  if (error || !doc) {
    await admin.storage.from("documentos").remove([caminho]); // sem órfão
    console.error("enviarDocumento (insert):", error?.message);
    return { erro: "Falha ao registrar o documento." };
  }

  // Tarefa automática para o escritório tratar o envio (nada passa batido).
  const { data: resp } = await admin
    .from("cliente_responsavel")
    .select("usuario_id")
    .eq("cliente_id", clienteId)
    .eq("departamento", "contabil")
    .maybeSingle();
  let responsavelId = (resp?.usuario_id as string | null) ?? null;
  if (!responsavelId) {
    const { data: cli } = await admin.from("clientes").select("contador_id").eq("id", clienteId).maybeSingle();
    responsavelId = (cli?.contador_id as string | null) ?? null;
  }
  await admin.from("tarefa").insert({
    titulo: `Documento enviado pelo cliente: ${arquivo.name.slice(0, 120)}`,
    cliente_id: clienteId,
    departamento: "contabil",
    prioridade: "media",
    responsavel_id: responsavelId,
  });

  revalidatePath("/portal/documentos");
  return { ok: true };
}

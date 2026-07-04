"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { carregarConfigZapi } from "@/app/(app)/configuracoes/whatsapp/actions";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { normalizarTelefone, aplicarTemplate, TEMPLATES } from "@/lib/whatsapp/mensagem";
import { formatarMoeda, formatarData } from "@/lib/format";

export async function cobrarViaWhatsapp(tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: t } = await supabase
    .from("titulo")
    .select("id, valor, vencimento, cliente_id, clientes(razao_social, telefone)")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  const cl = Array.isArray(t.clientes) ? t.clientes[0] : t.clientes;
  const cliente = cl as { razao_social?: string; telefone?: string } | null;
  const tel = normalizarTelefone(cliente?.telefone ?? "");
  if (!tel) return { erro: "Cliente sem telefone válido." };

  const texto = aplicarTemplate(TEMPLATES.cobranca, {
    nome: cliente?.razao_social ?? "",
    valor: formatarMoeda(Number(t.valor)),
    vencimento: formatarData(t.vencimento as string),
  });

  const cfg = await carregarConfigZapi();
  let status: "ENVIADO" | "ERRO" = "ERRO";
  let resposta: unknown = null;
  let erro: string | undefined;
  if (!cfg) {
    erro = "WhatsApp não configurado.";
  } else {
    const r = await enviarTexto(cfg, tel, texto);
    status = r.ok ? "ENVIADO" : "ERRO";
    resposta = r.resposta ?? r.erro;
    if (!r.ok) erro = r.erro ?? "Falha no envio.";
  }
  // grava histórico (mesmo em erro, para diagnóstico)
  await supabase.from("whatsapp_mensagem").insert({
    cliente_id: (t.cliente_id as string | null) ?? null,
    titulo_id: tituloId,
    telefone: tel,
    texto,
    status,
    resposta: resposta as object,
    criado_por: perfil.id,
  });
  return erro ? { erro } : { ok: true };
}

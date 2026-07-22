"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { adaptadorWhatsappAtivo } from "@/lib/whatsapp/ativo";
import { normalizarTelefone, aplicarTemplate, TEMPLATES } from "@/lib/whatsapp/mensagem";
import { formatarMoeda, formatarData } from "@/lib/format";

export async function cobrarViaWhatsapp(tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: t } = await supabase
    .from("titulo")
    .select("id, valor, vencimento, cliente_id, clientes(razao_social, telefone, telefone_ddi)")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  const cl = Array.isArray(t.clientes) ? t.clientes[0] : t.clientes;
  const cliente = cl as { razao_social?: string; telefone?: string; telefone_ddi?: string } | null;
  const tel = normalizarTelefone(cliente?.telefone ?? "", cliente?.telefone_ddi ?? "55");
  if (!tel) return { erro: "Cliente sem telefone válido." };

  const texto = aplicarTemplate(TEMPLATES.cobranca, {
    nome: cliente?.razao_social ?? "",
    valor: formatarMoeda(Number(t.valor)),
    vencimento: formatarData(t.vencimento as string),
  });

  let textoFinal = texto;
  const { data: bol } = await supabase
    .from("boleto")
    .select("linha_digitavel, pix_copia_cola")
    .eq("titulo_id", tituloId)
    .not("status", "in", "(cancelado,erro)")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bol) {
    const extra: string[] = [];
    if (bol.linha_digitavel) extra.push(`Linha digitável: ${bol.linha_digitavel as string}`);
    if (bol.pix_copia_cola) extra.push(`PIX copia-e-cola:\n${bol.pix_copia_cola as string}`);
    if (extra.length) textoFinal = `${texto}\n\n${extra.join("\n\n")}`;
  }

  const ativo = await adaptadorWhatsappAtivo();
  let status: "ENVIADO" | "ERRO" = "ERRO";
  let resposta: unknown = null;
  let erro: string | undefined;
  if ("erro" in ativo) {
    erro = ativo.erro;
  } else {
    const r = await ativo.adaptador.enviarTexto(tel, textoFinal);
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

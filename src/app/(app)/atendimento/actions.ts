"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeAtender } from "@/lib/clientes/permissoes";
import { decifrar } from "@/lib/nfse/cripto";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { agruparConversas, type Conversa, type MsgConversa } from "@/lib/whatsapp/inbox";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeAtender(p.papel) ? p : null;
}

function mapMsgs(rows: unknown[]): MsgConversa[] {
  return (rows ?? []).map((row) => {
    const m = row as {
      telefone: string;
      texto: string;
      direcao: "IN" | "OUT";
      lida: boolean;
      criado_em: string;
      clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
    };
    const cl = Array.isArray(m.clientes) ? m.clientes[0] : m.clientes;
    return {
      telefone: m.telefone,
      texto: m.texto,
      direcao: m.direcao,
      lida: m.lida,
      criado_em: m.criado_em,
      cliente: (cl as { razao_social?: string } | null)?.razao_social ?? null,
    };
  });
}

export async function listarConversas(): Promise<Conversa[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("telefone, texto, direcao, lida, criado_em, clientes(razao_social)")
    .order("criado_em", { ascending: false })
    .limit(500);
  return agruparConversas(mapMsgs(data ?? []));
}

export async function abrirConversa(telefone: string): Promise<MsgConversa[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("telefone, texto, direcao, lida, criado_em, clientes(razao_social)")
    .eq("telefone", telefone)
    .order("criado_em", { ascending: true });
  // marca entradas como lidas (RLS garante que só as visíveis ao usuário são afetadas)
  await supabase.from("whatsapp_mensagem").update({ lida: true }).eq("telefone", telefone).eq("direcao", "IN").eq("lida", false);
  return mapMsgs(data ?? []);
}

export async function responder(telefone: string, texto: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const t = texto.trim();
  if (!t) return { erro: "Mensagem vazia." };
  const chave = process.env.WHATSAPP_CRIPTO_KEY;
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!chave || !cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado) return { erro: "WhatsApp não configurado." };
  const zapi = {
    instance: cfg.instance,
    token: decifrar(cfg.token_cifrado, chave).toString("utf8"),
    clientToken: decifrar(cfg.client_token_cifrado, chave).toString("utf8"),
  };
  const r = await enviarTexto(zapi, telefone, t);
  // resolve cliente para vincular a saída à mesma thread (best-effort; só se houver exatamente um)
  const { data: cli } = await admin.from("clientes").select("id, telefone");
  const casados = (cli ?? []).filter((c) => normalizarTelefone((c.telefone as string) ?? "") === telefone);
  const clienteId = casados.length === 1 ? (casados[0]!.id as string) : null;
  await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId ?? null,
    telefone,
    texto: t,
    status: r.ok ? "ENVIADO" : "ERRO",
    direcao: "OUT",
    lida: true,
    resposta: (r.resposta ?? r.erro) as object,
    criado_por: perfil.id,
  });
  return r.ok ? { ok: true } : { erro: r.erro ?? "Falha no envio." };
}

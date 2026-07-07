"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeAtender, podeVerHonorario } from "@/lib/clientes/permissoes";
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
      status?: string;
      clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
    };
    const cl = Array.isArray(m.clientes) ? m.clientes[0] : m.clientes;
    return {
      telefone: m.telefone,
      texto: m.texto,
      direcao: m.direcao,
      lida: m.lida,
      criado_em: m.criado_em,
      status: m.status ?? "",
      cliente: (cl as { razao_social?: string } | null)?.razao_social ?? null,
    };
  });
}

export async function listarConversas(): Promise<Conversa[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("telefone, texto, direcao, lida, criado_em, status, clientes(razao_social)")
    .order("criado_em", { ascending: false })
    .limit(500);
  const { data: favs } = await supabase.from("conversa").select("telefone").eq("favorita", true);
  const favoritos = new Set((favs ?? []).map((f) => f.telefone as string));
  return agruparConversas(mapMsgs(data ?? []), favoritos);
}

export async function abrirConversa(telefone: string): Promise<MsgConversa[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("telefone, texto, direcao, lida, criado_em, status, clientes(razao_social)")
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
  // Guarda o messageId do Z-API para casar os eventos de status (entregue/lido).
  const resp = (r.resposta ?? {}) as { messageId?: string; id?: string; zaapId?: string };
  const zId = r.ok ? (resp.messageId ?? resp.id ?? null) : null;
  const linha = {
    cliente_id: clienteId ?? null,
    telefone,
    texto: t,
    status: r.ok ? "ENVIADO" : "ERRO",
    direcao: "OUT" as const,
    lida: true,
    resposta: (r.resposta ?? r.erro) as object,
    criado_por: perfil.id,
    z_message_id: zId,
  };
  const { error: insErr } = await admin.from("whatsapp_mensagem").insert(linha);
  if (insErr && String(insErr.message).includes("duplicate")) {
    // colisão improvável de messageId: grava a mensagem sem o id (perde só o rastreio dela)
    await admin.from("whatsapp_mensagem").insert({ ...linha, z_message_id: null });
  }
  return r.ok ? { ok: true } : { erro: r.erro ?? "Falha no envio." };
}

export async function favoritarConversa(
  telefone: string,
  favorita: boolean,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("conversa").upsert({ telefone, favorita }, { onConflict: "telefone" });
  return error ? { erro: "Falha ao favoritar." } : { ok: true };
}

export async function marcarTodasLidas(): Promise<{ ok?: boolean }> {
  if (!(await gate())) return {};
  const supabase = await createServerSupabase();
  await supabase.from("whatsapp_mensagem").update({ lida: true }).eq("direcao", "IN").eq("lida", false);
  return { ok: true };
}

export type DadosContato = {
  telefone: string;
  clienteId: string | null;
  razaoSocial: string | null;
  regime: string | null;
  cnpjCpf: string | null;
  honorario: number | null;
  situacao: string | null;
};

export async function dadosContato(telefone: string): Promise<DadosContato> {
  const vazio: DadosContato = {
    telefone,
    clienteId: null,
    razaoSocial: null,
    regime: null,
    cnpjCpf: null,
    honorario: null,
    situacao: null,
  };
  const perfil = await gate();
  if (!perfil) return vazio;
  // Resolve o cliente casado pelo telefone (mesma lógica de responder: casa se houver exatamente um).
  const admin = createAdminSupabase();
  const { data: cli } = await admin
    .from("clientes")
    .select("id, telefone, razao_social, cpf_cnpj, regime_tributario, status");
  const casados = (cli ?? []).filter((c) => normalizarTelefone((c.telefone as string) ?? "") === telefone);
  if (casados.length !== 1) return vazio;
  const c = casados[0]!;
  let honorario: number | null = null;
  if (podeVerHonorario(perfil.papel)) {
    const { data: fin } = await admin
      .from("clientes_financeiro")
      .select("honorario_mensal")
      .eq("cliente_id", c.id)
      .maybeSingle();
    honorario = (fin?.honorario_mensal as number | null) ?? null;
  }
  return {
    telefone,
    clienteId: c.id as string,
    razaoSocial: c.razao_social as string,
    regime: c.regime_tributario as string,
    cnpjCpf: c.cpf_cnpj as string,
    honorario,
    situacao: c.status as string,
  };
}

export async function iniciarConversa(
  telefone: string,
  texto: string,
): Promise<{ ok?: boolean; erro?: string }> {
  const t = normalizarTelefone(telefone);
  if (!t) return { erro: "Telefone inválido." };
  return responder(t, texto);
}

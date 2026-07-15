"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeAtender, podeVerHonorario } from "@/lib/clientes/permissoes";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { enviarTexto, enviarMidiaZapi } from "@/lib/whatsapp/zapi";
import { chaveTelefone } from "@/lib/whatsapp/mensagem";
import {
  agruparConversas,
  extensaoPorMime,
  mapaClientesPorTelefone,
  type Conversa,
  type MsgConversa,
  type ConversaMeta,
  type StatusConversa,
} from "@/lib/whatsapp/inbox";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeAtender(p.papel) ? p : null;
}

function mapMsgs(rows: unknown[]): MsgConversa[] {
  return (rows ?? []).map((row) => {
    const m = row as {
      id: string;
      telefone: string;
      texto: string;
      direcao: "IN" | "OUT";
      lida: boolean;
      criado_em: string;
      status?: string;
      midia_tipo?: string | null;
      midia_path?: string | null;
      midia_nome?: string | null;
      midia_mime?: string | null;
      clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
    };
    const cl = Array.isArray(m.clientes) ? m.clientes[0] : m.clientes;
    return {
      id: m.id,
      telefone: m.telefone,
      texto: m.texto,
      direcao: m.direcao,
      lida: m.lida,
      criado_em: m.criado_em,
      status: m.status ?? "",
      midiaTipo: m.midia_tipo ?? null,
      midiaPath: m.midia_path ?? null,
      midiaNome: m.midia_nome ?? null,
      midiaMime: m.midia_mime ?? null,
      cliente: (cl as { razao_social?: string } | null)?.razao_social ?? null,
    };
  });
}

export async function listarConversas(): Promise<Conversa[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("id, telefone, texto, direcao, lida, criado_em, status, midia_tipo, midia_path, midia_nome, midia_mime, clientes(razao_social)")
    .order("criado_em", { ascending: false })
    .limit(500);
  const admin = createAdminSupabase();
  const { data: clientes } = await admin.from("clientes").select("razao_social, responsavel_nome, telefone");
  const mapaCli = mapaClientesPorTelefone(
    (clientes ?? []).map((c) => ({
      razao_social: c.razao_social as string,
      responsavel_nome: (c.responsavel_nome as string | null) ?? null,
      telefone: (c.telefone as string | null) ?? null,
    })),
  );
  const { data: convRows } = await admin.from("conversa").select("telefone, favorita, status, atendente_id");
  const { data: usuarios } = await admin.from("usuarios").select("id, nome");
  const nomePorId = new Map((usuarios ?? []).map((u) => [u.id as string, u.nome as string]));
  const meta = new Map<string, ConversaMeta>();
  for (const [tel, info] of mapaCli) meta.set(tel, { cliente: info.razaoSocial, contato: info.contato });
  for (const r of convRows ?? []) {
    const tel = r.telefone as string;
    const atendenteId = (r.atendente_id as string | null) ?? null;
    const anterior = meta.get(tel) ?? {};
    meta.set(tel, {
      ...anterior,
      favorita: r.favorita as boolean,
      status: ((r.status as string) ?? "aberta") as StatusConversa,
      atendenteId,
      atendenteNome: atendenteId ? (nomePorId.get(atendenteId) ?? null) : null,
    });
  }
  return agruparConversas(mapMsgs(data ?? []), meta);
}

export async function abrirConversa(telefone: string): Promise<MsgConversa[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("id, telefone, texto, direcao, lida, criado_em, status, midia_tipo, midia_path, midia_nome, midia_mime, clientes(razao_social)")
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
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado) return { erro: "WhatsApp não configurado." };
  const zapi = {
    instance: cfg.instance,
    token: (await decifrarDominio("whatsapp", cfg.token_cifrado)).toString("utf8"),
    clientToken: (await decifrarDominio("whatsapp", cfg.client_token_cifrado)).toString("utf8"),
  };
  const r = await enviarTexto(zapi, telefone, t);
  // resolve cliente para vincular a saída à mesma thread (best-effort; só se houver exatamente um)
  const { data: cli } = await admin.from("clientes").select("id, telefone");
  const casados = (cli ?? []).filter((c) => chaveTelefone((c.telefone as string) ?? "") === telefone);
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
  if (r.ok) await assumirConversa(admin, telefone, perfil.id).catch(() => {});
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
  const casados = (cli ?? []).filter((c) => chaveTelefone((c.telefone as string) ?? "") === telefone);
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
  const t = chaveTelefone(telefone);
  if (!t) return { erro: "Telefone inválido." };
  return responder(t, texto);
}

export async function listarAtendentes(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id, nome")
    .in("papel", ["admin", "financeiro", "contador"])
    .eq("ativo", true)
    .order("nome");
  return (data ?? []).map((u) => ({ id: u.id as string, nome: u.nome as string }));
}

export async function definirStatus(telefone: string, status: StatusConversa): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("conversa").upsert({ telefone, status }, { onConflict: "telefone" });
  return error ? { erro: "Falha ao mudar o status." } : { ok: true };
}

export async function atribuirAtendente(telefone: string, atendenteId: string | null): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("conversa").upsert({ telefone, atendente_id: atendenteId }, { onConflict: "telefone" });
  return error ? { erro: "Falha ao atribuir." } : { ok: true };
}

// Auto-assumir + reabrir: quem responde assume se estava sem atendente; finalizada volta a aberta.
async function assumirConversa(admin: ReturnType<typeof createAdminSupabase>, telefone: string, atendenteId: string) {
  const { data: row } = await admin.from("conversa").select("status, atendente_id").eq("telefone", telefone).maybeSingle();
  const novoAtendente = (row?.atendente_id as string | null) ?? atendenteId;
  const statusAtual = (row?.status as string | undefined) ?? "aberta";
  const novoStatus = statusAtual === "finalizada" ? "aberta" : statusAtual;
  await admin.from("conversa").upsert({ telefone, atendente_id: novoAtendente, status: novoStatus }, { onConflict: "telefone" });
}

export async function enviarMidia(formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const telefone = String(formData.get("telefone") ?? "");
  const legenda = String(formData.get("legenda") ?? "").trim();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 10 * 1024 * 1024) return { erro: "Arquivo acima de 10 MB." };
  const mime = arquivo.type || "application/octet-stream";
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return { erro: "Tipo não suportado no envio." };
  const tipo: "image" | "document" = mime.startsWith("image/") ? "image" : "document";
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado) return { erro: "WhatsApp não configurado." };
  const zapi = {
    instance: cfg.instance,
    token: (await decifrarDominio("whatsapp", cfg.token_cifrado)).toString("utf8"),
    clientToken: (await decifrarDominio("whatsapp", cfg.client_token_cifrado)).toString("utf8"),
  };

  const buf = Buffer.from(await arquivo.arrayBuffer());
  const nome = arquivo.name || "arquivo";
  const r = await enviarMidiaZapi(zapi, telefone, { tipo, base64: buf.toString("base64"), mime, nome, caption: legenda });

  // guarda cópia no storage para a thread renderizar do nosso domínio
  const path = `atendimento/out/${crypto.randomUUID()}.${extensaoPorMime(mime)}`;
  await admin.storage.from("documentos").upload(path, buf, { contentType: mime, upsert: false });

  const { data: cli } = await admin.from("clientes").select("id, telefone");
  const casados = (cli ?? []).filter((c) => chaveTelefone((c.telefone as string) ?? "") === telefone);
  const clienteId = casados.length === 1 ? (casados[0]!.id as string) : null;
  const resp = (r.resposta ?? {}) as { messageId?: string; id?: string };
  await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId,
    telefone,
    texto: legenda,
    status: r.ok ? "ENVIADO" : "ERRO",
    direcao: "OUT",
    lida: true,
    resposta: (r.resposta ?? r.erro) as object,
    criado_por: perfil.id,
    z_message_id: r.ok ? (resp.messageId ?? resp.id ?? null) : null,
    midia_tipo: tipo,
    midia_path: path,
    midia_nome: nome,
    midia_mime: mime,
  });
  if (r.ok) await assumirConversa(admin, telefone, perfil.id).catch(() => {});
  return r.ok ? { ok: true } : { erro: r.erro ?? "Falha no envio." };
}

export async function listarClientesParaConversa(): Promise<{ razaoSocial: string; contato: string | null; telefone: string }[]> {
  if (!(await gate())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin.from("clientes").select("razao_social, responsavel_nome, telefone").order("razao_social");
  const out: { razaoSocial: string; contato: string | null; telefone: string }[] = [];
  for (const c of data ?? []) {
    const tel = chaveTelefone((c.telefone as string | null) ?? "");
    if (tel) out.push({ razaoSocial: c.razao_social as string, contato: (c.responsavel_nome as string | null) ?? null, telefone: tel });
  }
  return out;
}

"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente, podeGerenciarTemplatesEmail } from "@/lib/clientes/permissoes";
import { registrarConsentimento } from "@/lib/lgpd/consentimento";
import { enviarEmail } from "@/lib/email/enviar";
import { aplicarEmail, variaveisDoCliente } from "@/lib/email/template";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { aplicarTemplate, normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { carregarConfigZapi } from "@/app/(app)/configuracoes/whatsapp/actions";
import {
  TETO_WHATSAPP,
  aplicarFiltro,
  descreverFiltro,
  elegiveis,
  type ClienteAlvo,
  type Filtro,
} from "@/lib/comunicados/segmento";

export type Canal = "email" | "whatsapp";

export type ComunicadoView = {
  id: string;
  titulo: string;
  assunto: string;
  canal: Canal;
  filtroTexto: string;
  status: string;
  criadoEm: string;
  enviados: number;
  erros: number;
};

export type PreviaView = {
  destinatarios: { id: string; nome: string; para: string }[];
  excluidos: { nome: string; motivo: string }[];
  total: number;
  bloqueio?: string;
};

export type ComunicadoInput = {
  titulo: string;
  assunto: string;
  corpo: string;
  canal: Canal;
  filtro: Filtro;
};

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarTemplatesEmail(p.papel) ? p : null;
}

// Carrega o segmento SEMPRE no servidor. A lista que o navegador viu na prévia é
// descartada no disparo: confiar nela permitiria adulterar quem recebe o comunicado.
async function carregarAlvos(filtro: Filtro): Promise<ClienteAlvo[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select(
      "id, razao_social, email, telefone, cpf_cnpj, regime_tributario, tipo_pessoa, status, endereco, contador_id, aceita_comunicados",
    )
    .is("excluido_em", null)
    .limit(2000);

  let alvos: ClienteAlvo[] = (data ?? []).map((c) => {
    const end = (c.endereco ?? {}) as Record<string, string>;
    return {
      id: c.id as string,
      razaoSocial: (c.razao_social as string) ?? "—",
      email: (c.email as string | null) ?? null,
      telefone: (c.telefone as string | null) ?? null,
      cpfCnpj: (c.cpf_cnpj as string | null) ?? null,
      regime: (c.regime_tributario as string | null) ?? null,
      tipo: c.tipo_pessoa as string,
      status: c.status as string,
      cidade: end.cidade ?? null,
      uf: end.uf ?? null,
      contadorId: (c.contador_id as string | null) ?? null,
      aceitaComunicados: c.aceita_comunicados !== false,
    };
  });

  // Responsável por departamento vive noutra tabela: interseccionar pelos ids.
  if (filtro.responsavelId) {
    let q = supabase.from("cliente_responsavel").select("cliente_id").eq("usuario_id", filtro.responsavelId);
    if (filtro.departamento) q = q.eq("departamento", filtro.departamento);
    const { data: resp } = await q;
    const ids = new Set((resp ?? []).map((r) => r.cliente_id as string));
    alvos = alvos.filter((a) => ids.has(a.id));
  }

  return aplicarFiltro(alvos, filtro);
}

export async function previa(filtro: Filtro, canal: Canal): Promise<PreviaView> {
  if (!(await gate())) return { destinatarios: [], excluidos: [], total: 0, bloqueio: "Sem permissão." };
  const alvos = await carregarAlvos(filtro);
  const { destinatarios, excluidos } = elegiveis(alvos, canal);

  const bloqueio =
    canal === "whatsapp" && destinatarios.length > TETO_WHATSAPP
      ? `São ${destinatarios.length} destinatários e o teto do WhatsApp é ${TETO_WHATSAPP}. ` +
        "Disparo em massa por WhatsApp faz a Meta banir o número do escritório — o que derrubaria o " +
        "atendimento e a régua de cobrança. Reduza o segmento ou use e-mail."
      : undefined;

  return {
    destinatarios: destinatarios.map((c) => ({
      id: c.id,
      nome: c.razaoSocial,
      para: (canal === "email" ? c.email : c.telefone) ?? "",
    })),
    excluidos: excluidos.map((e) => ({ nome: e.cliente.razaoSocial, motivo: e.motivo })),
    total: destinatarios.length,
    bloqueio,
  };
}

async function nomeEscritorio(): Promise<string> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("escritorio_config").select("nome").eq("id", 1).maybeSingle();
  return (data?.nome as string | null) ?? "";
}

// Teste vai só para o operador, com um cliente fictício. Não grava nada.
export async function enviarTesteComunicado(input: ComunicadoInput): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { erro: "Seu usuário não tem e-mail." };

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const vars = variaveisDoCliente(
    { razaoSocial: "Cliente de Exemplo Ltda", cnpj: "12345678000199", email: user.email },
    await nomeEscritorio(),
    hoje,
  );
  const msg = aplicarEmail({ assunto: input.assunto, corpo: input.corpo }, vars);
  const r = await enviarEmail({ para: user.email, assunto: `[TESTE] ${msg.assunto}`, corpo: msg.corpo });
  return r.ok ? { ok: true } : { erro: r.erro };
}

export async function dispararComunicado(
  input: ComunicadoInput,
): Promise<{ id?: string; enviados?: number; erros?: number; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const titulo = input.titulo.trim().slice(0, 160);
  const assunto = input.assunto.trim().slice(0, 200);
  const corpo = input.corpo.trim();
  if (!titulo) return { erro: "Informe o título interno." };
  if (!assunto) return { erro: "Informe o assunto." };
  if (!corpo) return { erro: "Escreva a mensagem." };

  // Recarrega o segmento no servidor — a lista do navegador não é fonte de verdade.
  const alvos = await carregarAlvos(input.filtro);
  const { destinatarios } = elegiveis(alvos, input.canal);
  if (destinatarios.length === 0) return { erro: "Nenhum destinatário elegível." };
  if (input.canal === "whatsapp" && destinatarios.length > TETO_WHATSAPP) {
    return { erro: `Acima do teto de ${TETO_WHATSAPP} destinatários no WhatsApp.` };
  }

  const zapi = input.canal === "whatsapp" ? await carregarConfigZapi() : null;
  if (input.canal === "whatsapp" && !zapi) return { erro: "WhatsApp não configurado." };

  const supabase = await createServerSupabase();
  const { data: com, error } = await supabase
    .from("comunicado")
    .insert({ titulo, assunto, corpo, canal: input.canal, filtro: input.filtro, status: "enviando" })
    .select("id")
    .single();
  if (error || !com) return { erro: "Falha ao criar o comunicado." };
  const comunicadoId = com.id as string;

  const admin = createAdminSupabase();
  const escritorio = await nomeEscritorio();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let enviados = 0;
  let erros = 0;

  for (const c of destinatarios) {
    const vars = variaveisDoCliente(
      { razaoSocial: c.razaoSocial, cnpj: c.cpfCnpj, email: c.email },
      escritorio,
      hoje,
    );

    let ok = false;
    let msgErro: string | null = null;
    let para = "";

    if (input.canal === "email") {
      const msg = aplicarEmail({ assunto, corpo }, vars);
      para = c.email as string;
      const r = await enviarEmail({ para, assunto: msg.assunto, corpo: msg.corpo });
      ok = r.ok;
      if (!r.ok) msgErro = r.erro;
    } else {
      const tel = normalizarTelefone(c.telefone ?? "");
      para = tel ?? (c.telefone as string);
      if (!tel || !zapi) {
        msgErro = "Telefone inválido.";
      } else {
        const r = await enviarTexto(zapi, tel, aplicarTemplate(corpo, vars));
        ok = r.ok;
        if (!r.ok) msgErro = r.erro ?? "Falha no envio.";
      }
    }

    // Grava SEMPRE — inclusive a falha. Um envio que não saiu não pode sumir.
    // comunicado_destinatario não tem policy de INSERT: só o servidor grava.
    await admin.from("comunicado_destinatario").insert({
      comunicado_id: comunicadoId,
      cliente_id: c.id,
      para,
      status: ok ? "ENVIADO" : "ERRO",
      erro: msgErro,
    });

    if (ok) enviados++;
    else erros++;
  }

  await admin
    .from("comunicado")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("id", comunicadoId);

  revalidatePath("/comunicados");
  return { id: comunicadoId, enviados, erros };
}

export async function listarComunicados(): Promise<ComunicadoView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("comunicado")
    .select("id, titulo, assunto, canal, filtro, status, criado_em")
    .order("criado_em", { ascending: false })
    .limit(50);
  const comunicados = data ?? [];
  if (comunicados.length === 0) return [];

  const ids = comunicados.map((c) => c.id as string);
  const { data: dests } = await supabase
    .from("comunicado_destinatario")
    .select("comunicado_id, status")
    .in("comunicado_id", ids);

  return comunicados.map((c) => {
    const meus = (dests ?? []).filter((d) => d.comunicado_id === c.id);
    return {
      id: c.id as string,
      titulo: c.titulo as string,
      assunto: c.assunto as string,
      canal: c.canal as Canal,
      filtroTexto: descreverFiltro((c.filtro ?? {}) as Filtro),
      status: c.status as string,
      criadoEm: c.criado_em as string,
      enviados: meus.filter((d) => d.status === "ENVIADO").length,
      erros: meus.filter((d) => d.status === "ERRO").length,
    };
  });
}

export type DestinatarioView = {
  id: string;
  clienteId: string | null;
  nome: string;
  para: string;
  status: string;
  erro: string | null;
};

export async function detalheComunicado(
  id: string,
): Promise<{ comunicado: ComunicadoView | null; destinatarios: DestinatarioView[] }> {
  const p = await getPerfilAtual();
  if (!p?.ativo) return { comunicado: null, destinatarios: [] };
  const supabase = await createServerSupabase();
  const { data: c } = await supabase
    .from("comunicado")
    .select("id, titulo, assunto, canal, filtro, status, criado_em")
    .eq("id", id)
    .maybeSingle();
  if (!c) return { comunicado: null, destinatarios: [] };

  const { data: dests } = await supabase
    .from("comunicado_destinatario")
    .select("id, cliente_id, para, status, erro, clientes(razao_social)")
    .eq("comunicado_id", id)
    .order("criado_em");

  const destinatarios: DestinatarioView[] = (dests ?? []).map((d) => {
    const cl = Array.isArray(d.clientes) ? d.clientes[0] : d.clientes;
    return {
      id: d.id as string,
      clienteId: (d.cliente_id as string | null) ?? null,
      nome: (cl as { razao_social?: string } | null)?.razao_social ?? "—",
      para: d.para as string,
      status: d.status as string,
      erro: (d.erro as string | null) ?? null,
    };
  });

  return {
    comunicado: {
      id: c.id as string,
      titulo: c.titulo as string,
      assunto: c.assunto as string,
      canal: c.canal as Canal,
      filtroTexto: descreverFiltro((c.filtro ?? {}) as Filtro),
      status: c.status as string,
      criadoEm: c.criado_em as string,
      enviados: destinatarios.filter((d) => d.status === "ENVIADO").length,
      erros: destinatarios.filter((d) => d.status === "ERRO").length,
    },
    destinatarios,
  };
}

// Reprocessa SÓ os que falharam. Quem já recebeu não recebe de novo (índice único).
export async function reenviarFalhas(comunicadoId: string): Promise<{ enviados?: number; erros?: number; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: com } = await supabase
    .from("comunicado")
    .select("assunto, corpo, canal")
    .eq("id", comunicadoId)
    .maybeSingle();
  if (!com) return { erro: "Comunicado não encontrado." };

  const { data: falhas } = await supabase
    .from("comunicado_destinatario")
    .select("id, cliente_id, para, clientes(razao_social, cpf_cnpj, email, telefone)")
    .eq("comunicado_id", comunicadoId)
    .eq("status", "ERRO");
  if (!falhas || falhas.length === 0) return { enviados: 0, erros: 0 };

  const canal = com.canal as Canal;
  const zapi = canal === "whatsapp" ? await carregarConfigZapi() : null;
  if (canal === "whatsapp" && !zapi) return { erro: "WhatsApp não configurado." };

  const admin = createAdminSupabase();
  const escritorio = await nomeEscritorio();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let enviados = 0;
  let erros = 0;

  for (const f of falhas) {
    const cl = Array.isArray(f.clientes) ? f.clientes[0] : f.clientes;
    const dados = cl as { razao_social?: string; cpf_cnpj?: string; email?: string; telefone?: string } | null;
    const vars = variaveisDoCliente(
      {
        razaoSocial: dados?.razao_social ?? "",
        cnpj: dados?.cpf_cnpj ?? null,
        email: dados?.email ?? null,
      },
      escritorio,
      hoje,
    );

    let ok = false;
    let msgErro: string | null = null;

    if (canal === "email") {
      const msg = aplicarEmail({ assunto: com.assunto as string, corpo: com.corpo as string }, vars);
      const r = await enviarEmail({ para: f.para as string, assunto: msg.assunto, corpo: msg.corpo });
      ok = r.ok;
      if (!r.ok) msgErro = r.erro;
    } else if (zapi) {
      const r = await enviarTexto(zapi, f.para as string, aplicarTemplate(com.corpo as string, vars));
      ok = r.ok;
      if (!r.ok) msgErro = r.erro ?? "Falha no envio.";
    }

    await admin
      .from("comunicado_destinatario")
      .update({ status: ok ? "ENVIADO" : "ERRO", erro: msgErro })
      .eq("id", f.id as string);

    if (ok) enviados++;
    else erros++;
  }

  revalidatePath(`/comunicados/${comunicadoId}`);
  return { enviados, erros };
}

// Opt-out de comunicados (LGPD) — finalidade distinta da cobrança. Quem gerencia o
// cadastro do cliente pode alterar (a RLS de update de `clientes` é a barreira efetiva).
export async function setAceitaComunicados(
  clienteId: string,
  aceita: boolean,
): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clientes").update({ aceita_comunicados: aceita }).eq("id", clienteId);
  if (error) return { erro: "Falha ao salvar." };
  // Deixa a prova histórica do consentimento (LGPD) — não só o estado atual.
  await registrarConsentimento(clienteId, "comunicados", aceita, "ficha", p.id);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

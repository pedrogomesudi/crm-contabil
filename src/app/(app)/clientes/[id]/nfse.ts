"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { required } from "@/lib/env";
import { decifrar } from "@/lib/nfse/cripto";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import { enviarDps, ehErroTransitorio } from "@/lib/nfse/envio";
import { baixarDanfsePdf } from "@/lib/nfse/danfse";
import { montarEventoCancelamento, assinarEvento, enviarCancelamento } from "@/lib/nfse/cancelamento";
import { classificarSituacao } from "@/lib/nfse/lote";
import type { ConfigFiscal, Tomador, ResultadoCliente, ClienteLote } from "@/lib/nfse/tipos";

export type EstadoNfse = { erro?: string; ok?: boolean };
export type OpcoesEmissao = { valor?: number; descricao?: string; avulsa?: boolean };

// Retorna o XML autorizado (ou a DPS, se ainda não houver) para download.
export async function baixarXmlNfse(nfseId: string): Promise<{ erro?: string; conteudo?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("nfse").select("nfse_xml, dps_xml").eq("id", nfseId).maybeSingle();
  if (!data) return { erro: "Nota não encontrada." };
  const conteudo = data.nfse_xml ?? data.dps_xml;
  if (!conteudo) return { erro: "XML indisponível." };
  return { conteudo };
}

// Baixa o DANFSe (PDF) da Sefin (ADN) usando a chave + o certificado (mTLS).
export async function baixarDanfseNfse(nfseId: string): Promise<{ erro?: string; pdfBase64?: string; chave?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: nota } = await supabase
    .from("nfse")
    .select("chave_acesso, ambiente")
    .eq("id", nfseId)
    .maybeSingle();
  if (!nota?.chave_acesso) return { erro: "Nota sem chave de acesso." };
  // A nota já foi confirmada acessível ao usuário; o certificado é admin-RLS,
  // então carregamos via service_role apenas para o mTLS.
  const admin = createAdminSupabase();
  const { data: certRow } = await admin
    .from("nfse_certificado")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id", 1)
    .maybeSingle();
  if (!certRow) return { erro: "Certificado não cadastrado." };
  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado." };
  }
  const ambiente: "homologacao" | "producao" = nota.ambiente === "producao" ? "producao" : "homologacao";
  const pdf = await baixarDanfsePdf(nota.chave_acesso, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  if (!pdf) return { erro: "DANFSe indisponível no momento.", chave: nota.chave_acesso };
  return { pdfBase64: pdf.toString("base64") };
}

// Emite a NFS-e de um cliente numa competência. Retorno estruturado, usado tanto
// pela ficha (via emitirNfse) quanto pela emissão em lote.
export async function emitirNfseCliente(
  clienteId: string,
  competencia: string,
  opcoes?: OpcoesEmissao,
): Promise<ResultadoCliente> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { status: "erro", motivo: "Sem permissão." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { status: "erro", motivo: "Competência inválida." };

  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("nfse_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.cnpj || !cfg.codigo_servico_nacional) return { status: "erro", motivo: "Config fiscal ausente." };
  const { data: certRow } = await supabase.from("nfse_certificado").select("*").eq("id", 1).maybeSingle();
  if (!certRow) return { status: "erro", motivo: "Certificado não cadastrado." };

  const { data: cliente, error: cliErr } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, email, endereco")
    .eq("id", clienteId)
    .maybeSingle();
  if (cliErr) return { status: "erro", motivo: "Falha ao carregar o cliente." };
  if (!cliente) return { status: "erro", motivo: "Cliente não encontrado." };
  const documento = String(cliente.cpf_cnpj ?? "").replace(/\D/g, "");
  if (!documento) return { status: "pulada", motivo: "Sem CNPJ/CPF." };

  const { data: fin } = await supabase
    .from("clientes_financeiro")
    .select("honorario_mensal")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const honorario = Number(fin?.honorario_mensal ?? 0);
  const avulsa = opcoes?.avulsa ?? false;
  const valor = opcoes?.valor && opcoes.valor > 0 ? opcoes.valor : honorario;
  if (!valor || valor <= 0) return { status: "pulada", motivo: "Sem valor/honorário." };

  const ambiente: "homologacao" | "producao" = cfg.ambiente === "producao" ? "producao" : "homologacao";
  if (!avulsa) {
    // Trava só na recorrente: uma avulsa (serviço extra) não bloqueia.
    const { data: existente } = await supabase
      .from("nfse")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("competencia", competencia)
      .eq("status", "autorizada")
      .eq("ambiente", ambiente)
      .eq("avulsa", false)
      .maybeSingle();
    if (existente) return { status: "pulada", motivo: "Já emitida nesta competência." };
  }

  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { status: "erro", motivo: "Falha ao abrir o certificado." };
  }
  if (cert.validade.getTime() < Date.now()) return { status: "erro", motivo: "Certificado expirado." };

  const config: ConfigFiscal = {
    cnpj: cfg.cnpj,
    inscricaoMunicipal: cfg.inscricao_municipal,
    razaoSocial: cfg.razao_social,
    codigoMunicipio: cfg.codigo_municipio,
    uf: cfg.uf,
    codigoServicoNacional: cfg.codigo_servico_nacional,
    descricaoServico: opcoes?.descricao?.trim() || cfg.descricao_servico || "Honorarios",
    aliquotaIss: Number(cfg.aliquota_iss),
    pctTribSN: Number(cfg.pct_trib_sn ?? 0),
    simplesNacional: cfg.simples_nacional,
    ambiente,
  };
  const tomador: Tomador = {
    documento,
    razaoSocial: cliente.razao_social,
    email: cliente.email ?? undefined,
    endereco: (cliente.endereco as Record<string, string> | null) ?? undefined,
  };

  // Número da DPS por sequência dedicada (monotônico, sem reuso — evita E0014).
  const { data: ndps } = await supabase.rpc("proximo_ndps");
  const numeroDps = String(ndps ?? Date.now());
  const { xml, idDps } = montarDps({ config, tomador, valor, competencia, serie: "1", numeroDps });
  const assinado = assinarDps(xml, idDps, cert);

  let resultado;
  try {
    resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
    // Retenta erros transitórios da Sefin (ex.: E0082) antes de gravar.
    for (let tent = 0; tent < 2 && !resultado.autorizada && ehErroTransitorio(resultado.mensagens); tent++) {
      await new Promise((r) => setTimeout(r, 1500));
      resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
    }
  } catch (e) {
    console.error("emitirNfseCliente:", e instanceof Error ? e.message : e);
    await supabase.from("nfse").insert({
      cliente_id: clienteId,
      valor,
      competencia,
      status: "erro",
      dps_xml: assinado,
      ambiente,
      avulsa,
      mensagens: [{ descricao: "Falha de comunicação" }],
    });
    return { status: "erro", motivo: "Falha de comunicação com a Sefin." };
  }

  await supabase.from("nfse").insert({
    cliente_id: clienteId,
    valor,
    competencia,
    status: resultado.autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado.chaveAcesso ?? null,
    numero: resultado.numero ?? null,
    dps_xml: assinado,
    nfse_xml: resultado.xmlNfse ?? null,
    mensagens: resultado.mensagens ? resultado.mensagens.map((m) => ({ descricao: m })) : null,
    ambiente,
    avulsa,
    autorizada_em: resultado.autorizada ? new Date().toISOString() : null,
  });
  return resultado.autorizada
    ? { status: "autorizada", chave: resultado.chaveAcesso, numero: resultado.numero }
    : { status: "rejeitada", motivo: resultado.mensagens?.join("; ") };
}

// Lista os clientes ativos com honorário para o preview do lote, marcando a
// situação de cada um (apta / já emitida / sem documento).
export async function listarElegiveisLote(competencia: string): Promise<ClienteLote[]> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return [];
  const supabase = await createServerSupabase();

  const { data: cfg } = await supabase.from("nfse_config").select("ambiente").eq("id", 1).maybeSingle();
  const ambiente = cfg?.ambiente === "producao" ? "producao" : "homologacao";

  // Clientes ativos com honorário (a RLS já limita ao que o usuário vê).
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, endereco, status, clientes_financeiro(honorario_mensal)")
    .eq("status", "ativo")
    .is("excluido_em", null) // clientes excluídos não entram no lote
    .order("razao_social");

  // Notas autorizadas nessa competência+ambiente (para marcar já_emitida).
  const { data: notas } = await supabase
    .from("nfse")
    .select("cliente_id")
    .eq("competencia", competencia)
    .eq("status", "autorizada")
    .eq("ambiente", ambiente)
    .eq("avulsa", false); // só a recorrente marca "já emitida"; avulsas não contam
  const jaEmitidas = new Set((notas ?? []).map((n) => n.cliente_id));

  const lista: ClienteLote[] = [];
  for (const c of clientes ?? []) {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    const honorario = Number((fin as { honorario_mensal?: number } | null)?.honorario_mensal ?? 0);
    if (!honorario || honorario <= 0) continue; // só recorrentes
    const documento = String(c.cpf_cnpj ?? "").replace(/\D/g, "");
    const end = c.endereco as Record<string, string> | null;
    lista.push({
      clienteId: c.id,
      razaoSocial: c.razao_social,
      documento,
      honorario,
      temEndereco: Boolean(end?.cep && end?.logradouro),
      situacao: classificarSituacao(documento, jaEmitidas.has(c.id)),
    });
  }
  return lista;
}

// Cancela uma NFS-e autorizada enviando o evento de cancelamento à Sefin.
export async function cancelarNfse(
  nfseId: string,
  cMotivo: "1" | "2" | "9",
  justificativa: string,
): Promise<{ erro?: string; ok?: boolean }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  if (!justificativa || justificativa.trim().length < 15)
    return { erro: "Justificativa obrigatória (mín. 15 caracteres)." };

  const supabase = await createServerSupabase();
  const { data: nota } = await supabase
    .from("nfse")
    .select("id, cliente_id, chave_acesso, numero, nfse_xml, status, ambiente")
    .eq("id", nfseId)
    .maybeSingle();
  if (!nota) return { erro: "Nota não encontrada." };
  if (nota.status !== "autorizada") return { erro: "Só notas autorizadas podem ser canceladas." };
  if (!nota.chave_acesso) return { erro: "Nota sem chave de acesso." };

  const { data: cfg } = await supabase.from("nfse_config").select("cnpj").eq("id", 1).maybeSingle();
  if (!cfg?.cnpj) return { erro: "Config fiscal ausente." };

  // nDFSe: usa o número; se vazio, extrai o nNFSe do XML da nota.
  let nDFSe = nota.numero ?? "";
  if (!nDFSe && typeof nota.nfse_xml === "string") {
    const m = /<nNFSe>(\d+)<\/nNFSe>/.exec(nota.nfse_xml);
    if (m) nDFSe = m[1]!;
  }

  const ambiente: "homologacao" | "producao" = nota.ambiente === "producao" ? "producao" : "homologacao";
  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  const { data: certRow } = await createAdminSupabase()
    .from("nfse_certificado")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id", 1)
    .maybeSingle();
  if (!certRow) return { erro: "Certificado não cadastrado." };
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado." };
  }

  const { xml, idEvento } = montarEventoCancelamento({
    chave: nota.chave_acesso,
    nDFSe,
    cnpj: cfg.cnpj,
    ambiente,
    cMotivo,
    xMotivo: justificativa.trim(),
  });
  const assinado = assinarEvento(xml, idEvento, cert);

  let r;
  try {
    r = await enviarCancelamento(assinado, nota.chave_acesso, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  } catch (e) {
    console.error("cancelarNfse:", e instanceof Error ? e.message : e);
    return { erro: "Falha ao comunicar com a Sefin." };
  }
  if (!r.aceito) return { erro: `Cancelamento rejeitado: ${r.mensagens?.join("; ")}` };

  await supabase
    .from("nfse")
    .update({
      status: "cancelada",
      cancelado_em: new Date().toISOString(),
      cancelamento: { cMotivo, xMotivo: justificativa.trim(), idEvento: r.idEvento ?? null, xml: r.xml ?? null },
    })
    .eq("id", nfseId);
  revalidatePath(`/clientes/${nota.cliente_id}`);
  return { ok: true };
}

export async function emitirNfse(clienteId: string, _prev: EstadoNfse, formData: FormData): Promise<EstadoNfse> {
  const competencia = String(formData.get("competencia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Informe a competência." };
  const valorRaw = Number(formData.get("valor") ?? 0);
  const descricao = String(formData.get("descricao") ?? "").trim();
  const r = await emitirNfseCliente(clienteId, competencia, {
    valor: valorRaw > 0 ? valorRaw : undefined,
    descricao: descricao || undefined,
    avulsa: formData.get("avulsa") === "on",
  });
  revalidatePath(`/clientes/${clienteId}`);
  if (r.status === "autorizada") return { ok: true };
  return { erro: r.motivo ?? "Não foi possível emitir." };
}

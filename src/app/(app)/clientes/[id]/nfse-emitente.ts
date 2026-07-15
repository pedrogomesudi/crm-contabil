"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeConfigurarNfse, podeVerHonorario } from "@/lib/clientes/permissoes";
import { cifrarDominio, decifrarDominio } from "@/lib/cripto/envelope";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import { enviarDps, ehErroTransitorio } from "@/lib/nfse/envio";
import { emitenteParaConfig } from "@/lib/nfse/emitente";
import { consultarCnpj } from "@/lib/receita/brasilapi";
import { municipioIbgePorCep } from "@/lib/nfse/municipio";
import type { Tomador } from "@/lib/nfse/tipos";

export type EstadoEmitente = { erro?: string; ok?: boolean };

export type DadosTomadorReceita = {
  ok?: boolean;
  erro?: string;
  razaoSocial?: string | null;
  endereco?: { logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string };
  codigoMunicipio?: string | null;
};

// Consulta o CNPJ do TOMADOR na Receita (BrasilAPI + fallback ReceitaWS) e resolve
// o código do município (IBGE) pelo CEP, para preencher o formulário de emissão.
// Read-only, gate = quem pode emitir (podeVerHonorario).
export async function consultarCnpjTomador(cnpj: string): Promise<DadosTomadorReceita> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const doc = String(cnpj ?? "").replace(/\D/g, "");
  if (doc.length !== 14) return { erro: "Informe um CNPJ com 14 dígitos." };
  const r = await consultarCnpj(doc);
  if (r.erro || !r.dados) return { erro: r.erro ?? "Sem dados na Receita." };
  const cep = r.dados.endereco.cep;
  const codigoMunicipio = cep ? await municipioIbgePorCep(cep) : null;
  return { ok: true, razaoSocial: r.dados.razaoSocial, endereco: r.dados.endereco, codigoMunicipio };
}

async function exigirAdmin(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && podeConfigurarNfse(perfil.papel));
}

// Salva os dados fiscais do cliente-emitente (upsert por cliente_id).
export async function salvarEmitente(
  clienteId: string,
  _prev: EstadoEmitente,
  formData: FormData,
): Promise<EstadoEmitente> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_emitente").upsert(
    {
      cliente_id: clienteId,
      codigo_municipio: String(formData.get("codigo_municipio") ?? "").trim(),
      item_lc116: String(formData.get("item_lc116") ?? "").trim(),
      codigo_servico_nacional: String(formData.get("codigo_servico_nacional") ?? "").replace(/\D/g, ""),
      codigo_tributacao_municipal: String(formData.get("codigo_tributacao_municipal") ?? "").trim(),
      aliquota_iss: Number(formData.get("aliquota_iss") ?? 0),
      pct_trib_sn: Number(formData.get("pct_trib_sn") ?? 0),
      simples_nacional: formData.get("simples") === "on",
      natureza_operacao: String(formData.get("natureza_operacao") ?? "").trim() || null,
      descricao_servico_padrao: String(formData.get("descricao_servico_padrao") ?? "").trim() || null,
      serie: String(formData.get("serie") ?? "1").trim() || "1",
      // Contador do próximo número da DPS. Pré-preenchido com o valor atual (a RPC
      // o incrementa a cada emissão); ajuste ao migrar de outro sistema para não
      // reusar números já emitidos (erro E0014). Mín. 1.
      proximo_ndps: Math.max(1, Math.trunc(Number(formData.get("proximo_ndps") ?? 1) || 1)),
      ambiente: String(formData.get("ambiente") ?? "homologacao"),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "cliente_id" },
  );
  if (error) return { erro: "Falha ao salvar os dados do emitente." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

// Salva o certificado A1 do cliente-emitente (cifrado; valida senha e extrai validade).
export async function salvarCertificadoCliente(
  clienteId: string,
  _prev: EstadoEmitente,
  formData: FormData,
): Promise<EstadoEmitente> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = formData.get("pfx") as File | null;
  const senha = String(formData.get("senha") ?? "");
  if (!arquivo || arquivo.size === 0 || !senha) return { erro: "Envie o .pfx e a senha." };
  const pfx = Buffer.from(await arquivo.arrayBuffer());
  let validade: Date;
  try {
    validade = carregarCertificado(pfx, senha).validade;
  } catch {
    return { erro: "Certificado ou senha inválidos." };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_certificado_cliente").upsert(
    {
      cliente_id: clienteId,
      nome_arquivo: arquivo.name,
      pfx_cifrado: await cifrarDominio("nfse", pfx),
      senha_cifrada: await cifrarDominio("nfse", Buffer.from(senha, "utf8")),
      validade: validade.toISOString(),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "cliente_id" },
  );
  if (error) return { erro: "Falha ao salvar o certificado." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export type DadosEmissaoCliente = {
  tomadorDocumento: string;
  tomadorRazaoSocial: string;
  tomadorEndereco: Record<string, string>;
  descricaoServico: string;
  valor: number;
  competencia: string;
};

// Emite uma NFS-e tendo o CLIENTE (clienteId) como emitente/prestador e um
// tomador externo digitado. Reaproveita o motor da V5-A.
export async function emitirNfseDoCliente(
  clienteId: string,
  dados: DadosEmissaoCliente,
): Promise<{ status: string; motivo?: string; chave?: string; numero?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { status: "erro", motivo: "Sem permissão." };
  const supabase = await createServerSupabase();

  const { data: emitente } = await supabase
    .from("nfse_emitente")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!emitente?.codigo_municipio || !emitente.codigo_servico_nacional)
    return { status: "erro", motivo: "Emitente sem configuração fiscal completa." };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("cpf_cnpj, inscricao_municipal, razao_social, endereco")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente?.cpf_cnpj) return { status: "erro", motivo: "Cliente sem CNPJ/CPF." };

  const documento = dados.tomadorDocumento.replace(/\D/g, "");
  if (documento.length !== 11 && documento.length !== 14)
    return { status: "erro", motivo: "Documento do tomador inválido." };
  if (!dados.tomadorEndereco?.cep || !dados.tomadorEndereco?.logradouro)
    return { status: "erro", motivo: "Endereço do tomador incompleto (CEP e logradouro)." };
  if (!dados.valor || dados.valor <= 0) return { status: "erro", motivo: "Valor inválido." };

  const { data: certRow } = await supabase
    .from("nfse_certificado_cliente")
    .select("pfx_cifrado, senha_cifrada")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!certRow) return { status: "erro", motivo: "Certificado do cliente não cadastrado." };
  let cert;
  try {
    const pfx = await decifrarDominio("nfse", certRow.pfx_cifrado);
    const senha = (await decifrarDominio("nfse", certRow.senha_cifrada)).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { status: "erro", motivo: "Falha ao abrir o certificado." };
  }
  if (cert.validade.getTime() < Date.now()) return { status: "erro", motivo: "Certificado expirado." };

  const config = emitenteParaConfig(emitente, cliente, dados.descricaoServico);
  const tomador: Tomador = {
    documento,
    razaoSocial: dados.tomadorRazaoSocial,
    endereco: dados.tomadorEndereco,
  };
  const ambiente = config.ambiente;

  const { data: ndps, error: ndpsErr } = await supabase.rpc("proximo_ndps_cliente", { p_cliente_id: clienteId });
  if (ndpsErr) return { status: "erro", motivo: "Falha na numeração da nota." };
  const numeroDps = String(ndps);
  const { xml, idDps } = montarDps({
    config,
    tomador,
    valor: dados.valor,
    competencia: dados.competencia,
    serie: emitente.serie,
    numeroDps,
  });
  const assinado = assinarDps(xml, idDps, cert);

  const baseRow = {
    cliente_id: clienteId,
    emitente: "cliente" as const,
    valor: dados.valor,
    competencia: dados.competencia,
    dcompet: dados.competencia, // o que foi enviado na DPS (dCompet)
    ambiente,
    tomador_documento: documento,
    tomador_razao_social: dados.tomadorRazaoSocial,
    tomador_endereco: dados.tomadorEndereco,
    descricao_servico: config.descricaoServico,
    dps_xml: assinado,
  };

  let resultado;
  try {
    resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
    for (let t = 0; t < 2 && !resultado.autorizada && ehErroTransitorio(resultado.mensagens); t++) {
      await new Promise((r) => setTimeout(r, 1500));
      resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
    }
  } catch (e) {
    console.error("emitirNfseDoCliente:", e instanceof Error ? e.message : e);
    await supabase.from("nfse").insert({ ...baseRow, status: "erro", mensagens: [{ descricao: "Falha de comunicação" }] });
    return { status: "erro", motivo: "Falha de comunicação com a Sefin." };
  }

  await supabase.from("nfse").insert({
    ...baseRow,
    status: resultado.autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado.chaveAcesso ?? null,
    numero: resultado.numero ?? null,
    nfse_xml: resultado.xmlNfse ?? null,
    mensagens: resultado.mensagens ? resultado.mensagens.map((m) => ({ descricao: m })) : null,
    autorizada_em: resultado.autorizada ? new Date().toISOString() : null,
  });
  return resultado.autorizada
    ? { status: "autorizada", chave: resultado.chaveAcesso, numero: resultado.numero }
    : { status: "rejeitada", motivo: resultado.mensagens?.join("; ") };
}

// Wrapper do formulário (useActionState).
export async function emitirComoEmitente(
  clienteId: string,
  _prev: EstadoEmitente,
  formData: FormData,
): Promise<EstadoEmitente> {
  const competencia = String(formData.get("competencia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Informe a competência." };
  const valor = Number(formData.get("valor") ?? 0);
  const dados: DadosEmissaoCliente = {
    tomadorDocumento: String(formData.get("tomador_documento") ?? ""),
    tomadorRazaoSocial: String(formData.get("tomador_razao_social") ?? "").trim(),
    tomadorEndereco: {
      cep: String(formData.get("tom_cep") ?? "").replace(/\D/g, ""),
      logradouro: String(formData.get("tom_logradouro") ?? "").trim(),
      numero: String(formData.get("tom_numero") ?? "").trim(),
      bairro: String(formData.get("tom_bairro") ?? "").trim(),
      cidade: String(formData.get("tom_cidade") ?? "").trim(),
      uf: String(formData.get("tom_uf") ?? "").trim().toUpperCase().slice(0, 2),
      cMun: String(formData.get("tom_cmun") ?? "").trim(),
    },
    descricaoServico: String(formData.get("descricao_servico") ?? "").trim(),
    valor,
    competencia,
  };
  const r = await emitirNfseDoCliente(clienteId, dados);
  revalidatePath(`/clientes/${clienteId}`);
  if (r.status === "autorizada") return { ok: true };
  return { erro: r.motivo ?? "Não foi possível emitir." };
}

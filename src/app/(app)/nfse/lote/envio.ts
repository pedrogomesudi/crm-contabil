"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { decifrar } from "@/lib/nfse/cripto";
import { enviarMidiaZapi } from "@/lib/whatsapp/zapi";
import { normalizarTelefone, aplicarTemplate } from "@/lib/whatsapp/mensagem";
import { linhasPagamento, competenciaBR } from "@/lib/whatsapp/notas-envio";
import { obterDanfsePdf, caminhoDanfse } from "@/lib/nfse/danfse-cache";
import { formatarMoeda } from "@/lib/format";
import { listarNotasAutorizadasPorCompetencia } from "@/app/(app)/clientes/[id]/nfse";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}

export async function listarNotasParaEnvio(competencia: string): Promise<{ nfseId: string; razaoSocial: string }[]> {
  if (!(await gate())) return [];
  const notas = await listarNotasAutorizadasPorCompetencia(competencia);
  return notas.map((n) => ({ nfseId: n.nfseId, razaoSocial: n.razaoSocial }));
}

export type ResultadoEnvioNota = { status: "ok" | "pulado" | "erro"; motivo?: string; razaoSocial: string };

export async function enviarNotaWhatsapp(nfseId: string): Promise<ResultadoEnvioNota> {
  const perfil = await gate();
  if (!perfil) return { status: "erro", motivo: "Sem permissão.", razaoSocial: "" };
  const admin = createAdminSupabase();
  const { data: nota } = await admin
    .from("nfse")
    .select("id, cliente_id, valor, competencia, chave_acesso, ambiente, emitente, clientes(razao_social, telefone, clientes_financeiro(cobranca_whatsapp))")
    .eq("id", nfseId)
    .maybeSingle();
  const cl = nota
    ? ((Array.isArray(nota.clientes) ? nota.clientes[0] : nota.clientes) as
        | { razao_social?: string; telefone?: string; clientes_financeiro?: { cobranca_whatsapp?: boolean } | { cobranca_whatsapp?: boolean }[] }
        | null)
    : null;
  const razaoSocial = cl?.razao_social ?? "";
  if (!nota) return { status: "erro", motivo: "Nota não encontrada.", razaoSocial };
  const fin = Array.isArray(cl?.clientes_financeiro) ? cl?.clientes_financeiro[0] : cl?.clientes_financeiro;
  if (fin?.cobranca_whatsapp === false) return { status: "pulado", motivo: "Sem cobrança WhatsApp.", razaoSocial };
  const tel = normalizarTelefone(cl?.telefone ?? "");
  if (!tel) return { status: "pulado", motivo: "Cliente sem telefone.", razaoSocial };

  const { data: ja } = await admin
    .from("whatsapp_mensagem")
    .select("id")
    .eq("nfse_id", nfseId)
    .eq("status", "ENVIADO")
    .limit(1)
    .maybeSingle();
  if (ja) return { status: "pulado", motivo: "Já enviada.", razaoSocial };

  const chave = process.env.WHATSAPP_CRIPTO_KEY;
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!chave || !cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado)
    return { status: "erro", motivo: "WhatsApp não configurado.", razaoSocial };
  const zapi = {
    instance: cfg.instance,
    token: decifrar(cfg.token_cifrado, chave).toString("utf8"),
    clientToken: decifrar(cfg.client_token_cifrado, chave).toString("utf8"),
  };

  const { data: dados } = await admin
    .from("dados_bancarios")
    .select("pix_chave, banco, agencia, conta, titular, documento, mensagem_template")
    .eq("id", 1)
    .maybeSingle();
  const template =
    dados?.mensagem_template ??
    "Olá {nome}! Segue a sua NFS-e — honorário de {valor}, competência {competencia}.\n\n{pagamento}";

  const pdfR = await obterDanfsePdf(admin, {
    chave_acesso: nota.chave_acesso as string,
    ambiente: nota.ambiente as string | null,
    emitente: nota.emitente as string,
    cliente_id: nota.cliente_id as string,
  });
  if (!pdfR.pdfBase64) return { status: "erro", motivo: pdfR.erro ?? "DANFSe indisponível.", razaoSocial };

  const pagamento = linhasPagamento({
    pixChave: dados?.pix_chave,
    banco: dados?.banco,
    agencia: dados?.agencia,
    conta: dados?.conta,
    titular: dados?.titular,
    documento: dados?.documento,
  });
  const texto = aplicarTemplate(template, {
    nome: razaoSocial,
    valor: formatarMoeda(Number(nota.valor)),
    competencia: competenciaBR(String(nota.competencia)),
    pagamento,
    pix: dados?.pix_chave ?? "",
    banco: dados?.banco ?? "",
    agencia: dados?.agencia ?? "",
    conta: dados?.conta ?? "",
    titular: dados?.titular ?? "",
    documento: dados?.documento ?? "",
  });

  const nomeArq = `NFS-e ${razaoSocial}.pdf`;
  const r = await enviarMidiaZapi(zapi, tel, { tipo: "document", base64: pdfR.pdfBase64, mime: "application/pdf", nome: nomeArq, caption: texto });
  const resp = (r.resposta ?? {}) as { messageId?: string; id?: string };
  await admin.from("whatsapp_mensagem").insert({
    cliente_id: nota.cliente_id,
    telefone: tel,
    texto,
    status: r.ok ? "ENVIADO" : "ERRO",
    direcao: "OUT",
    lida: true,
    resposta: (r.resposta ?? r.erro) as object,
    criado_por: perfil.id,
    z_message_id: r.ok ? (resp.messageId ?? resp.id ?? null) : null,
    nfse_id: nfseId,
    midia_tipo: "document",
    midia_path: caminhoDanfse(pdfR.chave as string),
    midia_nome: nomeArq,
    midia_mime: "application/pdf",
  });
  return r.ok ? { status: "ok", razaoSocial } : { status: "erro", motivo: r.erro ?? "Falha no envio.", razaoSocial };
}

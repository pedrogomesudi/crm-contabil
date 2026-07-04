import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrar } from "@/lib/nfse/cripto";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { aplicarTemplate, normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { formatarMoeda, formatarData } from "@/lib/format";
import { diffDias, etapaDoDia, type EtapaAtiva } from "@/lib/whatsapp/regua";

export type ResumoRegua = { ativa: boolean; processados: number; enviados: number; pulados: number; erros: number; motivo?: string };

export async function processarRegua(hoje: string, opts?: { forcarManual?: boolean }): Promise<ResumoRegua> {
  const admin = createAdminSupabase();
  const chave = process.env.WHATSAPP_CRIPTO_KEY;
  const base: ResumoRegua = { ativa: false, processados: 0, enviados: 0, pulados: 0, erros: 0 };

  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado, regua_ativa")
    .eq("id", 1)
    .maybeSingle();
  const ativa = Boolean(cfg?.regua_ativa);
  if (!opts?.forcarManual && !ativa) return { ...base, ativa, motivo: "Régua desligada." };
  if (!chave || !cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado) {
    return { ...base, ativa, motivo: "WhatsApp não configurado." };
  }
  const zapi = {
    instance: cfg.instance,
    token: decifrar(cfg.token_cifrado, chave).toString("utf8"),
    clientToken: decifrar(cfg.client_token_cifrado, chave).toString("utf8"),
  };

  const { data: etapasRaw } = await admin.from("regua_etapa").select("id, dias_offset, template").eq("ativa", true);
  const etapas = (etapasRaw ?? []) as EtapaAtiva[];
  if (etapas.length === 0) return { ...base, ativa, motivo: "Sem etapas ativas." };

  const { data: titulos } = await admin
    .from("titulo")
    .select(
      "id, valor, vencimento, cliente_id, clientes(razao_social, telefone, clientes_financeiro(cobranca_whatsapp)), baixa(valor_recebido, estornada)",
    )
    .eq("tipo", "RECEBER")
    .in("status", ["ABERTO", "BAIXADO_PARCIAL"]);

  const resumo: ResumoRegua = { ...base, ativa };
  for (const t of titulos ?? []) {
    resumo.processados++;
    const baixas = (t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[];
    const saldo = Number(t.valor) - baixas.filter((b) => !b.estornada).reduce((s, b) => s + Number(b.valor_recebido), 0);
    if (saldo <= 0) { resumo.pulados++; continue; }
    const cl = (Array.isArray(t.clientes) ? t.clientes[0] : t.clientes) as
      | { razao_social?: string; telefone?: string; clientes_financeiro?: { cobranca_whatsapp?: boolean } | { cobranca_whatsapp?: boolean }[] }
      | null;
    const fin = Array.isArray(cl?.clientes_financeiro) ? cl?.clientes_financeiro[0] : cl?.clientes_financeiro;
    if (fin?.cobranca_whatsapp === false) { resumo.pulados++; continue; }
    const tel = normalizarTelefone(cl?.telefone ?? "");
    if (!tel) { resumo.pulados++; continue; }
    const etapa = etapaDoDia(etapas, hoje, t.vencimento as string);
    if (!etapa) { resumo.pulados++; continue; }

    // já enviada?
    const { data: jaEnviada } = await admin
      .from("whatsapp_mensagem")
      .select("id")
      .eq("titulo_id", t.id as string)
      .eq("etapa_id", etapa.id)
      .maybeSingle();
    if (jaEnviada) { resumo.pulados++; continue; }

    const texto = aplicarTemplate(etapa.template, {
      nome: cl?.razao_social ?? "",
      valor: formatarMoeda(Number(t.valor)),
      vencimento: formatarData(t.vencimento as string),
      dias: String(Math.abs(diffDias(hoje, t.vencimento as string))),
    });
    const r = await enviarTexto(zapi, tel, texto);
    const status = r.ok ? "ENVIADO" : "ERRO";
    const { error: errIns } = await admin.from("whatsapp_mensagem").insert({
      cliente_id: (t.cliente_id as string | null) ?? null,
      titulo_id: t.id as string,
      etapa_id: etapa.id,
      telefone: tel,
      texto,
      status,
      resposta: (r.resposta ?? r.erro) as object,
    });
    // corrida: a inserção pode falhar no unique — nesse caso conta como pulado
    if (errIns) { resumo.pulados++; continue; }
    if (r.ok) resumo.enviados++;
    else resumo.erros++;
  }
  return resumo;
}

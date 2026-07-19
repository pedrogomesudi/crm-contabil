import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { enviarEmail } from "@/lib/email/enviar";
import { enviarTexto, type ZapiConfig } from "@/lib/whatsapp/zapi";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { totaisProposta } from "@/lib/comercial/proposta";
import { formatarMoeda, formatarData } from "@/lib/format";
import { etapasDevidas, aplicarVariaveis, type EtapaFollowup } from "@/lib/comercial/followup";

export type Resumo = {
  ativo: boolean;
  processados: number;
  enviados: number;
  semDestino: number;
  falhas: number;
  motivo?: string;
};

export async function processarFollowup(hoje: string): Promise<Resumo> {
  const base: Resumo = { ativo: false, processados: 0, enviados: 0, semDestino: 0, falhas: 0 };
  const admin = createAdminSupabase();

  const { data: cfg } = await admin.from("followup_config").select("canal, ativo").eq("id", true).maybeSingle();
  const ativo = Boolean(cfg?.ativo);
  if (!ativo) return { ...base, ativo, motivo: "Follow-up desligado." };
  const canal = (cfg?.canal as string) ?? "email";

  // Canal WhatsApp exige a Z-API configurada.
  let zapi: ZapiConfig | null = null;
  if (canal === "whatsapp") {
    const { data: w } = await admin
      .from("whatsapp_config")
      .select("instance, token_cifrado, client_token_cifrado")
      .eq("id", 1)
      .maybeSingle();
    if (w?.instance && w.token_cifrado && w.client_token_cifrado) {
      zapi = {
        instance: w.instance as string,
        token: (await decifrarDominio("whatsapp", w.token_cifrado as string)).toString("utf8"),
        clientToken: (await decifrarDominio("whatsapp", w.client_token_cifrado as string)).toString("utf8"),
      };
    }
    if (!zapi) return { ...base, ativo, motivo: "WhatsApp não configurado." };
  }

  const { data: etapasRaw } = await admin
    .from("followup_etapa")
    .select("id, dias_offset, assunto, template, ativa")
    .eq("ativa", true);
  const etapas: (EtapaFollowup & { assunto: string | null; template: string })[] = (etapasRaw ?? []).map((e) => ({
    id: e.id as string,
    diasOffset: e.dias_offset as number,
    ativa: e.ativa as boolean,
    assunto: (e.assunto as string | null) ?? null,
    template: e.template as string,
  }));
  if (etapas.length === 0) return { ...base, ativo, motivo: "Sem etapas ativas." };

  // Propostas em aberto (enviadas, com data de envio) + contato da oportunidade.
  const { data: props } = await admin
    .from("proposta")
    .select(
      "id, numero, validade, enviada_em, oportunidade_id, oportunidade(prospect_nome, contato_email, contato_telefone)",
    )
    .eq("status", "enviada")
    .not("enviada_em", "is", null);
  const propostas = props ?? [];

  const resumo: Resumo = { ...base, ativo };
  for (const p of propostas) {
    resumo.processados++;
    // O embed do Supabase pode vir como objeto (to-one) ou array — normaliza.
    const opRaw = (p as { oportunidade?: unknown }).oportunidade;
    const op = (Array.isArray(opRaw) ? (opRaw[0] ?? {}) : (opRaw ?? {})) as {
      prospect_nome?: string;
      contato_email?: string;
      contato_telefone?: string;
    };

    const { data: jaRaw } = await admin.from("followup_envio").select("etapa_id").eq("proposta_id", p.id as string);
    const jaEnviadas = (jaRaw ?? []).map((r) => r.etapa_id as string);
    const devidas = etapasDevidas(p.enviada_em as string, etapas, jaEnviadas, hoje);
    if (devidas.length === 0) continue;

    // Valor da proposta (mensal) para a variável {valor}.
    const { data: itens } = await admin
      .from("proposta_item")
      .select("valor, recorrencia")
      .eq("proposta_id", p.id as string);
    const totalMensal = totaisProposta(
      (itens ?? []).map((i) => ({ valor: Number(i.valor), recorrencia: i.recorrencia as "mensal" | "unico" })),
    ).mensal;
    const vars: Record<string, string> = {
      prospect: op.prospect_nome ?? "",
      numero: String(p.numero ?? ""),
      valor: formatarMoeda(totalMensal),
      validade: p.validade ? formatarData(p.validade as string) : "",
    };

    for (const etapa of devidas) {
      const conf = etapas.find((e) => e.id === etapa.id)!;
      const corpo = aplicarVariaveis(conf.template, vars);
      const destino = canal === "email" ? (op.contato_email ?? "") : (op.contato_telefone ?? "");
      if (!destino.trim()) {
        await admin.from("followup_envio").insert({ proposta_id: p.id, etapa_id: etapa.id, status: "sem_destino" });
        resumo.semDestino++;
        continue;
      }
      let ok = false;
      if (canal === "email") {
        const r = await enviarEmail({ para: destino, assunto: aplicarVariaveis(conf.assunto ?? "", vars), corpo });
        ok = r.ok;
      } else {
        const tel = normalizarTelefone(destino);
        if (!tel) {
          await admin.from("followup_envio").insert({ proposta_id: p.id, etapa_id: etapa.id, status: "sem_destino" });
          resumo.semDestino++;
          continue;
        }
        const r = await enviarTexto(zapi!, tel, corpo);
        ok = r.ok;
      }
      await admin.from("followup_envio").insert({
        proposta_id: p.id,
        etapa_id: etapa.id,
        destino,
        status: ok ? "enviado" : "falhou",
      });
      if (ok) resumo.enviados++;
      else resumo.falhas++;
    }
  }
  return resumo;
}

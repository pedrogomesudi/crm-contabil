import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrar } from "@/lib/nfse/cripto";
import { enviarTexto, type ZapiConfig } from "@/lib/whatsapp/zapi";
import { aplicarTemplate, normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { formatarMoeda, formatarData } from "@/lib/format";
import { diffDias, etapaDoDia, type EtapaAtiva } from "@/lib/whatsapp/regua";
import { enviarEmail } from "@/lib/email/enviar";
import { conteudoEmail, decidirCanal, podeEmail, type EstadoCanal } from "@/lib/email/regua";
import { emailValido } from "@/lib/email/validacao";

export type ResumoRegua = {
  ativa: boolean;
  processados: number;
  enviados: number;
  enviadosWhatsapp: number;
  enviadosEmail: number;
  pulados: number;
  erros: number;
  motivo?: string;
};

type EtapaRegua = EtapaAtiva & { email_assunto: string | null; email_corpo: string | null };

type Admin = ReturnType<typeof createAdminSupabase>;

// Dedupe ENTRE CANAIS: o índice único de cada tabela sozinho não impede que uma
// reexecução do cron cobre de novo pelo outro canal.
async function jaEnviado(admin: Admin, tituloId: string, etapaId: string): Promise<boolean> {
  const [wa, em] = await Promise.all([
    admin.from("whatsapp_mensagem").select("id").eq("titulo_id", tituloId).eq("etapa_id", etapaId).maybeSingle(),
    admin.from("email_mensagem").select("id").eq("titulo_id", tituloId).eq("etapa_id", etapaId).maybeSingle(),
  ]);
  return Boolean(wa.data || em.data);
}

export async function processarRegua(hoje: string, opts?: { forcarManual?: boolean }): Promise<ResumoRegua> {
  const admin = createAdminSupabase();
  const base: ResumoRegua = {
    ativa: false,
    processados: 0,
    enviados: 0,
    enviadosWhatsapp: 0,
    enviadosEmail: 0,
    pulados: 0,
    erros: 0,
  };

  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado, regua_ativa")
    .eq("id", 1)
    .maybeSingle();
  const ativa = Boolean(cfg?.regua_ativa);
  if (!opts?.forcarManual && !ativa) return { ...base, ativa, motivo: "Régua desligada." };

  // O WhatsApp deixa de ser obrigatório: sem ele, a régua segue só por e-mail.
  // Abortar aqui paralisaria a cobrança justamente no cenário que o fallback existe para cobrir
  // (banimento do número pela Meta).
  const chave = process.env.WHATSAPP_CRIPTO_KEY;
  let zapi: ZapiConfig | null = null;
  if (chave && cfg?.instance && cfg.token_cifrado && cfg.client_token_cifrado) {
    zapi = {
      instance: cfg.instance as string,
      token: decifrar(cfg.token_cifrado as string, chave).toString("utf8"),
      clientToken: decifrar(cfg.client_token_cifrado as string, chave).toString("utf8"),
    };
  }

  const { data: cfgEmail } = await admin
    .from("email_config")
    .select("provedor, regua_email_fallback")
    .eq("id", 1)
    .maybeSingle();
  const emailConfigurado = Boolean(cfgEmail?.provedor);
  const emailFallbackLigado = cfgEmail?.regua_email_fallback !== false;

  if (!zapi && !(emailConfigurado && emailFallbackLigado)) {
    return { ...base, ativa, motivo: "Nenhum canal configurado." };
  }

  const { data: etapasRaw } = await admin
    .from("regua_etapa")
    .select("id, dias_offset, template, email_assunto, email_corpo")
    .eq("ativa", true);
  const etapas = (etapasRaw ?? []) as EtapaRegua[];
  if (etapas.length === 0) return { ...base, ativa, motivo: "Sem etapas ativas." };

  const { data: titulos } = await admin
    .from("titulo")
    .select(
      "id, valor, vencimento, cliente_id, clientes(razao_social, telefone, email, clientes_financeiro(cobranca_whatsapp, cobranca_email)), baixa(valor_recebido, estornada)",
    )
    .eq("tipo", "RECEBER")
    .in("status", ["ABERTO", "BAIXADO_PARCIAL"]);

  const resumo: ResumoRegua = { ...base, ativa };

  for (const t of titulos ?? []) {
    resumo.processados++;
    const baixas = (t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[];
    const saldo =
      Number(t.valor) - baixas.filter((b) => !b.estornada).reduce((s, b) => s + Number(b.valor_recebido), 0);
    if (saldo <= 0) {
      resumo.pulados++;
      continue;
    }

    const cl = (Array.isArray(t.clientes) ? t.clientes[0] : t.clientes) as {
      razao_social?: string;
      telefone?: string;
      email?: string;
      clientes_financeiro?:
        | { cobranca_whatsapp?: boolean; cobranca_email?: boolean }
        | { cobranca_whatsapp?: boolean; cobranca_email?: boolean }[];
    } | null;
    const fin = Array.isArray(cl?.clientes_financeiro) ? cl?.clientes_financeiro[0] : cl?.clientes_financeiro;

    const etapa = etapaDoDia(etapas, hoje, t.vencimento as string) as EtapaRegua | null;
    if (!etapa) {
      resumo.pulados++;
      continue;
    }
    if (await jaEnviado(admin, t.id as string, etapa.id)) {
      resumo.pulados++;
      continue;
    }

    const emailCliente = (cl?.email ?? "").trim();
    const estado: EstadoCanal = {
      whatsappConfigurado: Boolean(zapi),
      telefone: normalizarTelefone(cl?.telefone ?? ""),
      optOutWhatsapp: fin?.cobranca_whatsapp === false,
      emailFallbackLigado,
      emailConfigurado,
      email: emailValido(emailCliente) ? emailCliente : null,
      optOutEmail: fin?.cobranca_email === false,
    };

    const vars = {
      nome: cl?.razao_social ?? "",
      valor: formatarMoeda(Number(t.valor)),
      vencimento: formatarData(t.vencimento as string),
      dias: String(Math.abs(diffDias(hoje, t.vencimento as string))),
    };

    const { canal } = decidirCanal(estado);
    if (canal === "nenhum") {
      resumo.pulados++;
      continue;
    }

    // 1) WhatsApp, quando disponível.
    if (canal === "whatsapp" && zapi && estado.telefone) {
      const texto = aplicarTemplate(etapa.template, vars);
      const r = await enviarTexto(zapi, estado.telefone, texto);
      const { error: errIns } = await admin.from("whatsapp_mensagem").insert({
        cliente_id: (t.cliente_id as string | null) ?? null,
        titulo_id: t.id as string,
        etapa_id: etapa.id,
        telefone: estado.telefone,
        texto,
        status: r.ok ? "ENVIADO" : "ERRO",
        resposta: (r.resposta ?? r.erro) as object,
      });
      // Corrida com outra execução do cron: o índice único barra — conta como pulado.
      if (errIns) {
        resumo.pulados++;
        continue;
      }
      if (r.ok) {
        resumo.enviados++;
        resumo.enviadosWhatsapp++;
        continue;
      }
      // O Z-API recusou: cai para o e-mail, se houver. Senão, é erro mesmo.
      if (!podeEmail(estado)) {
        resumo.erros++;
        continue;
      }
    }

    // 2) E-mail — como canal principal (WhatsApp indisponível) ou como fallback do erro acima.
    if (!estado.email) {
      resumo.pulados++;
      continue;
    }
    const { assunto, corpo } = conteudoEmail(etapa, vars);
    const r = await enviarEmail({ para: estado.email, assunto, corpo });
    const { error: errIns } = await admin.from("email_mensagem").insert({
      cliente_id: (t.cliente_id as string | null) ?? null,
      titulo_id: t.id as string,
      etapa_id: etapa.id,
      para: estado.email,
      assunto,
      corpo,
      status: r.ok ? "ENVIADO" : "ERRO",
      erro: r.ok ? null : r.erro,
    });
    if (errIns) {
      resumo.pulados++;
      continue;
    }
    if (r.ok) {
      resumo.enviados++;
      resumo.enviadosEmail++;
    } else {
      resumo.erros++;
    }
  }

  return resumo;
}

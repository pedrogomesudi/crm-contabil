import { createAdminSupabase } from "@/lib/supabase/admin";
import { criarEnviadorProativo } from "@/lib/whatsapp/proativo";
import { aplicarTemplate } from "@/lib/whatsapp/mensagem";
import { formatarMoeda, formatarData } from "@/lib/format";
import { diffDias, etapaDoDia, type EtapaAtiva } from "@/lib/whatsapp/regua";
import { enviarEmail } from "@/lib/email/enviar";
import { conteudoEmail, destinosDaRegua, podeEmail, type EstadoCanal } from "@/lib/email/regua";
import { emailsDeEnvio, telefonesDeEnvio, type ContatosEnvio } from "@/lib/clientes/contatos-envio";
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
// Por DESTINATÁRIO, não por título+etapa: com dois contatos marcados, a etapa gera uma
// mensagem para cada um, e barrar por título+etapa deixaria o segundo sem receber. O índice
// único da 0141 é a garantia de verdade; este SELECT só evita a chamada à API à toa.
async function jaEnviadoPara(admin: Admin, tituloId: string, etapaId: string, destino: string): Promise<boolean> {
  const [wa, em] = await Promise.all([
    admin
      .from("whatsapp_mensagem")
      .select("id")
      .eq("titulo_id", tituloId)
      .eq("etapa_id", etapaId)
      .eq("telefone", destino)
      .maybeSingle(),
    admin
      .from("email_mensagem")
      .select("id")
      .eq("titulo_id", tituloId)
      .eq("etapa_id", etapaId)
      .eq("para", destino)
      .maybeSingle(),
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

  const { data: cfg } = await admin.from("whatsapp_config").select("regua_ativa").eq("id", 1).maybeSingle();
  const ativa = Boolean(cfg?.regua_ativa);
  if (!opts?.forcarManual && !ativa) return { ...base, ativa, motivo: "Régua desligada." };

  // O WhatsApp deixa de ser obrigatório: sem ele, a régua segue só por e-mail.
  // Abortar aqui paralisaria a cobrança justamente no cenário que o fallback existe para cobrir
  // (banimento do número pela Meta).
  // O enviador resolve provedor + templates UMA vez: reler config e decifrar segredos por
  // mensagem custaria N leituras e N decifragens por execução do cron.
  const resolvido = await criarEnviadorProativo();
  const envioWa = "erro" in resolvido ? null : resolvido;

  const { data: cfgEmail } = await admin
    .from("email_config")
    .select("provedor, regua_email_fallback")
    .eq("id", 1)
    .maybeSingle();
  const emailConfigurado = Boolean(cfgEmail?.provedor);
  const emailFallbackLigado = cfgEmail?.regua_email_fallback !== false;

  if (!envioWa && !(emailConfigurado && emailFallbackLigado)) {
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
      "id, valor, vencimento, cliente_id, clientes(razao_social, telefone, telefone_ddi, telefone_2, telefone_ddi_2, whatsapp_envio, whatsapp_2_envio, email, email_2, email_envio, email_2_envio, clientes_financeiro(cobranca_whatsapp, cobranca_email)), baixa(valor_recebido, estornada)",
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
      telefone_ddi?: string;
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
    // Contatos marcados para envio (principal e/ou 2º). O default preserva o comportamento de
    // quem nunca configurou o 2º: principal ligado, secundário desligado.
    const contatos = (cl ?? {}) as ContatosEnvio;
    const estado: EstadoCanal = {
      whatsappConfigurado: Boolean(envioWa),
      telefones: telefonesDeEnvio(contatos),
      optOutWhatsapp: fin?.cobranca_whatsapp === false,
      emailFallbackLigado,
      emailConfigurado,
      emails: emailsDeEnvio(contatos).filter(emailValido),
      optOutEmail: fin?.cobranca_email === false,
    };

    const vars = {
      nome: cl?.razao_social ?? "",
      valor: formatarMoeda(Number(t.valor)),
      vencimento: formatarData(t.vencimento as string),
      dias: String(Math.abs(diffDias(hoje, t.vencimento as string))),
    };

    const { canal, destinos } = destinosDaRegua(estado);
    if (canal === "nenhum" || destinos.length === 0) {
      resumo.pulados++;
      continue;
    }

    // 1) WhatsApp, quando disponível — para CADA telefone marcado.
    if (canal === "whatsapp" && envioWa) {
      const texto = aplicarTemplate(etapa.template, vars);
      let algumEnviado = false;
      for (const telefone of destinos) {
        if (await jaEnviadoPara(admin, t.id as string, etapa.id, telefone)) {
          resumo.pulados++;
          algumEnviado = true; // já saiu antes: não é motivo para cair no e-mail
          continue;
        }
        // Entrega as DUAS formas: o texto livre (o que a Z-API envia, inalterado) e os
        // parâmetros na ORDEM de PARAMS_FLUXO.regua — cliente, valor, vencimento.
        const r = await envioWa.enviar(telefone, {
          fluxo: "regua",
          texto,
          params: [vars.nome, vars.valor, vars.vencimento],
        });
        const { error: errIns } = await admin.from("whatsapp_mensagem").insert({
          cliente_id: (t.cliente_id as string | null) ?? null,
          titulo_id: t.id as string,
          etapa_id: etapa.id,
          telefone,
          texto,
          status: r.ok ? "ENVIADO" : "ERRO",
          resposta: (r.resposta ?? r.erro) as object,
        });
        // Corrida com outra execução do cron: o índice único barra — conta como pulado.
        if (errIns) {
          resumo.pulados++;
          algumEnviado = true;
          continue;
        }
        if (r.ok) {
          resumo.enviados++;
          resumo.enviadosWhatsapp++;
          algumEnviado = true;
        }
      }
      // Só cai para o e-mail se o WhatsApp não alcançou NINGUÉM. Por destinatário, um número
      // inválido faria o cliente receber a mesma cobrança pelos dois canais.
      if (algumEnviado) continue;
      if (!podeEmail(estado)) {
        resumo.erros++;
        continue;
      }
    }

    // 2) E-mail — canal principal (WhatsApp indisponível) ou fallback do erro acima. Quando é
    // fallback, `destinos` traz telefones; os e-mails saem de estado.emails.
    const paraEmails = canal === "email" ? destinos : estado.emails;
    if (paraEmails.length === 0) {
      resumo.pulados++;
      continue;
    }
    const { assunto, corpo } = conteudoEmail(etapa, vars);
    for (const para of paraEmails) {
      if (await jaEnviadoPara(admin, t.id as string, etapa.id, para)) {
        resumo.pulados++;
        continue;
      }
      const r = await enviarEmail({ para, assunto, corpo });
      const { error: errIns } = await admin.from("email_mensagem").insert({
        cliente_id: (t.cliente_id as string | null) ?? null,
        titulo_id: t.id as string,
        etapa_id: etapa.id,
        para,
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
  }

  return resumo;
}

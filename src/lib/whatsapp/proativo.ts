import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorWhatsappAtivo } from "./ativo";
import { POLITICA, decidirEnvio, dentroDaJanela, type FluxoProativo } from "./politica-proativo";
import type { ResultadoEnvio } from "./tipos";

export type MensagemProativa = { fluxo: FluxoProativo; texto: string; params: string[] };
export type Enviador = { enviar(telefone: string, msg: MensagemProativa): Promise<ResultadoEnvio> };

// Camada de política do envio PROATIVO. Os fluxos entregam as DUAS formas da mensagem — o texto
// livre já renderizado e os parâmetros posicionais — e não decidem nada. Assim a paridade entre
// provedores mora aqui, e não espalhada em seis `if (provedor === ...)`.
//
// Resolve provedor e templates UMA vez: a régua envia em lote, e reler config + decifrar
// segredos por mensagem custaria N leituras e N decifragens por execução do cron.
export async function criarEnviadorProativo(): Promise<Enviador | { erro: string }> {
  const ativo = await adaptadorWhatsappAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const { adaptador } = ativo;
  const admin = createAdminSupabase();

  // Só a oficial precisa dos templates; na Z-API isto nem é lido.
  const porFluxo = new Map<string, { nome: string; idioma: string }>();
  if (adaptador.exigeTemplateForaDaJanela) {
    const { data } = await admin.from("whatsapp_template_fluxo").select("fluxo, nome, idioma");
    for (const r of (data ?? []) as { fluxo: string; nome: string; idioma: string }[]) {
      porFluxo.set(r.fluxo, { nome: r.nome, idioma: r.idioma });
    }
  }

  return {
    async enviar(telefone, msg) {
      const politica = POLITICA[msg.fluxo];

      // A janela só é consultada quando a política do fluxo depende dela — os fluxos em lote
      // são 'sempre_template' e não pagam esta consulta.
      let naJanela = false;
      if (adaptador.exigeTemplateForaDaJanela && politica === "janela") {
        const { data } = await admin
          .from("whatsapp_mensagem")
          .select("criado_em")
          .eq("telefone", telefone)
          .eq("direcao", "IN")
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        naJanela = dentroDaJanela((data?.criado_em as string | null) ?? null, new Date().toISOString());
      }

      const tpl = porFluxo.get(msg.fluxo) ?? null;
      const decisao = decidirEnvio({
        politica,
        exigeTemplate: adaptador.exigeTemplateForaDaJanela,
        dentroDaJanela: naJanela,
        temTemplate: Boolean(tpl),
      });

      if (decisao.modo === "texto") return adaptador.enviarTexto(telefone, msg.texto);
      if (decisao.modo === "template" && tpl && adaptador.enviarTemplate) {
        return adaptador.enviarTemplate(telefone, { nome: tpl.nome, idioma: tpl.idioma, params: msg.params });
      }
      const motivo = decisao.modo === "falha" ? decisao.motivo : "Provedor sem suporte a template.";
      await registrarFalha(admin, msg.fluxo, telefone, motivo);
      return { ok: false, erro: motivo };
    },
  };
}

// Conveniência de disparo único (cobrança manual, legalização, follow-up).
export async function enviarProativo(telefone: string, msg: MensagemProativa): Promise<ResultadoEnvio> {
  const e = await criarEnviadorProativo();
  if ("erro" in e) return { ok: false, erro: e.erro };
  return e.enviar(telefone, msg);
}

// Visibilidade da falha: o painel Configurações → Observabilidade (admin) já existe.
// Best-effort — registrar não pode derrubar o envio dos demais clientes do lote.
async function registrarFalha(
  admin: ReturnType<typeof createAdminSupabase>,
  fluxo: string,
  telefone: string,
  motivo: string,
): Promise<void> {
  try {
    await admin.from("evento_erro").insert({
      mensagem: `WhatsApp proativo não enviado: ${motivo}`,
      rota: `whatsapp/proativo/${fluxo}`,
      contexto: { fluxo, telefone },
    });
  } catch {
    // ignora
  }
}

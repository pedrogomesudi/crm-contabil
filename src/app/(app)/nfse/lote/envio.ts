"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { criarEnviadorProativo } from "@/lib/whatsapp/proativo";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { linhasPagamento, competenciaBR, montarMensagemNota, vencimentoBR, valorBR } from "@/lib/whatsapp/notas-envio";
import { obterDanfsePdf, caminhoDanfse } from "@/lib/nfse/danfse-cache";
import { canaisParaEnvio, agregarResultado, type ResultadoCanal } from "@/lib/nfse/envio-canais";
import { flagsParaCanal, type CanalCobranca } from "@/lib/clientes/canal-cobranca";
import { enviarEmail, type Anexo } from "@/lib/email/enviar";
import { garantirPdfBoleto } from "@/app/(app)/financeiro/contas-a-receber/boleto-pdf";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}

export type NotaParaEnvio = {
  nfseId: string;
  razaoSocial: string;
  jaEnviada: boolean;
  canal: CanalCobranca;
  semContato: boolean;
};

export async function listarNotasParaEnvio(competencia: string): Promise<NotaParaEnvio[]> {
  if (!(await gate())) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("nfse")
    .select(
      "id, cliente_id, tomador_razao_social, numero, clientes(razao_social, telefone, telefone_ddi, email, clientes_financeiro(cobranca_whatsapp, cobranca_email))",
    )
    .eq("status", "autorizada")
    .eq("competencia", competencia)
    .order("numero");
  const notas = (data ?? []).map((n) => {
    const cl = (Array.isArray(n.clientes) ? n.clientes[0] : n.clientes) as {
      razao_social?: string;
      telefone?: string;
      telefone_ddi?: string;
      email?: string | null;
      clientes_financeiro?:
        | { cobranca_whatsapp?: boolean; cobranca_email?: boolean }
        | { cobranca_whatsapp?: boolean; cobranca_email?: boolean }[];
    } | null;
    const fin = Array.isArray(cl?.clientes_financeiro) ? cl?.clientes_financeiro[0] : cl?.clientes_financeiro;
    return {
      nfseId: n.id as string,
      clienteId: (n.cliente_id as string | null) ?? null,
      razaoSocial: cl?.razao_social ?? (n.tomador_razao_social as string | null) ?? "SEM RAZAO SOCIAL",
      telefone: normalizarTelefone(cl?.telefone ?? "", cl?.telefone_ddi ?? "55"),
      email: (cl?.email ?? "").trim(),
      flags: { whatsapp: fin?.cobranca_whatsapp ?? true, email: fin?.cobranca_email ?? true },
    };
  });
  if (notas.length === 0) return [];

  // "Já enviada" olha os dois históricos: WhatsApp por nfse_id, e-mail por titulo_id do
  // honorário (MENSALIDADE do cliente na competência).
  const nfseIds = notas.map((n) => n.nfseId);
  const clienteIds = [...new Set(notas.map((n) => n.clienteId).filter((v): v is string => Boolean(v)))];
  const { data: waRows } = await admin
    .from("whatsapp_mensagem")
    .select("nfse_id")
    .eq("status", "ENVIADO")
    .in("nfse_id", nfseIds);
  const enviadasWa = new Set((waRows ?? []).map((r) => r.nfse_id as string));

  const clientesComEmail = new Set<string>();
  if (clienteIds.length) {
    const { data: titRows } = await admin
      .from("titulo")
      .select("id, cliente_id")
      .eq("origem", "MENSALIDADE")
      .eq("competencia", competencia)
      .in("cliente_id", clienteIds);
    const tituloPorCliente = new Map<string, string>();
    for (const t of titRows ?? []) tituloPorCliente.set(t.cliente_id as string, t.id as string);
    const tituloIds = [...tituloPorCliente.values()];
    if (tituloIds.length) {
      const { data: emRows } = await admin
        .from("email_mensagem")
        .select("titulo_id")
        .eq("status", "ENVIADO")
        .in("titulo_id", tituloIds);
      const titEnviados = new Set((emRows ?? []).map((r) => r.titulo_id as string));
      for (const [cliente, tit] of tituloPorCliente) if (titEnviados.has(tit)) clientesComEmail.add(cliente);
    }
  }

  return notas.map((n) => {
    const canal = flagsParaCanal(n.flags);
    const semContato =
      canaisParaEnvio(n.flags, { temTelefone: Boolean(n.telefone), temEmail: Boolean(n.email) }).enviar.length === 0;
    const jaEnviada = enviadasWa.has(n.nfseId) || (n.clienteId ? clientesComEmail.has(n.clienteId) : false);
    return { nfseId: n.nfseId, razaoSocial: n.razaoSocial, jaEnviada, canal, semContato };
  });
}

export type ResultadoEnvioNota = { status: "ok" | "pulado" | "erro"; motivo?: string; razaoSocial: string };

// Título MENSALIDADE do cliente na competência — a âncora do honorário (liga nota, boleto e o
// histórico de e-mail). Null se o cliente não tem mensalidade nessa competência.
async function tituloMensalidadeId(
  admin: ReturnType<typeof createAdminSupabase>,
  clienteId: string,
  competencia: string,
): Promise<string | null> {
  const { data } = await admin
    .from("titulo")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("competencia", competencia)
    .eq("origem", "MENSALIDADE")
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

// Boleto ativo do título do honorário. Opcional: sem boleto, envia só a nota.
async function boletoDoHonorario(
  admin: ReturnType<typeof createAdminSupabase>,
  tituloId: string,
): Promise<{ id: string; linhaDigitavel: string | null; pixCopiaCola: string | null } | null> {
  const { data: bol } = await admin
    .from("boleto")
    .select("id, linha_digitavel, pix_copia_cola")
    .eq("titulo_id", tituloId)
    .not("status", "in", "(cancelado,erro)")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bol) return null;
  return {
    id: bol.id as string,
    linhaDigitavel: (bol.linha_digitavel as string | null) ?? null,
    pixCopiaCola: (bol.pix_copia_cola as string | null) ?? null,
  };
}

// Envia os honorários (NFS-e + boleto) de UMA nota pelos canais que o cliente escolheu.
// WhatsApp: a nota vai em PDF, os dados do boleto (linha digitável + Pix) no texto.
// E-mail: a nota e o boleto vão como anexos, os dados de pagamento no corpo.
// "Ambos" envia nos dois; canal sem contato é pulado com aviso.
export async function enviarHonorarioLote(nfseId: string): Promise<ResultadoEnvioNota> {
  const perfil = await gate();
  if (!perfil) return { status: "erro", motivo: "Sem permissão.", razaoSocial: "" };
  const admin = createAdminSupabase();
  const { data: nota } = await admin
    .from("nfse")
    .select(
      "id, cliente_id, valor, competencia, chave_acesso, ambiente, emitente, clientes(razao_social, responsavel_nome, telefone, telefone_ddi, email, clientes_financeiro(cobranca_whatsapp, cobranca_email, dia_vencimento))",
    )
    .eq("id", nfseId)
    .maybeSingle();
  const cl = nota
    ? ((Array.isArray(nota.clientes) ? nota.clientes[0] : nota.clientes) as {
        razao_social?: string;
        responsavel_nome?: string | null;
        telefone?: string;
        telefone_ddi?: string;
        email?: string | null;
        clientes_financeiro?:
          | { cobranca_whatsapp?: boolean; cobranca_email?: boolean; dia_vencimento?: number | null }
          | { cobranca_whatsapp?: boolean; cobranca_email?: boolean; dia_vencimento?: number | null }[];
      } | null)
    : null;
  const razaoSocial = cl?.razao_social ?? "";
  if (!nota) return { status: "erro", motivo: "Nota não encontrada.", razaoSocial };
  const fin = Array.isArray(cl?.clientes_financeiro) ? cl?.clientes_financeiro[0] : cl?.clientes_financeiro;

  // Canais alvo a partir dos flags do cliente + contatos disponíveis.
  const tel = normalizarTelefone(cl?.telefone ?? "", cl?.telefone_ddi ?? "55");
  const email = (cl?.email ?? "").trim();
  const flags = { whatsapp: fin?.cobranca_whatsapp ?? true, email: fin?.cobranca_email ?? true };
  const { enviar, pulados } = canaisParaEnvio(flags, { temTelefone: Boolean(tel), temEmail: Boolean(email) });
  if (enviar.length === 0) return { ...agregarResultado(pulados), razaoSocial };

  // DANFSe PDF (só pagamos o custo se há canal com contato para enviar).
  const pdfR = await obterDanfsePdf(admin, {
    chave_acesso: nota.chave_acesso as string,
    ambiente: nota.ambiente as string | null,
    emitente: nota.emitente as string,
    cliente_id: nota.cliente_id as string,
  });
  if (!pdfR.pdfBase64) return { status: "erro", motivo: pdfR.erro ?? "DANFSe indisponível.", razaoSocial };

  // Dados de pagamento (dados bancários + boleto do honorário).
  const { data: dados } = await admin
    .from("dados_bancarios")
    .select("pix_chave, banco, agencia, conta, titular, documento, mensagem_template")
    .eq("id", 1)
    .maybeSingle();
  const tituloId = await tituloMensalidadeId(admin, nota.cliente_id as string, String(nota.competencia));
  const boleto = tituloId ? await boletoDoHonorario(admin, tituloId) : null;
  const vencimento = vencimentoBR(String(nota.competencia), (fin?.dia_vencimento as number | null) ?? null);
  const pagamento = linhasPagamento({
    pixChave: dados?.pix_chave,
    banco: dados?.banco,
    agencia: dados?.agencia,
    conta: dados?.conta,
    titular: dados?.titular,
    documento: dados?.documento,
  });
  const extraBoleto: string[] = [];
  if (boleto?.linhaDigitavel) extraBoleto.push(`Linha digitável do boleto: ${boleto.linhaDigitavel}`);
  if (boleto?.pixCopiaCola) extraBoleto.push(`PIX copia-e-cola:\n${boleto.pixCopiaCola}`);
  const template =
    dados?.mensagem_template ??
    "Olá {nome}! Segue a sua NFS-e — honorário de R$ {valor}, competência {competencia}.\n\n{pagamento}";
  const nome = (cl?.responsavel_nome as string | null) || razaoSocial;
  const competenciaTexto = competenciaBR(String(nota.competencia));
  const texto = [
    montarMensagemNota(template, {
      nome,
      empresa: razaoSocial,
      competencia: competenciaTexto,
      valor: valorBR(Number(nota.valor)),
      vencimento,
      pix: dados?.pix_chave ?? "",
      favorecido: dados?.titular ?? "",
      cnpj: dados?.documento ?? "",
      banco: dados?.banco ?? "",
      agencia: dados?.agencia ?? "",
      conta: dados?.conta ?? "",
      pagamento,
    }),
    ...extraBoleto,
  ].join("\n\n");
  const params = [nome, competenciaTexto, valorBR(Number(nota.valor)), vencimento];
  const nomeArq = `NFS-e ${razaoSocial}.pdf`;

  // Boleto PDF para anexo de e-mail (gera/reaproveita no Storage; sem PDF, segue só com a nota).
  let boletoPdf: Buffer | null = null;
  if (enviar.includes("email") && boleto?.id) {
    const path = await garantirPdfBoleto(boleto.id);
    if (path) {
      const { data: blob } = await admin.storage.from("boletos").download(path);
      if (blob) boletoPdf = Buffer.from(await blob.arrayBuffer());
    }
  }

  const resultados: ResultadoCanal[] = [...pulados];
  for (const canal of enviar) {
    if (canal === "whatsapp") {
      const enviador = await criarEnviadorProativo();
      if ("erro" in enviador) {
        resultados.push({ canal: "whatsapp", status: "erro", motivo: enviador.erro });
        continue;
      }
      // tel é não-nulo aqui: canaisParaEnvio só inclui "whatsapp" quando há telefone.
      const r = await enviador.enviar(tel!, {
        fluxo: "nfse",
        texto,
        params,
        midia: { tipo: "document", base64: pdfR.pdfBase64, mime: "application/pdf", nome: nomeArq, caption: texto },
      });
      const resp = (r.resposta ?? {}) as { messageId?: string; id?: string };
      resultados.push(
        r.ok
          ? { canal: "whatsapp", status: "ok" }
          : { canal: "whatsapp", status: "erro", motivo: r.erro ?? "Falha no envio." },
      );
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
    } else {
      const anexos: Anexo[] = [
        { nome: nomeArq, conteudo: Buffer.from(pdfR.pdfBase64, "base64"), tipo: "application/pdf" },
      ];
      if (boletoPdf) anexos.push({ nome: `Boleto ${razaoSocial}.pdf`, conteudo: boletoPdf, tipo: "application/pdf" });
      const assunto = `NFS-e e boleto — ${competenciaTexto} — ${razaoSocial}`;
      const r = await enviarEmail({ para: email, assunto, corpo: texto, anexos });
      resultados.push(r.ok ? { canal: "email", status: "ok" } : { canal: "email", status: "erro", motivo: r.erro });
      await admin.from("email_mensagem").insert({
        cliente_id: nota.cliente_id,
        titulo_id: tituloId,
        para: email,
        assunto,
        corpo: texto,
        status: r.ok ? "ENVIADO" : "ERRO",
        erro: r.ok ? null : r.erro,
        enviado_por: perfil.id,
      });
    }
  }
  return { ...agregarResultado(resultados), razaoSocial };
}

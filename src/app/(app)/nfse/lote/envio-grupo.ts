"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { criarEnviadorProativo } from "@/lib/whatsapp/proativo";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { linhasPagamento, competenciaBR, valorBR } from "@/lib/whatsapp/notas-envio";
import { gerarDanfseFiel, caminhoDanfse } from "@/lib/nfse/danfse-cache";
import { canaisParaEnvio, agregarResultado, type ResultadoCanal } from "@/lib/nfse/envio-canais";
import { enviarEmail, type Anexo } from "@/lib/email/enviar";
import { garantirPdfBoleto } from "@/app/(app)/financeiro/contas-a-receber/boleto-pdf";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}

export type ResultadoEnvioGrupo = { status: "ok" | "pulado" | "erro"; motivo?: string; razaoSocial: string };

type Admin = ReturnType<typeof createAdminSupabase>;

// NFs de honorário (autorizadas, com valor casando com o título de mensalidade) das empresas do
// grupo na competência, já com o DANFSe em PDF. Uma por empresa.
async function nfsDoGrupo(admin: Admin, clienteIds: string[], competencia: string) {
  const { data: titulos } = await admin
    .from("titulo")
    .select("cliente_id, valor")
    .eq("origem", "MENSALIDADE")
    .eq("competencia", competencia)
    .in("cliente_id", clienteIds);
  const valorTitulo = new Map((titulos ?? []).map((t) => [t.cliente_id as string, Number(t.valor)]));
  const { data: notas } = await admin
    .from("nfse")
    .select("id, cliente_id, valor, chave_acesso, ambiente, emitente, clientes(razao_social)")
    .eq("status", "autorizada")
    .eq("competencia", competencia)
    .in("cliente_id", clienteIds)
    .order("numero");
  const saida: {
    nfseId: string;
    clienteId: string;
    razaoSocial: string;
    valor: number;
    chave: string;
    pdfBase64: string;
  }[] = [];
  for (const n of notas ?? []) {
    const cid = n.cliente_id as string;
    const vt = valorTitulo.get(cid);
    if (vt === undefined || Math.round(Number(n.valor) * 100) !== Math.round(vt * 100)) continue; // só honorário
    const pdfR = await gerarDanfseFiel(admin, {
      chave_acesso: n.chave_acesso as string,
      ambiente: n.ambiente as string | null,
      emitente: n.emitente as string,
      cliente_id: cid,
    });
    if (!pdfR.pdfBase64) continue;
    const cl = (Array.isArray(n.clientes) ? n.clientes[0] : n.clientes) as { razao_social?: string } | null;
    saida.push({
      nfseId: n.id as string,
      clienteId: cid,
      razaoSocial: cl?.razao_social ?? "—",
      valor: Number(n.valor),
      chave: pdfR.chave as string,
      pdfBase64: pdfR.pdfBase64,
    });
  }
  return saida;
}

// Envia a cobrança consolidada do grupo à TITULAR: o boleto do grupo + as NFs de todas as
// empresas, num só destinatário. Caminho isolado do envio individual (não altera aquele fluxo).
export async function enviarHonorarioGrupoLote(grupoId: string, competencia: string): Promise<ResultadoEnvioGrupo> {
  const perfil = await gate();
  if (!perfil) return { status: "erro", motivo: "Sem permissão.", razaoSocial: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia))
    return { status: "erro", motivo: "Competência inválida.", razaoSocial: "" };
  const admin = createAdminSupabase();

  const { data: grupo } = await admin
    .from("grupo_cobranca")
    .select("id, nome, titular_cliente_id")
    .eq("id", grupoId)
    .maybeSingle();
  if (!grupo) return { status: "erro", motivo: "Grupo não encontrado.", razaoSocial: "" };
  const { data: membros } = await admin
    .from("clientes")
    .select("id")
    .eq("grupo_cobranca_id", grupoId)
    .eq("status", "ativo")
    .is("excluido_em", null);
  // Titular por titular_cliente_id (independente dos membros): ela pode ser só a pagadora, sem
  // NF/honorário próprio no grupo. Suas NFs não entram no envio — só as das empresas do grupo.
  const { data: titular } = (await admin
    .from("clientes")
    .select(
      "id, razao_social, responsavel_nome, telefone, telefone_ddi, email, clientes_financeiro(cobranca_whatsapp, cobranca_email)",
    )
    .eq("id", grupo.titular_cliente_id)
    .maybeSingle()) as {
    data: {
      id: string;
      razao_social?: string;
      responsavel_nome?: string | null;
      telefone?: string;
      telefone_ddi?: string;
      email?: string | null;
      clientes_financeiro?:
        | { cobranca_whatsapp?: boolean; cobranca_email?: boolean }
        | { cobranca_whatsapp?: boolean; cobranca_email?: boolean }[];
    } | null;
  };
  if (!titular)
    return { status: "erro", motivo: "Titular do grupo não encontrada.", razaoSocial: grupo.nome as string };
  const razaoSocial = titular.razao_social ?? (grupo.nome as string);
  const fin = Array.isArray(titular.clientes_financeiro) ? titular.clientes_financeiro[0] : titular.clientes_financeiro;

  const tel = normalizarTelefone(titular.telefone ?? "", titular.telefone_ddi ?? "55");
  const email = (titular.email ?? "").trim();
  const flags = { whatsapp: fin?.cobranca_whatsapp ?? true, email: fin?.cobranca_email ?? true };
  const { enviar, pulados } = canaisParaEnvio(flags, { temTelefone: Boolean(tel), temEmail: Boolean(email) });
  if (enviar.length === 0) return { ...agregarResultado(pulados), razaoSocial };

  const nfs = await nfsDoGrupo(
    admin,
    (membros ?? []).map((m) => m.id as string),
    competencia,
  );
  if (nfs.length === 0)
    return { status: "erro", motivo: "Nenhuma NF de honorário emitida para o grupo nesta competência.", razaoSocial };

  // Boleto do grupo na competência.
  const { data: bols } = await admin
    .from("boleto")
    .select("id, linha_digitavel, pix_copia_cola, valor")
    .eq("grupo_cobranca_id", grupoId)
    .not("status", "in", "(cancelado,erro)")
    .order("criado_em", { ascending: false });
  const boleto = (bols ?? [])[0] as
    | { id: string; linha_digitavel: string | null; pix_copia_cola: string | null; valor: number }
    | undefined;

  const { data: dados } = await admin
    .from("dados_bancarios")
    .select("pix_chave, banco, agencia, conta, titular, documento")
    .eq("id", 1)
    .maybeSingle();
  const pagamento = linhasPagamento({
    pixChave: dados?.pix_chave,
    banco: dados?.banco,
    agencia: dados?.agencia,
    conta: dados?.conta,
    titular: dados?.titular,
    documento: dados?.documento,
  });
  const listaEmpresas = nfs.map((n) => `• ${n.razaoSocial}`).join("\n");
  const total = boleto?.valor ?? nfs.reduce((s, n) => s + n.valor, 0);

  // Âncora do "já enviada" por e-mail: o título de mensalidade da titular (email_mensagem
  // guarda histórico por titulo_id; sem ele, a listagem não marcaria o grupo como enviado).
  const { data: titTitular } = await admin
    .from("titulo")
    .select("id")
    .eq("cliente_id", titular.id)
    .eq("competencia", competencia)
    .eq("origem", "MENSALIDADE")
    .limit(1)
    .maybeSingle();
  const tituloTitularId = (titTitular?.id as string | null) ?? null;
  const nome = (titular.responsavel_nome as string | null) || razaoSocial;
  const compTexto = competenciaBR(competencia);
  const linhasBoleto: string[] = [];
  if (boleto?.linha_digitavel) linhasBoleto.push(`Linha digitável do boleto: ${boleto.linha_digitavel}`);
  if (boleto?.pix_copia_cola) linhasBoleto.push(`PIX copia-e-cola:\n${boleto.pix_copia_cola}`);
  const texto = [
    `Olá ${nome}! Segue a cobrança consolidada do grupo ${grupo.nome} — honorários de ${compTexto}, total ${valorBR(Number(total))}.`,
    `Empresas do grupo:\n${listaEmpresas}`,
    ...linhasBoleto,
    pagamento,
  ]
    .filter(Boolean)
    .join("\n\n");

  // PDF do boleto do grupo (gera/reaproveita no Storage) — anexo no e-mail e 2º documento no
  // WhatsApp, além das NFs.
  let boletoPdf: Buffer | null = null;
  let boletoPath: string | null = null;
  if (boleto?.id) {
    boletoPath = await garantirPdfBoleto(boleto.id);
    if (boletoPath) {
      const { data: blob } = await admin.storage.from("boletos").download(boletoPath);
      if (blob) boletoPdf = Buffer.from(await blob.arrayBuffer());
    }
  }
  const nomeBoletoArq = `Boleto ${grupo.nome}.pdf`;

  const resultados: ResultadoCanal[] = [...pulados];

  if (enviar.includes("whatsapp")) {
    const enviador = await criarEnviadorProativo();
    if ("erro" in enviador) resultados.push({ canal: "whatsapp", status: "erro", motivo: enviador.erro });
    else {
      let falha: string | null = null;
      for (let i = 0; i < nfs.length; i++) {
        const n = nfs[i]!;
        const caption = i === 0 ? texto : `NFS-e — ${n.razaoSocial}`;
        const r = await enviador.enviar(tel!, {
          fluxo: "nfse",
          texto: caption,
          params: [nome, compTexto, valorBR(Number(total)), ""],
          midia: {
            tipo: "document",
            base64: n.pdfBase64,
            mime: "application/pdf",
            nome: `NFS-e ${n.razaoSocial}.pdf`,
            caption,
          },
        });
        await admin.from("whatsapp_mensagem").insert({
          cliente_id: titular.id,
          telefone: tel,
          texto: caption,
          status: r.ok ? "ENVIADO" : "ERRO",
          direcao: "OUT",
          lida: true,
          resposta: (r.resposta ?? r.erro) as object,
          criado_por: perfil.id,
          nfse_id: n.nfseId,
          midia_tipo: "document",
          midia_path: caminhoDanfse(n.chave),
          midia_nome: `NFS-e ${n.razaoSocial}.pdf`,
          midia_mime: "application/pdf",
        });
        if (!r.ok) falha = r.erro ?? "Falha no envio.";
      }
      // Boleto consolidado do grupo como documento (além das NFs).
      if (boletoPdf) {
        const legenda = `Boleto do grupo ${grupo.nome}`;
        const rb = await enviador.enviar(tel!, {
          fluxo: "nfse",
          texto: legenda,
          params: [nome, compTexto, valorBR(Number(total)), ""],
          midia: {
            tipo: "document",
            base64: boletoPdf.toString("base64"),
            mime: "application/pdf",
            nome: nomeBoletoArq,
            caption: legenda,
          },
        });
        await admin.from("whatsapp_mensagem").insert({
          cliente_id: titular.id,
          telefone: tel,
          texto: legenda,
          status: rb.ok ? "ENVIADO" : "ERRO",
          direcao: "OUT",
          lida: true,
          resposta: (rb.resposta ?? rb.erro) as object,
          criado_por: perfil.id,
          midia_tipo: "document",
          midia_path: boletoPath,
          midia_nome: nomeBoletoArq,
          midia_mime: "application/pdf",
        });
        if (!rb.ok) falha = rb.erro ?? "Falha ao enviar o boleto.";
      }
      resultados.push(
        falha ? { canal: "whatsapp", status: "erro", motivo: falha } : { canal: "whatsapp", status: "ok" },
      );
    }
  }

  if (enviar.includes("email")) {
    const anexos: Anexo[] = nfs.map((n) => ({
      nome: `NFS-e ${n.razaoSocial}.pdf`,
      conteudo: Buffer.from(n.pdfBase64, "base64"),
      tipo: "application/pdf",
    }));
    if (boletoPdf) anexos.push({ nome: nomeBoletoArq, conteudo: boletoPdf, tipo: "application/pdf" });
    const assunto = `NFS-e e boleto consolidado — ${compTexto} — grupo ${grupo.nome}`;
    const r = await enviarEmail({ para: email, assunto, corpo: texto, anexos });
    resultados.push(r.ok ? { canal: "email", status: "ok" } : { canal: "email", status: "erro", motivo: r.erro });
    await admin.from("email_mensagem").insert({
      cliente_id: titular.id,
      titulo_id: tituloTitularId,
      para: email,
      assunto,
      corpo: texto,
      status: r.ok ? "ENVIADO" : "ERRO",
      erro: r.ok ? null : r.erro,
      enviado_por: perfil.id,
    });
  }

  return { ...agregarResultado(resultados), razaoSocial };
}

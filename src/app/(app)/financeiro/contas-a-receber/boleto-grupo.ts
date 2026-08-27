import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { somarHonorariosGrupo, montarObservacoesGrupo, type MembroGrupo } from "@/lib/financeiro/grupo-cobranca";
import type { DadosEmissao } from "@/lib/boleto/tipos";

export type TitularBoleto = {
  razaoSocial: string;
  cpfCnpj: string;
  email: string | null;
  endereco: Record<string, string> | null;
};

// Monta os dados de emissão do boleto consolidado (pagador = titular, valor = soma dos
// honorários do grupo, observações = razão social + CNPJ de cada empresa). Puro/testável.
export function montarDadosBoletoGrupo(
  titular: TitularBoleto,
  membros: MembroGrupo[],
  nomeGrupo: string,
  numero: number,
  vencimento: string,
): DadosEmissao {
  const e = titular.endereco ?? {};
  const temEnd = !!(e.cep || e.logradouro || e.cidade);
  return {
    valor: somarHonorariosGrupo(membros),
    vencimento,
    pagadorNome: titular.razaoSocial,
    pagadorDocumento: String(titular.cpfCnpj ?? "").replace(/\D/g, ""),
    pagadorEmail: titular.email,
    descricao: `Honorários — grupo ${nomeGrupo}`,
    seuNumero: String(numero),
    observacoes: montarObservacoesGrupo(membros),
    pagadorEndereco: temEnd
      ? {
          cep: (e.cep ?? "").replace(/\D/g, ""),
          logradouro: e.logradouro ?? "",
          numero: e.numero ?? "",
          bairro: e.bairro ?? "",
          cidade: e.cidade ?? "",
          uf: e.uf ?? "",
        }
      : null,
  };
}

type SB = SupabaseClient;

// Emite UM boleto para o grupo na competência, no CNPJ da titular, somando os honorários das
// empresas do grupo e ligando o boleto a todos os títulos (base da baixa múltipla).
export async function emitirBoletoGrupoNucleo(
  supabase: SB,
  grupoId: string,
  competencia: string,
): Promise<{ ok?: true; erro?: string; pulado?: string }> {
  const { data: grupo } = await supabase
    .from("grupo_cobranca")
    .select("id, nome, titular_cliente_id")
    .eq("id", grupoId)
    .maybeSingle();
  if (!grupo) return { erro: "Grupo não encontrado." };

  const { data: membros } = await supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, email, endereco")
    .eq("grupo_cobranca_id", grupoId)
    .eq("status", "ativo")
    .is("excluido_em", null);
  // Titular buscada por titular_cliente_id (independente dos membros): a titular pode ser só a
  // pagadora do boleto, sem entrar no rateio dos honorários (não é membro cobrado do grupo).
  const { data: titular } = await supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, email, endereco")
    .eq("id", grupo.titular_cliente_id)
    .maybeSingle();
  if (!titular) return { erro: "Titular do grupo não encontrada." };

  const { data: titulos } = await supabase
    .from("titulo")
    .select("id, valor, vencimento, cliente_id")
    .eq("origem", "MENSALIDADE")
    .eq("competencia", competencia)
    .in("status", ["ABERTO", "BAIXADO_PARCIAL"])
    .in(
      "cliente_id",
      (membros ?? []).map((m) => m.id),
    );
  if (!titulos?.length) return { pulado: "Nenhum honorário em aberto no grupo nesta competência." };

  // Idempotência: se algum título do grupo já está num boleto de grupo, não emite outro.
  const { data: jaLig } = await supabase
    .from("boleto_titulo")
    .select("titulo_id")
    .in(
      "titulo_id",
      titulos.map((t) => t.id),
    );
  if (jaLig?.length) return { pulado: "Boleto do grupo já emitido nesta competência." };

  const porCliente = new Map((membros ?? []).map((m) => [m.id, m]));
  const membrosComTitulo: MembroGrupo[] = titulos.map((t) => {
    const m = porCliente.get(t.cliente_id as string);
    return {
      clienteId: t.cliente_id as string,
      razaoSocial: (m?.razao_social as string) ?? "—",
      cpfCnpj: (m?.cpf_cnpj as string) ?? "",
      honorario: Number(t.valor),
    };
  });
  // Vencimento do boleto: o do título da titular; se ela não tiver título, o do primeiro.
  const tTitular = titulos.find((t) => t.cliente_id === grupo.titular_cliente_id);
  const vencimento = String((tTitular ?? titulos[0]!).vencimento);

  const ativo = await adaptadorAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const { data: n } = await supabase.rpc("proximo_numero_boleto");
  const numero = Number(n);
  const dados = montarDadosBoletoGrupo(
    {
      razaoSocial: titular.razao_social as string,
      cpfCnpj: (titular.cpf_cnpj as string) ?? "",
      email: (titular.email as string | null) ?? null,
      endereco: (titular.endereco as Record<string, string> | null) ?? null,
    },
    membrosComTitulo,
    grupo.nome as string,
    numero,
    vencimento,
  );

  let emitido;
  try {
    emitido = await ativo.adaptador.emitir(dados);
  } catch (e) {
    return { erro: `Falha na emissão: ${(e as Error).message}` };
  }
  const { data: bol, error } = await supabase
    .from("boleto")
    .insert({
      titulo_id: null,
      grupo_cobranca_id: grupoId,
      numero,
      provedor: ativo.provedor,
      provedor_boleto_id: emitido.provedorBoletoId,
      nosso_numero: emitido.nossoNumero,
      linha_digitavel: emitido.linhaDigitavel,
      pix_copia_cola: emitido.pixCopiaCola,
      url_pdf: emitido.urlPdf,
      valor: dados.valor,
      vencimento,
    })
    .select("id")
    .single();
  if (error || !bol) return { erro: "Boleto emitido no provedor, mas falhou ao gravar. Verifique antes de reemitir." };
  const { error: e2 } = await supabase
    .from("boleto_titulo")
    .insert(titulos.map((t) => ({ boleto_id: bol.id as string, titulo_id: t.id, valor: Number(t.valor) })));
  if (e2) return { erro: "Boleto gravado, mas falhou ao vincular os títulos do grupo." };
  return { ok: true };
}

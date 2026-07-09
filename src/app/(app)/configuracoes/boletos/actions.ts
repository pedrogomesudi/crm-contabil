"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { cifrarCredencial } from "@/lib/boleto/cripto";
import type { ConfigBoletoView } from "@/lib/boleto/config";

export type SalvarInput = { provedor: "nenhum" | "inter" | "asaas"; asaasAmbiente: "sandbox" | "producao"; interContaCorrente: string | null; asaasApiKey?: string | null; interClientId?: string | null; interClientSecret?: string | null; interCert?: string | null; interKey?: string | null };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function obterConfigBoleto(): Promise<ConfigBoletoView> {
  const vazio: ConfigBoletoView = { provedor: "nenhum", asaasAmbiente: "producao", interContaCorrente: null, asaasApiKeyDefinida: false, interClientIdDefinido: false, interClientSecretDefinido: false, interCertDefinido: false, interKeyDefinida: false };
  if (!(await gate())) return vazio;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("boleto_config").select("provedor, asaas_api_key_cifrada, asaas_ambiente, inter_client_id_cifrado, inter_client_secret_cifrado, inter_conta_corrente, inter_cert_cifrado, inter_key_cifrado").eq("id", 1).maybeSingle();
  if (!data) return vazio;
  const def = (v: unknown) => typeof v === "string" && v.length > 0;
  return {
    provedor: data.provedor as "nenhum" | "inter" | "asaas",
    asaasAmbiente: data.asaas_ambiente as "sandbox" | "producao",
    interContaCorrente: (data.inter_conta_corrente as string | null) ?? null,
    asaasApiKeyDefinida: def(data.asaas_api_key_cifrada),
    interClientIdDefinido: def(data.inter_client_id_cifrado),
    interClientSecretDefinido: def(data.inter_client_secret_cifrado),
    interCertDefinido: def(data.inter_cert_cifrado),
    interKeyDefinida: def(data.inter_key_cifrado),
  };
}

export async function salvarConfigBoleto(input: SalvarInput): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = { provedor: input.provedor, asaas_ambiente: input.asaasAmbiente, inter_conta_corrente: input.interContaCorrente, atualizado_em: new Date().toISOString() };
  try {
    if (input.asaasApiKey) patch.asaas_api_key_cifrada = cifrarCredencial(input.asaasApiKey);
    if (input.interClientId) patch.inter_client_id_cifrado = cifrarCredencial(input.interClientId);
    if (input.interClientSecret) patch.inter_client_secret_cifrado = cifrarCredencial(input.interClientSecret);
    if (input.interCert) patch.inter_cert_cifrado = cifrarCredencial(input.interCert);
    if (input.interKey) patch.inter_key_cifrado = cifrarCredencial(input.interKey);
  } catch {
    return { erro: "BOLETO_CRIPTO_KEY não configurada." };
  }
  const { error } = await supabase.from("boleto_config").update(patch).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/boletos");
  return { ok: true };
}

import { createServerSupabase } from "@/lib/supabase/server";
import { decifrarCredencial } from "./cripto";
import { criarAdaptadorAsaas } from "./asaas";
import { criarAdaptadorInter } from "./inter";
import type { ProvedorBoleto } from "./tipos";

export async function adaptadorAtivo(): Promise<{ adaptador: ProvedorBoleto; provedor: "inter" | "asaas" } | { erro: string }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("boleto_config").select("provedor, asaas_api_key_cifrada, asaas_ambiente, inter_client_id_cifrado, inter_client_secret_cifrado, inter_conta_corrente, inter_cert_cifrado, inter_key_cifrado").eq("id", 1).maybeSingle();
  if (!data || data.provedor === "nenhum") return { erro: "Nenhum provedor de boleto configurado." };
  try {
    if (data.provedor === "asaas") {
      if (!data.asaas_api_key_cifrada) return { erro: "Asaas sem API key configurada." };
      return { adaptador: criarAdaptadorAsaas(decifrarCredencial(data.asaas_api_key_cifrada as string), data.asaas_ambiente as "sandbox" | "producao"), provedor: "asaas" };
    }
    if (!data.inter_client_id_cifrado || !data.inter_client_secret_cifrado || !data.inter_cert_cifrado || !data.inter_key_cifrado || !data.inter_conta_corrente) {
      return { erro: "Banco Inter com credenciais incompletas." };
    }
    return {
      adaptador: criarAdaptadorInter(
        decifrarCredencial(data.inter_client_id_cifrado as string),
        decifrarCredencial(data.inter_client_secret_cifrado as string),
        data.inter_conta_corrente as string,
        decifrarCredencial(data.inter_cert_cifrado as string),
        decifrarCredencial(data.inter_key_cifrado as string),
        "producao",
      ),
      provedor: "inter",
    };
  } catch {
    return { erro: "BOLETO_CRIPTO_KEY não configurada ou credenciais inválidas." };
  }
}

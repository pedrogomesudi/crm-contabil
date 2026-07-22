import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { criarAdaptadorZapi } from "./zapi";
import type { ProvedorWhatsapp } from "./tipos";

// Resolve o adaptador de WhatsApp ativo a partir da config do escritório (whatsapp_config.provedor).
// Molde de boleto/ativo.ts. Fatia 1A: só 'zapi' envia; 'oficial' entra na Fatia 1B.
export async function adaptadorWhatsappAtivo(): Promise<
  { adaptador: ProvedorWhatsapp; provedor: "zapi" | "oficial" } | { erro: string }
> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("whatsapp_config")
    .select("provedor, instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  const provedor = (data?.provedor as string) ?? "zapi";
  try {
    if (provedor === "oficial") {
      return { erro: "WhatsApp oficial ainda não disponível (em breve)." };
    }
    if (!data?.instance || !data.token_cifrado || !data.client_token_cifrado) {
      return { erro: "WhatsApp (Z-API) não configurado." };
    }
    return {
      adaptador: criarAdaptadorZapi({
        instance: data.instance as string,
        token: (await decifrarDominio("whatsapp", data.token_cifrado as string)).toString("utf8"),
        clientToken: (await decifrarDominio("whatsapp", data.client_token_cifrado as string)).toString("utf8"),
      }),
      provedor: "zapi",
    };
  } catch {
    return { erro: "Criptografia do WhatsApp não configurada ou credenciais inválidas." };
  }
}

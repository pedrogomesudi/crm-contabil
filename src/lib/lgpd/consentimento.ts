import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Grava o evento de consentimento (a PROVA histórica que a LGPD exige — hoje só temos o
// estado atual). Via service_role: `lgpd_consentimento_evento` não tem policy de INSERT,
// para o titular não forjar o próprio consentimento.
export async function registrarConsentimento(
  clienteId: string,
  tipo: string,
  concedido: boolean,
  origem: string,
  usuarioId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  await admin.from("lgpd_consentimento_evento").insert({
    cliente_id: clienteId,
    tipo,
    concedido,
    origem,
    usuario_id: usuarioId,
  });
}

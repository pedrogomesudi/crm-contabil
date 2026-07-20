import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { baixarBoletoPago } from "@/lib/boleto/baixar";

// Consulta no Inter a situação dos boletos em aberto e baixa os que já estão pagos.
// Roda sem sessão (service_role) — usado pela action gateada e pelo cron.
export async function sincronizarBoletosCore(): Promise<{ baixados: number }> {
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("boleto_config")
    .select("provedor, conta_bancaria_id")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg || cfg.provedor !== "inter") return { baixados: 0 };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo || typeof ativo.adaptador.consultarPagamento !== "function") return { baixados: 0 };
  const { data: boletos } = await admin
    .from("boleto")
    .select("id, titulo_id, valor, status, provedor_boleto_id")
    .eq("provedor", "inter")
    .eq("status", "emitido");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let baixados = 0;
  for (const b of boletos ?? []) {
    if (!b.provedor_boleto_id) continue;
    const evento = await ativo.adaptador.consultarPagamento(b.provedor_boleto_id as string);
    if (!evento || !evento.pago) continue;
    const baixou = await baixarBoletoPago(
      admin,
      { id: b.id as string, titulo_id: b.titulo_id as string, valor: Number(b.valor), status: b.status as string },
      evento,
      cfg.conta_bancaria_id as string | null,
      hoje,
    );
    if (baixou) baixados++;
  }
  return { baixados };
}

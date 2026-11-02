import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { baixarBoletoPago } from "@/lib/boleto/baixar";
import { boletoIncompleto, camposACompletar } from "@/lib/boleto/completar";

// Consulta no Inter a situação dos boletos em aberto e baixa os que já estão pagos.
// Roda sem sessão (service_role) — usado pela action gateada e pelo cron.
export async function sincronizarBoletosCore(): Promise<{ baixados: number; completados: number }> {
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("boleto_config")
    .select("provedor, conta_bancaria_id")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg || cfg.provedor !== "inter") return { baixados: 0, completados: 0 };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo || typeof ativo.adaptador.consultarPagamento !== "function")
    return { baixados: 0, completados: 0 };
  const { data: boletos } = await admin
    .from("boleto")
    .select(
      "id, titulo_id, valor, status, provedor_boleto_id, grupo_cobranca_id, nosso_numero, linha_digitavel, pix_copia_cola",
    )
    .eq("provedor", "inter")
    .eq("status", "emitido");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let baixados = 0;
  let completados = 0;
  for (const b of boletos ?? []) {
    if (!b.provedor_boleto_id) continue;

    // Boleto gravado sem linha digitável não serve para o cliente pagar, e sem isto ficaria
    // preso: o registro no provedor é assíncrono e a emissão pode gravar antes de ficar pronto.
    // Aqui ele é completado na primeira sincronização seguinte.
    const campos = {
      nosso_numero: (b.nosso_numero as string | null) ?? null,
      linha_digitavel: (b.linha_digitavel as string | null) ?? null,
      pix_copia_cola: (b.pix_copia_cola as string | null) ?? null,
    };
    if (boletoIncompleto(campos) && typeof ativo.adaptador.reconsultar === "function") {
      const lido = await ativo.adaptador.reconsultar(b.provedor_boleto_id as string);
      if (lido) {
        const upd = camposACompletar(campos, lido);
        if (Object.keys(upd).length) {
          await admin
            .from("boleto")
            .update(upd)
            .eq("id", b.id as string);
          completados++;
        }
      }
    }

    const evento = await ativo.adaptador.consultarPagamento(b.provedor_boleto_id as string);
    if (!evento || !evento.pago) continue;
    const baixou = await baixarBoletoPago(
      admin,
      {
        id: b.id as string,
        titulo_id: b.titulo_id as string | null,
        valor: Number(b.valor),
        status: b.status as string,
        grupo_cobranca_id: b.grupo_cobranca_id as string | null,
      },
      evento,
      cfg.conta_bancaria_id as string | null,
      hoje,
    );
    if (baixou) baixados++;
  }
  return { baixados, completados };
}

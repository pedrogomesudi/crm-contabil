import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/PageHeader";
import { controleCls } from "@/components/ui/Campo";
import { FormDadosPagamento } from "@/components/nfse/FormDadosPagamento";
import { salvarAlcada, salvarConfigSuspensao } from "./actions";

export default async function ConfigPagamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const admin = createAdminSupabase();
  const { data } = await admin.from("dados_bancarios").select("*").eq("id", 1).maybeSingle();
  const { data: cfg } = await admin
    .from("escritorio_config")
    .select("alcada_pagamento, suspensao_dias_tolerancia, suspensao_valor_minimo")
    .eq("id", 1)
    .maybeSingle();
  const alcada = (cfg?.alcada_pagamento as number | null) ?? null;
  const dias = (cfg?.suspensao_dias_tolerancia as number | null) ?? null;
  const piso = (cfg?.suspensao_valor_minimo as number | null) ?? null;
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <PageHeader titulo="Dados de pagamento" subtitulo="PIX e dados bancários enviados ao cliente com a NFS-e" />
      <FormDadosPagamento inicial={data ?? null} />
      <form action={salvarAlcada} className="max-w-md space-y-2 rounded-lg border border-linha bg-white p-4">
        <h2 className="text-sm font-semibold text-grafite">Alçada de aprovação</h2>
        <p className="text-xs text-cinza">
          Despesas acima deste valor exigem aprovação de outro admin antes de serem pagas. Vazio = sem alçada.
        </p>
        <label className="flex items-center gap-2 text-sm">
          R$
          <input
            name="alcada"
            type="number"
            step="0.01"
            min="0"
            defaultValue={alcada ?? ""}
            className={controleCls("compacto")}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105"
        >
          Salvar alçada
        </button>
      </form>
      <form action={salvarConfigSuspensao} className="max-w-md space-y-2 rounded-lg border border-linha bg-white p-4">
        <h2 className="text-sm font-semibold text-grafite">Suspensão por inadimplência</h2>
        <p className="text-xs text-cinza">
          Clientes com atraso a partir destes dias e saldo devedor a partir do piso entram na fila de sugestão de
          suspensão. Dias vazio ou 0 = suspensão desligada. Piso vazio = sem piso.
        </p>
        <label className="flex items-center gap-2 text-sm">
          Dias de tolerância
          <input
            name="suspensao_dias_tolerancia"
            type="number"
            step="1"
            min="0"
            defaultValue={dias ?? ""}
            className={controleCls("compacto")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Piso R$
          <input
            name="suspensao_valor_minimo"
            type="number"
            step="0.01"
            min="0"
            defaultValue={piso ?? ""}
            className={controleCls("compacto")}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105"
        >
          Salvar suspensão
        </button>
      </form>
    </Container>
  );
}

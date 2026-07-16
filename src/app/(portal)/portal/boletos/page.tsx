import { createServerSupabase } from "@/lib/supabase/server";
import { LinkBoleto } from "./LinkBoleto";

export const metadata = { title: "Boletos" };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function PortalBoletosPage() {
  const supabase = await createServerSupabase();
  // RLS: só os boletos dos títulos do próprio cliente.
  const { data } = await supabase
    .from("boleto")
    .select("id, numero, valor, vencimento, status, url_pdf, linha_digitavel, pix_copia_cola")
    .order("vencimento", { ascending: false })
    .limit(200);
  const boletos = data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-texto">Boletos</h1>
      {boletos.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum boleto emitido.</p>
      ) : (
        <ul className="space-y-2">
          {boletos.map((b) => (
            <li key={b.id as string} className="rounded-2xl border border-linha bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-texto">
                  Vencimento {dataBR(b.vencimento as string)} ·{" "}
                  <span className="tabular-nums">{brl(Number(b.valor))}</span>
                </span>
                <span className="text-xs text-cinza">{b.status as string}</span>
              </div>
              {b.linha_digitavel && (
                <p className="mt-1 break-all font-mono text-xs text-cinza">{b.linha_digitavel as string}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {b.url_pdf && <LinkBoleto id={b.id as string} url={b.url_pdf as string} />}
                {b.pix_copia_cola && <span className="text-cinza">PIX copia e cola disponível no boleto</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

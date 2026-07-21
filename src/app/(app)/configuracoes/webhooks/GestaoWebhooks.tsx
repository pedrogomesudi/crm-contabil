"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { formatarData } from "@/lib/format";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";
import {
  criarEndpoint,
  alternarEndpoint,
  removerEndpoint,
  enviarTeste,
  reenviarEntrega,
  type EndpointView,
  type EntregaView,
} from "./actions";

export function GestaoWebhooks({ endpoints, entregas }: { endpoints: EndpointView[]; entregas: EntregaView[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<string[]>([]);
  const [criado, setCriado] = useState<string | null>(null);

  function toggle(e: string) {
    setEventos((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e]));
  }

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    const r = await criarEndpoint(url, eventos);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setCriado(r.secret ?? null);
    setUrl("");
    setEventos([]);
    router.refresh();
  }

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    const r = await fn();
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {criado && (
        <div className="rounded-2xl border border-verde/40 bg-creme p-4 text-sm">
          <p className="font-medium text-texto">
            Segredo do endpoint — copie agora, ele não será mostrado de novo (use para verificar a assinatura
            <code className="mx-1 rounded bg-white px-1">X-Assinatura</code>):
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white p-2 text-texto">{criado}</code>
          <button type="button" onClick={() => setCriado(null)} className="mt-2 text-xs text-cinza underline">
            Já copiei, ocultar
          </button>
        </div>
      )}

      <form onSubmit={criar} className="space-y-3 rounded-2xl border border-linha bg-white p-4">
        <h2 className="font-display text-sm font-semibold text-texto">Novo endpoint</h2>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemplo.com/webhook"
          className={`${controleCls("compacto")} block w-full`}
        />
        <div className="flex flex-wrap gap-2">
          {EVENTOS_WEBHOOK.map((e) => (
            <label key={e} className="flex items-center gap-1.5 text-xs text-texto">
              <input type="checkbox" checked={eventos.includes(e)} onChange={() => toggle(e)} className="size-4" />
              {e}
            </label>
          ))}
        </div>
        <Botao type="submit" disabled={ocupado}>
          Criar endpoint
        </Botao>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">URL</th>
              <th className="px-3 py-2 text-left font-medium">Eventos</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-cinza">
                  Nenhum endpoint.
                </td>
              </tr>
            ) : (
              endpoints.map((e) => (
                <tr key={e.id} className="border-b border-linha/60">
                  <td className="px-3 py-2 break-all text-texto">{e.url}</td>
                  <td className="px-3 py-2 text-xs text-cinza">{e.eventos.join(", ")}</td>
                  <td className="px-3 py-2 text-cinza">{e.ativo ? "ativo" : "inativo"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await enviarTeste(e.id);
                          alert(r.ok ? `Teste entregue (HTTP ${r.status}).` : `Falhou: ${r.erro}`);
                        }}
                        className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto hover:bg-creme"
                      >
                        Enviar teste
                      </button>
                      <button
                        type="button"
                        onClick={() => chamar(() => alternarEndpoint(e.id, !e.ativo))}
                        className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto hover:bg-creme"
                      >
                        {e.ativo ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Remover este endpoint?")) chamar(() => removerEndpoint(e.id));
                        }}
                        className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-negativo hover:bg-creme"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="mb-2 font-display text-sm font-semibold text-texto">Entregas recentes</h2>
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Evento</th>
                <th className="px-3 py-2 text-left font-medium">URL</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Tent.</th>
                <th className="px-3 py-2 text-right font-medium">Quando</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {entregas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-cinza">
                    Nenhuma entrega ainda.
                  </td>
                </tr>
              ) : (
                entregas.map((d) => (
                  <tr key={d.id} className="border-b border-linha/60">
                    <td className="px-3 py-2 text-texto">{d.evento}</td>
                    <td className="px-3 py-2 break-all text-xs text-cinza">{d.url}</td>
                    <td
                      className={`px-3 py-2 ${d.status === "ok" ? "text-verde" : d.status === "falhou" ? "text-negativo" : "text-cinza"}`}
                    >
                      {d.status}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-cinza">{d.tentativas}</td>
                    <td className="px-3 py-2 text-right text-cinza">{formatarData(d.criadoEm)}</td>
                    <td className="px-3 py-2 text-right">
                      {d.status !== "ok" && (
                        <button
                          type="button"
                          onClick={() => chamar(() => reenviarEntrega(d.id))}
                          className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto hover:bg-creme"
                        >
                          Reenviar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

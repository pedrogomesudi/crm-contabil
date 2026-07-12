"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarEmpresaConstituicao } from "../constituicao-actions";

const input = "mt-0.5 w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto";
type Socio = { nome: string; cpf: string; participacao: string; papelSocietario: "administrador" | "quotista" };

export function FormConstituicao({ contadores, contadorEditavel, modelos, hoje }: {
  contadores: { id: string; nome: string }[];
  contadorEditavel: boolean;
  modelos: { id: string; nome: string }[];
  hoje: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [socios, setSocios] = useState<Socio[]>([{ nome: "", cpf: "", participacao: "", papelSocietario: "administrador" }]);

  function setSocio(i: number, patch: Partial<Socio>) {
    setSocios(socios.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const fd = new FormData(e.currentTarget);
    fd.set("socios", JSON.stringify(socios.filter((s) => s.nome.trim())));
    if (pdfFile) fd.set("pdf", pdfFile);
    const r = await criarEmpresaConstituicao(fd);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.processoId) router.push(`/legalizacao/${r.processoId}`);
    else if (r.id) router.push(`/clientes/${r.id}`);
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="rounded-2xl border border-linha bg-creme p-3">
        <label className="text-xs text-cinza">Formulário de constituição (PDF)
          <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} className="mt-0.5 block text-xs" />
        </label>
        <p className="mt-1 text-xs text-cinza">Opcional. O PDF fica anexado ao acervo do cliente. Preencha os campos abaixo à mão.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2 block">Razão social pretendida
          <input name="razao_social" required className={input} />
        </label>
        <label className="col-span-2 block">Nome fantasia
          <input name="nome_fantasia" className={input} />
        </label>
        <label className="block">Regime pretendido
          <select name="regime" defaultValue="Simples" className={input}>
            <option value="Simples">Simples</option>
            <option value="Presumido">Presumido</option>
            <option value="Real">Real</option>
          </select>
        </label>
        <label className="block">Contador responsável
          {contadorEditavel ? (
            <select name="contador_id" className={input}>
              <option value="">—</option>
              {contadores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          ) : (
            <input value="Você (contador)" disabled className={input} />
          )}
        </label>
        <label className="block">Logradouro<input name="logradouro" className={input} /></label>
        <label className="block">Número<input name="numero" className={input} /></label>
        <label className="block">Bairro<input name="bairro" className={input} /></label>
        <label className="block">Cidade<input name="cidade" className={input} /></label>
        <label className="block">UF<input name="uf" maxLength={2} className={input} /></label>
        <label className="block">CEP<input name="cep" className={input} /></label>
        <label className="col-span-2 block">Observações / atividades
          <textarea name="observacoes" rows={3} className={input} />
        </label>
      </div>

      <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-texto">Sócios</h3>
          <button type="button" onClick={() => setSocios([...socios, { nome: "", cpf: "", participacao: "", papelSocietario: "quotista" }])} className="text-xs text-verde underline">+ sócio</button>
        </div>
        {socios.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input value={s.nome} onChange={(e) => setSocio(i, { nome: e.target.value })} placeholder="Nome" className="flex-1 rounded-lg border border-linha px-2 py-1.5 text-sm" />
            <input value={s.cpf} onChange={(e) => setSocio(i, { cpf: e.target.value })} placeholder="CPF" className="w-36 rounded-lg border border-linha px-2 py-1.5 text-sm" />
            <input value={s.participacao} onChange={(e) => setSocio(i, { participacao: e.target.value })} placeholder="%" className="w-20 rounded-lg border border-linha px-2 py-1.5 text-sm" />
            <select value={s.papelSocietario} onChange={(e) => setSocio(i, { papelSocietario: e.target.value as Socio["papelSocietario"] })} className="rounded-lg border border-linha px-2 py-1.5 text-sm">
              <option value="administrador">Administrador</option>
              <option value="quotista">Quotista</option>
            </select>
            {socios.length > 1 && <button type="button" onClick={() => setSocios(socios.filter((_, idx) => idx !== i))} className="text-xs text-negativo underline">remover</button>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-linha bg-creme p-3 text-sm">
        <label className="text-xs text-cinza">Modelo de abertura
          <select name="modelo_abertura" className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
            <option value="">— iniciar depois</option>
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        <label className="text-xs text-cinza">Início
          <input type="date" name="data_inicio" defaultValue={hoje} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
      </div>

      {erro && <p role="alert" className="text-sm text-negativo">{erro}</p>}
      <div className="flex justify-end">
        <button disabled={ocupado} className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {ocupado ? "Criando…" : "Criar e iniciar abertura"}
        </button>
      </div>
    </form>
  );
}

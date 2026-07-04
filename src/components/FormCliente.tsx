"use client";
import { useActionState, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { TIPOS_PESSOA, REGIMES } from "@/lib/tipos";
import { Campo, inputCls } from "@/components/ui/Campo";
import { consultarCnpjParaFormulario } from "@/app/(app)/clientes/consultaReceita";
import type { EstadoCliente } from "@/app/(app)/clientes/estados";

export type ClienteDefaults = {
  tipo_pessoa?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cpf_cnpj?: string;
  regime_tributario?: string;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  email?: string;
  telefone?: string;
  endereco?: Record<string, string> | null;
  responsavel_nome?: string;
  representante?: Record<string, string> | null;
  contador_id?: string | null;
  status?: string;
  data_inicio?: string | null;
  observacoes?: string;
  atualizado_em?: string | null;
};

type Props = {
  action: (estado: EstadoCliente, formData: FormData) => Promise<EstadoCliente>;
  contadores: { id: string; nome: string }[];
  cliente?: ClienteDefaults;
  modo: "novo" | "editar";
  // Só admin (e assistente/contador na criação) pode atribuir contador; o trigger
  // congela contador_id p/ não-admin no UPDATE. Quando false, mostra read-only.
  contadorEditavel: boolean;
};

export function FormCliente({ action, contadores, cliente, modo, contadorEditavel }: Props) {
  const [estado, formAction, pending] = useActionState<EstadoCliente, FormData>(action, {});
  const c = cliente ?? {};
  const end = c.endereco ?? {};
  const nomeContadorAtual =
    contadores.find((ct) => ct.id === c.contador_id)?.nome ?? "— sem atribuição —";

  // Campos controlados: os que a busca na Receita preenche.
  const [tipoPessoa, setTipoPessoa] = useState(c.tipo_pessoa ?? "");
  const [cpfCnpj, setCpfCnpj] = useState(c.cpf_cnpj ?? "");
  const [f, setF] = useState({
    razao_social: c.razao_social ?? "",
    nome_fantasia: c.nome_fantasia ?? "",
    logradouro: end.logradouro ?? "",
    numero: end.numero ?? "",
    complemento: end.complemento ?? "",
    bairro: end.bairro ?? "",
    cidade: end.cidade ?? "",
    uf: end.uf ?? "",
    cep: end.cep ?? "",
  });
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const ehCnpj = tipoPessoa === "PJ" || tipoPessoa === "MEI";

  const [buscando, setBuscando] = useState(false);
  const [msgBusca, setMsgBusca] = useState<{ ok: boolean; texto: string } | null>(null);

  async function buscarReceita() {
    const doc = cpfCnpj.replace(/\D/g, "");
    if (doc.length !== 14) {
      setMsgBusca({ ok: false, texto: "Informe um CNPJ com 14 dígitos." });
      return;
    }
    setBuscando(true);
    setMsgBusca(null);
    const r = await consultarCnpjParaFormulario(doc);
    setBuscando(false);
    if (r.erro || !r.ok) {
      setMsgBusca({ ok: false, texto: r.erro ?? "Não foi possível consultar." });
      return;
    }
    const e = r.endereco ?? {};
    setF((s) => ({
      razao_social: r.razaoSocial ?? s.razao_social,
      nome_fantasia: r.nomeFantasia ?? s.nome_fantasia,
      logradouro: e.logradouro ?? s.logradouro,
      numero: e.numero ?? s.numero,
      complemento: e.complemento ?? s.complemento,
      bairro: e.bairro ?? s.bairro,
      cidade: e.cidade ?? s.cidade,
      uf: e.uf ?? s.uf,
      cep: e.cep ?? s.cep,
    }));
    setMsgBusca({
      ok: true,
      texto: `Dados da Receita preenchidos${r.situacao ? ` · situação ${r.situacao}` : ""}. Revise e salve.`,
    });
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {/* concorrência otimista: o servidor confere contra o valor atual */}
      {modo === "editar" && c.atualizado_em && (
        <input type="hidden" name="atualizado_em" defaultValue={c.atualizado_em} />
      )}
      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Cadastrais e fiscais</legend>
        <Campo label="Tipo de pessoa *">
          <select
            name="tipo_pessoa"
            required
            value={tipoPessoa}
            onChange={(e) => setTipoPessoa(e.target.value)}
            className={inputCls}
          >
            <option value="" disabled>
              Selecione
            </option>
            {TIPOS_PESSOA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="CPF / CNPJ *">
          <div className="flex gap-2">
            <input
              name="cpf_cnpj"
              required
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              className={inputCls}
            />
            {ehCnpj && (
              <button
                type="button"
                onClick={buscarReceita}
                disabled={buscando}
                className="shrink-0 rounded border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {buscando ? "Buscando…" : "Buscar na Receita"}
              </button>
            )}
          </div>
          {msgBusca && (
            <p className={`mt-1 text-xs ${msgBusca.ok ? "text-green-700" : "text-red-600"}`}>{msgBusca.texto}</p>
          )}
        </Campo>
        <Campo label="Razão social / Nome *">
          <input
            name="razao_social"
            required
            value={f.razao_social}
            onChange={set("razao_social")}
            className={inputCls}
          />
        </Campo>
        <Campo label="Nome fantasia">
          <input name="nome_fantasia" value={f.nome_fantasia} onChange={set("nome_fantasia")} className={inputCls} />
        </Campo>
        <Campo label="Regime tributário *">
          <select
            name="regime_tributario"
            required
            defaultValue={c.regime_tributario ?? ""}
            className={inputCls}
          >
            <option value="" disabled>
              Selecione
            </option>
            {REGIMES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Inscrição estadual">
            <input
              name="inscricao_estadual"
              defaultValue={c.inscricao_estadual ?? ""}
              className={inputCls}
            />
          </Campo>
          <Campo label="Inscrição municipal">
            <input
              name="inscricao_municipal"
              defaultValue={c.inscricao_municipal ?? ""}
              className={inputCls}
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Contato</legend>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="E-mail">
            <input name="email" type="email" defaultValue={c.email ?? ""} className={inputCls} />
          </Campo>
          <Campo label="Telefone / WhatsApp">
            <input name="telefone" defaultValue={c.telefone ?? ""} className={inputCls} />
          </Campo>
        </div>
        <Campo label="Responsável (contato)">
          <input
            name="responsavel_nome"
            defaultValue={c.responsavel_nome ?? ""}
            className={inputCls}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Logradouro">
            <input name="logradouro" value={f.logradouro} onChange={set("logradouro")} className={inputCls} />
          </Campo>
          <Campo label="Número">
            <input name="numero" value={f.numero} onChange={set("numero")} className={inputCls} />
          </Campo>
          <Campo label="Complemento">
            <input name="complemento" value={f.complemento} onChange={set("complemento")} className={inputCls} />
          </Campo>
          <Campo label="Bairro">
            <input name="bairro" value={f.bairro} onChange={set("bairro")} className={inputCls} />
          </Campo>
          <Campo label="Cidade">
            <input name="cidade" value={f.cidade} onChange={set("cidade")} className={inputCls} />
          </Campo>
          <Campo label="UF">
            <input
              name="uf"
              maxLength={2}
              value={f.uf}
              onChange={set("uf")}
              style={{ textTransform: "uppercase" }}
              className={inputCls}
            />
          </Campo>
          <Campo label="CEP">
            <input name="cep" value={f.cep} onChange={set("cep")} className={inputCls} />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">
          Representante legal (contrato)
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nacionalidade">
            <input
              name="rep_nacionalidade"
              defaultValue={(c.representante ?? {}).nacionalidade ?? ""}
              className={inputCls}
            />
          </Campo>
          <Campo label="Estado civil">
            <input
              name="rep_estado_civil"
              defaultValue={(c.representante ?? {}).estado_civil ?? ""}
              className={inputCls}
            />
          </Campo>
          <Campo label="Profissão">
            <input
              name="rep_profissao"
              defaultValue={(c.representante ?? {}).profissao ?? ""}
              className={inputCls}
            />
          </Campo>
          <Campo label="RG">
            <input name="rep_rg" defaultValue={(c.representante ?? {}).rg ?? ""} className={inputCls} />
          </Campo>
          <Campo label="CPF do representante">
            <input
              name="rep_cpf"
              defaultValue={(c.representante ?? {}).cpf ?? ""}
              className={inputCls}
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Gestão interna</legend>
        <Campo label="Contador responsável">
          {contadorEditavel ? (
            <select name="contador_id" defaultValue={c.contador_id ?? ""} className={inputCls}>
              <option value="">— sem atribuição —</option>
              {contadores.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.nome}
                </option>
              ))}
            </select>
          ) : (
            // Não editável: o trigger congela contador_id p/ não-admin. Mostra read-only.
            <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {nomeContadorAtual}
            </p>
          )}
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Início do contrato">
            <input
              name="data_inicio"
              type="date"
              defaultValue={c.data_inicio ?? ""}
              className={inputCls}
            />
          </Campo>
          {modo === "editar" && (
            <Campo label="Status">
              <select name="status" defaultValue={c.status ?? "ativo"} className={inputCls}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </Campo>
          )}
        </div>
        <Campo label="Observações">
          <textarea
            name="observacoes"
            rows={3}
            maxLength={2000}
            defaultValue={c.observacoes ?? ""}
            className={inputCls}
          />
        </Campo>
      </fieldset>

      {estado.erro && (
        <div role="alert" className="text-sm text-red-600">
          {estado.erro}
          {estado.reativarId && (
            <>
              {" "}
              <Link href={`/clientes/${estado.reativarId}`} className="underline">
                Abrir cliente inativo
              </Link>
            </>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Salvando..." : modo === "novo" ? "Cadastrar" : "Salvar"}
        </button>
        <Link href="/clientes" className="rounded border px-4 py-2 text-sm text-slate-700">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

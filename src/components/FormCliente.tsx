"use client";
import { useActionState } from "react";
import Link from "next/link";
import { TIPOS_PESSOA, REGIMES } from "@/lib/tipos";
import { Campo, inputCls } from "@/components/ui/Campo";
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
            defaultValue={c.tipo_pessoa ?? ""}
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
        <Campo label="Razão social / Nome *">
          <input
            name="razao_social"
            required
            defaultValue={c.razao_social ?? ""}
            className={inputCls}
          />
        </Campo>
        <Campo label="Nome fantasia">
          <input name="nome_fantasia" defaultValue={c.nome_fantasia ?? ""} className={inputCls} />
        </Campo>
        <Campo label="CPF / CNPJ *">
          <input name="cpf_cnpj" required defaultValue={c.cpf_cnpj ?? ""} className={inputCls} />
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
            <input name="logradouro" defaultValue={end.logradouro ?? ""} className={inputCls} />
          </Campo>
          <Campo label="Número">
            <input name="numero" defaultValue={end.numero ?? ""} className={inputCls} />
          </Campo>
          <Campo label="Bairro">
            <input name="bairro" defaultValue={end.bairro ?? ""} className={inputCls} />
          </Campo>
          <Campo label="Cidade">
            <input name="cidade" defaultValue={end.cidade ?? ""} className={inputCls} />
          </Campo>
          <Campo label="UF">
            <input
              name="uf"
              maxLength={2}
              defaultValue={end.uf ?? ""}
              style={{ textTransform: "uppercase" }}
              className={inputCls}
            />
          </Campo>
          <Campo label="CEP">
            <input name="cep" defaultValue={end.cep ?? ""} className={inputCls} />
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

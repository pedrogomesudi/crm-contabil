"use client";
import { useActionState, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { TIPOS_PESSOA, REGIMES } from "@/lib/tipos";
import { inputCls } from "@/components/ui/Campo";
import { Secao } from "@/components/ui/Secao";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";
import { Botao } from "@/components/ui/Botao";
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
  const nomeContadorAtual = contadores.find((ct) => ct.id === c.contador_id)?.nome ?? "— sem atribuição —";

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
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
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
    // Antes: `max-w-2xl` (672px) num <main> sem mx-auto — usava 58% da largura e deixava o
    // vazio todo à direita. Agora a régua vem do Container e os campos declaram o span pela
    // natureza do dado (UF=1, CEP=2, logradouro=7), em vez de um grid-cols-2 uniforme.
    <form action={formAction} className="space-y-4">
      {/* concorrência otimista: o servidor confere contra o valor atual */}
      {modo === "editar" && c.atualizado_em && (
        <input type="hidden" name="atualizado_em" defaultValue={c.atualizado_em} />
      )}
      <Secao titulo="Cadastrais e fiscais" descricao="Identificação e enquadramento">
        <FormGrid>
          <FormCampo label="Tipo de pessoa *" span={2}>
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
          </FormCampo>
          <FormCampo label="CPF / CNPJ *" span={4}>
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
                  className="shrink-0 rounded-lg border border-linha px-3 text-sm hover:bg-creme disabled:opacity-60"
                >
                  {buscando ? "Buscando…" : "Buscar na Receita"}
                </button>
              )}
            </div>
            {msgBusca && (
              <p className={`mt-1 text-xs ${msgBusca.ok ? "text-verde" : "text-negativo"}`}>{msgBusca.texto}</p>
            )}
          </FormCampo>
          <FormCampo label="Razão social / Nome *" span={6}>
            <input
              name="razao_social"
              required
              value={f.razao_social}
              onChange={set("razao_social")}
              className={inputCls}
            />
          </FormCampo>
          <FormCampo label="Nome fantasia" span={5}>
            <input name="nome_fantasia" value={f.nome_fantasia} onChange={set("nome_fantasia")} className={inputCls} />
          </FormCampo>
          <FormCampo label="Regime tributário *" span={3}>
            <select name="regime_tributario" required defaultValue={c.regime_tributario ?? ""} className={inputCls}>
              <option value="" disabled>
                Selecione
              </option>
              {REGIMES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormCampo>
          <FormCampo label="Inscrição estadual" span={2}>
            <input name="inscricao_estadual" defaultValue={c.inscricao_estadual ?? ""} className={inputCls} />
          </FormCampo>
          <FormCampo label="Inscrição municipal" span={2}>
            <input name="inscricao_municipal" defaultValue={c.inscricao_municipal ?? ""} className={inputCls} />
          </FormCampo>
        </FormGrid>
      </Secao>

      <Secao titulo="Contato e endereço">
        <FormGrid>
          <FormCampo label="E-mail" span={5}>
            <input name="email" type="email" defaultValue={c.email ?? ""} className={inputCls} />
          </FormCampo>
          <FormCampo label="Telefone / WhatsApp" span={3}>
            <input name="telefone" defaultValue={c.telefone ?? ""} className={inputCls} />
          </FormCampo>
          <FormCampo label="Responsável (contato)" span={4}>
            <input name="responsavel_nome" defaultValue={c.responsavel_nome ?? ""} className={inputCls} />
          </FormCampo>
          <FormCampo label="Logradouro" span={7}>
            <input name="logradouro" value={f.logradouro} onChange={set("logradouro")} className={inputCls} />
          </FormCampo>
          <FormCampo label="Número" span={2}>
            <input name="numero" value={f.numero} onChange={set("numero")} className={inputCls} />
          </FormCampo>
          <FormCampo label="Complemento" span={3}>
            <input name="complemento" value={f.complemento} onChange={set("complemento")} className={inputCls} />
          </FormCampo>
          <FormCampo label="Bairro" span={5}>
            <input name="bairro" value={f.bairro} onChange={set("bairro")} className={inputCls} />
          </FormCampo>
          <FormCampo label="Cidade" span={4}>
            <input name="cidade" value={f.cidade} onChange={set("cidade")} className={inputCls} />
          </FormCampo>
          <FormCampo label="UF" span={1}>
            <input
              name="uf"
              maxLength={2}
              value={f.uf}
              onChange={set("uf")}
              style={{ textTransform: "uppercase" }}
              className={inputCls}
            />
          </FormCampo>
          <FormCampo label="CEP" span={2}>
            <input name="cep" value={f.cep} onChange={set("cep")} className={inputCls} />
          </FormCampo>
        </FormGrid>
      </Secao>

      <Secao titulo="Representante legal" descricao="Usado na geração do contrato">
        <FormGrid>
          <FormCampo label="Nacionalidade" span={3}>
            <input
              name="rep_nacionalidade"
              defaultValue={(c.representante ?? {}).nacionalidade ?? ""}
              className={inputCls}
            />
          </FormCampo>
          <FormCampo label="Estado civil" span={3}>
            <input
              name="rep_estado_civil"
              defaultValue={(c.representante ?? {}).estado_civil ?? ""}
              className={inputCls}
            />
          </FormCampo>
          <FormCampo label="Profissão" span={3}>
            <input name="rep_profissao" defaultValue={(c.representante ?? {}).profissao ?? ""} className={inputCls} />
          </FormCampo>
          <FormCampo label="RG" span={3}>
            <input name="rep_rg" defaultValue={(c.representante ?? {}).rg ?? ""} className={inputCls} />
          </FormCampo>
          <FormCampo label="CPF do representante" span={3}>
            <input name="rep_cpf" defaultValue={(c.representante ?? {}).cpf ?? ""} className={inputCls} />
          </FormCampo>
        </FormGrid>
      </Secao>

      <Secao titulo="Gestão interna">
        <FormGrid>
          <FormCampo label="Contador responsável" span={5}>
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
              <p className="rounded border border-linha bg-creme px-3 py-2 text-cinza">{nomeContadorAtual}</p>
            )}
          </FormCampo>
          <FormCampo label="Início do contrato" span={3}>
            <input name="data_inicio" type="date" defaultValue={c.data_inicio ?? ""} className={inputCls} />
          </FormCampo>
          {modo === "editar" && (
            <FormCampo label="Status" span={4}>
              <select name="status" defaultValue={c.status ?? "ativo"} className={inputCls}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </FormCampo>
          )}
          <FormCampo label="Observações" span={12}>
            <textarea
              name="observacoes"
              rows={3}
              maxLength={2000}
              defaultValue={c.observacoes ?? ""}
              className={inputCls}
            />
          </FormCampo>
        </FormGrid>
      </Secao>

      {estado.erro && (
        <div role="alert" className="text-sm text-negativo">
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
        <Botao type="submit" variante="primario" disabled={pending} aria-busy={pending}>
          {pending ? "Salvando..." : modo === "novo" ? "Cadastrar" : "Salvar"}
        </Botao>
        <Link href="/clientes" className="rounded-lg border border-linha px-4 py-2 text-sm text-cinza hover:bg-creme">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

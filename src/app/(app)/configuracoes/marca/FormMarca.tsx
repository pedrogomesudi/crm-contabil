"use client";
import { useActionState } from "react";
import Image from "next/image";
import { salvarMarca, salvarLogo, type EstadoMarca } from "./actions";

const input = "mt-1 w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto";

type Marca = {
  nome: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: Record<string, string> | null;
} | null;

export function FormMarca({ marca, logoUrl }: { marca: Marca; logoUrl: string | null }) {
  const [estado, salvar, pend] = useActionState<EstadoMarca, FormData>(salvarMarca, {});
  const [estLogo, subirLogo, pendLogo] = useActionState<EstadoMarca, FormData>(salvarLogo, {});
  const e = marca?.endereco ?? {};

  return (
    <div className="space-y-6">
      <form action={salvar} className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2 block">
          Nome
          <input name="nome" defaultValue={marca?.nome ?? ""} className={input} />
        </label>
        <label className="block">
          CNPJ
          <input name="cnpj" defaultValue={marca?.cnpj ?? ""} className={input} />
        </label>
        <label className="block">
          Telefone
          <input name="telefone" defaultValue={marca?.telefone ?? ""} className={input} />
        </label>
        <label className="col-span-2 block">
          E-mail
          <input name="email" defaultValue={marca?.email ?? ""} className={input} />
        </label>
        <label className="block">
          Logradouro
          <input name="logradouro" defaultValue={e.logradouro ?? ""} className={input} />
        </label>
        <label className="block">
          Número
          <input name="numero" defaultValue={e.numero ?? ""} className={input} />
        </label>
        <label className="block">
          Bairro
          <input name="bairro" defaultValue={e.bairro ?? ""} className={input} />
        </label>
        <label className="block">
          Cidade
          <input name="cidade" defaultValue={e.cidade ?? ""} className={input} />
        </label>
        <label className="block">
          UF
          <input name="uf" maxLength={2} defaultValue={e.uf ?? ""} className={input} />
        </label>
        <label className="block">
          CEP
          <input name="cep" defaultValue={e.cep ?? ""} className={input} />
        </label>
        <div className="col-span-2 flex items-center gap-3">
          <button disabled={pend} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
            {pend ? "Salvando…" : "Salvar marca"}
          </button>
          {estado.ok && <span className="text-xs text-verde">Salvo ✓</span>}
          {estado.erro && (
            <span role="alert" className="text-xs text-negativo">
              {estado.erro}
            </span>
          )}
        </div>
      </form>

      <form action={subirLogo} className="space-y-2 rounded-lg border border-linha p-3 text-sm">
        <p className="font-medium text-texto">Logo</p>
        {logoUrl && (
          <Image
            src={logoUrl}
            alt="Logo do escritório"
            width={160}
            height={64}
            className="max-h-16 w-auto object-contain"
            unoptimized
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" name="logo" accept="image/png,image/jpeg" className="text-xs" />
          <button disabled={pendLogo} className="rounded-lg border border-linha px-3 py-1.5 disabled:opacity-60">
            {pendLogo ? "Enviando…" : "Enviar logo"}
          </button>
          {estLogo.ok && <span className="text-xs text-verde">Logo salvo ✓</span>}
          {estLogo.erro && (
            <span role="alert" className="text-xs text-negativo">
              {estLogo.erro}
            </span>
          )}
        </div>
        <p className="text-xs text-cinza">PNG ou JPG, até 2 MB.</p>
      </form>
    </div>
  );
}

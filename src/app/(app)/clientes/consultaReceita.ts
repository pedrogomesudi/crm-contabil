"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { consultarCnpj, type EnderecoReceita } from "@/lib/receita/brasilapi";

export type DadosFormReceita = {
  ok?: boolean;
  erro?: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  situacao?: string | null;
  endereco?: EnderecoReceita;
};

// Consulta um CNPJ na Receita (BrasilAPI + fallback ReceitaWS) e devolve os
// dados para PREENCHER o formulário de cadastro (não grava nada). Read-only,
// gateado a quem pode cadastrar cliente.
export async function consultarCnpjParaFormulario(cnpj: string): Promise<DadosFormReceita> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const doc = String(cnpj ?? "").replace(/\D/g, "");
  if (doc.length !== 14) return { erro: "Informe um CNPJ com 14 dígitos." };
  const r = await consultarCnpj(doc);
  if (r.erro || !r.dados) return { erro: r.erro ?? "Sem dados." };
  return {
    ok: true,
    razaoSocial: r.dados.razaoSocial,
    nomeFantasia: r.dados.nomeFantasia,
    situacao: r.dados.situacao,
    endereco: r.dados.endereco,
  };
}

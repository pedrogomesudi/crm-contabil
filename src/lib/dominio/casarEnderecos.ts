import type { EnderecoDominio, EnderecoImportado } from "./parseEnderecos";

export type ClienteEndereco = { cpf_cnpj: string; temEndereco: boolean };
export type ResultadoCasamento = {
  paraGravar: { cpf_cnpj: string; endereco: EnderecoDominio }[];
  vaziosPreenchidos: number; // estavam sem endereço → serão preenchidos
  jaComEnderecoMantidos: number; // já tinham endereço → NÃO serão tocados (sobrescrever=false)
  jaComEnderecoAtualizados: number; // já tinham endereço → serão sobrescritos (sobrescrever=true)
  semClienteNoArquivo: number; // empresa do arquivo sem cliente correspondente
};

// Casa os endereços do arquivo com os clientes por CNPJ. Sem sobrescrever, só
// preenche quem está sem endereço (não-destrutivo). Com sobrescrever, atualiza
// também os que já têm.
export function casarEnderecos(
  lista: EnderecoImportado[],
  clientes: ClienteEndereco[],
  sobrescrever: boolean,
): ResultadoCasamento {
  const porCnpj = new Map(clientes.map((c) => [c.cpf_cnpj, c.temEndereco]));
  const r: ResultadoCasamento = {
    paraGravar: [],
    vaziosPreenchidos: 0,
    jaComEnderecoMantidos: 0,
    jaComEnderecoAtualizados: 0,
    semClienteNoArquivo: 0,
  };
  for (const e of lista) {
    if (!porCnpj.has(e.cnpj)) {
      r.semClienteNoArquivo++;
      continue;
    }
    const temEndereco = porCnpj.get(e.cnpj);
    if (!temEndereco) {
      r.paraGravar.push({ cpf_cnpj: e.cnpj, endereco: e.endereco });
      r.vaziosPreenchidos++;
    } else if (sobrescrever) {
      r.paraGravar.push({ cpf_cnpj: e.cnpj, endereco: e.endereco });
      r.jaComEnderecoAtualizados++;
    } else {
      r.jaComEnderecoMantidos++;
    }
  }
  return r;
}

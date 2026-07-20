// Monta o endereço do tomador a partir dos campos do formulário de emissão
// "cliente como emitente". A chave do IBGE é `codigo_municipio` — a MESMA que
// montarDps() lê (src/lib/nfse/dps.ts). Usar `cMun` fazia o código do município
// do tomador ser ignorado e cair no município do PRESTADOR, gerando a rejeição
// E0240 do SEFIN (CEP de um município + cMun de outro).
export function enderecoTomadorDoForm(get: (campo: string) => string): Record<string, string> {
  return {
    cep: get("tom_cep").replace(/\D/g, ""),
    logradouro: get("tom_logradouro").trim(),
    numero: get("tom_numero").trim(),
    bairro: get("tom_bairro").trim(),
    cidade: get("tom_cidade").trim(),
    uf: get("tom_uf").trim().toUpperCase().slice(0, 2),
    codigo_municipio: get("tom_cmun").trim(),
  };
}

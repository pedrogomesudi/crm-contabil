import type { TipoPessoa } from "@/lib/tipos";

export function validarCPF(valor: string): boolean {
  const cpf = valor.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (i: number) => cpf.charCodeAt(i) - 48;
  const calc = (fim: number) => {
    let soma = 0;
    for (let i = 0; i < fim; i++) soma += dig(i) * (fim + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === dig(9) && calc(10) === dig(10);
}

export function validarCNPJ(valor: string): boolean {
  const cnpj = valor.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dig = (i: number) => cnpj.charCodeAt(i) - 48;
  const calc = (fim: number) => {
    const pesos =
      fim === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, peso, i) => acc + peso * dig(i), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === dig(12) && calc(13) === dig(13);
}

export function validarDocumento(tipo: TipoPessoa, valor: string): boolean {
  return tipo === "PF" ? validarCPF(valor) : validarCNPJ(valor);
}

import { FAIXAS_FATURAMENTO } from "@/lib/financeiro/tipos";

export type ExtensaoFinanceira = {
  dia_vencimento: number | null;
  qtd_funcionarios: number | null;
  faixa_faturamento: string | null;
  data_saida: string | null;
  indice_reajuste: string | null;
  percentual_reajuste: number | null;
  tem_honorarios_recorrentes: boolean;
};

const INDICES_REAJUSTE = ["SALARIO_MINIMO", "IPCA", "IGPM", "INPC", "PERCENTUAL_FIXO", "SEM_REAJUSTE"];

// Extrai e valida os campos financeiros da ficha do cliente (RF-006/RF-007).
// Retorna { erro } quando algum valor é inválido; caso contrário, o registro
// pronto para o upsert em clientes_financeiro. Campos vazios viram null.
export function normalizarExtensaoFinanceira(fd: FormData): ExtensaoFinanceira | { erro: string } {
  const diaRaw = String(fd.get("dia_vencimento") ?? "").trim();
  const qtdRaw = String(fd.get("qtd_funcionarios") ?? "").trim();
  const faixaRaw = String(fd.get("faixa_faturamento") ?? "").trim();
  const dataRaw = String(fd.get("data_saida") ?? "").trim();

  let dia_vencimento: number | null = null;
  if (diaRaw) {
    const n = Number(diaRaw);
    if (!Number.isInteger(n) || n < 1 || n > 28) {
      return { erro: "Dia de vencimento deve estar entre 1 e 28." };
    }
    dia_vencimento = n;
  }
  let qtd_funcionarios: number | null = null;
  if (qtdRaw) {
    const n = Number(qtdRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { erro: "Quantidade de funcionários inválida." };
    }
    qtd_funcionarios = n;
  }
  let faixa_faturamento: string | null = null;
  if (faixaRaw) {
    if (!(FAIXAS_FATURAMENTO as readonly string[]).includes(faixaRaw)) {
      return { erro: "Faixa de faturamento inválida." };
    }
    faixa_faturamento = faixaRaw;
  }
  const indiceRaw = String(fd.get("indice_reajuste") ?? "").trim();
  const indice_reajuste = INDICES_REAJUSTE.includes(indiceRaw) ? indiceRaw : "SALARIO_MINIMO";
  const pctRaw = String(fd.get("percentual_reajuste") ?? "")
    .trim()
    .replace(",", ".");
  let percentual_reajuste: number | null = null;
  if (indice_reajuste === "PERCENTUAL_FIXO" && pctRaw) {
    const n = Number(pctRaw);
    if (Number.isFinite(n) && n >= 0) percentual_reajuste = n;
  }

  return {
    dia_vencimento,
    qtd_funcionarios,
    faixa_faturamento,
    data_saida: dataRaw || null,
    indice_reajuste,
    percentual_reajuste,
    tem_honorarios_recorrentes: fd.get("tem_honorarios_recorrentes") != null,
  };
}

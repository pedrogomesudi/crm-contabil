"use client";
import { controleCls } from "@/components/ui/Campo";
import type { SelecaoGrupo } from "@/lib/financeiro/titulos";

// Seletor de grupo de cobrança da tela de contas a receber. Não se renderiza quando a
// competência carregada não tem nenhum título em grupo (seria um select de opção única).
export function FiltroGrupo({
  grupos,
  valor,
  onMudar,
}: {
  grupos: { id: string; nome: string }[];
  valor: SelecaoGrupo;
  onMudar: (v: SelecaoGrupo) => void;
}) {
  if (grupos.length === 0) return null;
  return (
    <select
      aria-label="Grupo de empresas"
      value={valor}
      onChange={(e) => onMudar(e.target.value as SelecaoGrupo)}
      className={`${controleCls("compacto")} ml-1`}
    >
      <option value="TODOS">Todos os grupos</option>
      {grupos.map((g) => (
        <option key={g.id} value={g.id}>
          {g.nome}
        </option>
      ))}
      <option value="SEM_GRUPO">Sem grupo</option>
    </select>
  );
}

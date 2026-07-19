import { controleCls } from "@/components/ui/Campo";
import type { CampoDef } from "@/lib/clientes/campos-custom";

export function CamposComplementares({ campos, valores }: { campos: CampoDef[]; valores: Record<string, unknown> }) {
  if (campos.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {campos.map((c) => {
        const nome = `custom_${c.id}`;
        const atual = valores[c.id];
        const label = (
          <span className="text-sm text-cinza">
            {c.nome}
            {c.obrigatorio && " *"}
          </span>
        );
        if (c.tipo === "booleano") {
          return (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" name={nome} defaultChecked={atual === true} />
              {label}
            </label>
          );
        }
        return (
          <label key={c.id} className="flex flex-col gap-1">
            {label}
            {c.tipo === "lista" ? (
              <select name={nome} defaultValue={typeof atual === "string" ? atual : ""} className={controleCls()}>
                <option value="">—</option>
                {c.opcoes.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={nome}
                type={c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : "text"}
                defaultValue={atual == null ? "" : String(atual)}
                className={controleCls()}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

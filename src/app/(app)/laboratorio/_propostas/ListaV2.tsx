import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { Badge } from "@/components/ui/Badge";
import { Iniciais } from "@/components/ui/Iniciais";
import { formatarDocumento } from "@/lib/format";
import { badgeRegime } from "@/lib/ui/apresentacao";
import { CLIENTES_FICTICIOS } from "../_dados";

// A lista usa `padding={false}`: é o card full-bleed (tabela colada na borda), o padrão
// dominante do sistema. O `overflow-hidden` da Secao recorta a tabela nos cantos.
type Situacao = { rotulo: string; variante: "positivo" | "atencao" | "neutro" };

const INATIVO: Situacao = { rotulo: "Inativo", variante: "neutro" };
const SITUACAO: Record<string, Situacao> = {
  ativo: { rotulo: "Ativo", variante: "positivo" },
  em_constituicao: { rotulo: "Em constituição", variante: "atencao" },
  inativo: INATIVO,
};

const TH = "px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro";

export function ListaV2() {
  return (
    <Container>
      <Secao titulo="Clientes" descricao={`${CLIENTES_FICTICIOS.length} na carteira`} padding={false}>
        <table className="w-full text-sm">
          <caption className="sr-only">Lista de clientes</caption>
          <thead>
            <tr className="border-b border-linha bg-creme/60 text-left">
              <th className={TH}>Cliente</th>
              <th className={TH}>Regime</th>
              <th className={`${TH} text-right`}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {CLIENTES_FICTICIOS.map((c) => {
              const s = SITUACAO[c.status] ?? INATIVO;
              return (
                <tr key={c.id} className="border-b border-linha/70 transition-colors last:border-0 hover:bg-creme">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Iniciais nome={c.razao_social} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-texto">{c.razao_social}</p>
                        <p className="font-mono text-xs text-cinza-claro">
                          {c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj) : "— sem CNPJ"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.regime_tributario ? (
                      <Badge variante={badgeRegime(c.regime_tributario)}>{c.regime_tributario}</Badge>
                    ) : (
                      <span className="text-cinza-claro">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variante={s.variante}>{s.rotulo}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Secao>
    </Container>
  );
}

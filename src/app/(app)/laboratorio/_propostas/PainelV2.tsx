import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";

const VENCENDO = [
  { cliente: "ACME Indústria e Comércio Ltda", item: "Certificado A1", dias: 12, severidade: "critico" },
  { cliente: "Beta Serviços ME", item: "Procuração RFB", dias: 28, severidade: "alerta" },
  { cliente: "Gama Transportes S.A.", item: "Certificado A1", dias: 45, severidade: "aviso" },
];

const VARIANTE: Record<string, "negativo" | "atencao" | "neutro"> = {
  critico: "negativo",
  alerta: "atencao",
  aviso: "neutro",
};

export function PainelV2() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard rotulo="MRR" valor="R$ 36.000,00" variante="positivo" />
          <StatCard rotulo="Clientes ativos" valor={99} />
          <StatCard rotulo="Ticket médio" valor="R$ 363,64" variante="destaque" />
          <StatCard rotulo="Churn" valor="0,0%" />
        </div>

        <Secao titulo="A vencer em 60 dias" descricao="Certificados e procurações" padding={false}>
          <table className="w-full text-sm">
            <caption className="sr-only">Itens a vencer</caption>
            <tbody>
              {VENCENDO.map((v) => (
                <tr
                  key={`${v.cliente}-${v.item}`}
                  className="border-b border-linha/70 transition-colors last:border-0 hover:bg-creme"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-texto">{v.cliente}</p>
                    <p className="text-xs text-cinza">{v.item}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variante={VARIANTE[v.severidade] ?? "neutro"}>{v.dias} dias</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      </div>
    </Container>
  );
}

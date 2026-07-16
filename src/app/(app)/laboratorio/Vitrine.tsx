import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { CLIENTE_FICTICIO, CONTADORES_FICTICIOS } from "./_dados";
import { FormClienteV2 } from "./_propostas/FormClienteV2";
import { FichaV2 } from "./_propostas/FichaV2";
import { ListaV2 } from "./_propostas/ListaV2";
import { PainelV2 } from "./_propostas/PainelV2";
import { AntesCadastro, AntesLista, AntesPainel } from "./_propostas/Antes";

const TELAS = [
  { chave: "cadastro", rotulo: "Cadastro de cliente" },
  { chave: "ficha", rotulo: "Ficha (19 seções → abas)" },
  { chave: "lista", rotulo: "Lista de clientes" },
  { chave: "painel", rotulo: "Dashboard" },
];

export function Vitrine({ tela, modo, aba }: { tela: string; modo: string; aba: string }) {
  const link = (t: string, m: string) => `/laboratorio?tela=${t}&modo=${m}`;
  const depois = modo === "depois";

  return (
    <div className="space-y-4">
      <Container>
        <div className="rounded-2xl border border-atencao/30 bg-atencao-fundo px-4 py-3">
          <p className="text-sm text-atencao">
            <strong>Laboratório temporário.</strong> Nada aqui é real: os dados são fictícios, os formulários não
            salvam, e a tela sai do sistema quando o padrão for aprovado.
          </p>
        </div>
      </Container>

      <Container>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Telas" className="flex flex-wrap gap-1">
            {TELAS.map((t) => (
              <Link
                key={t.chave}
                href={link(t.chave, modo)}
                aria-current={t.chave === tela ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  t.chave === tela ? "bg-tinta text-creme" : "text-cinza hover:bg-creme"
                }`}
              >
                {t.rotulo}
              </Link>
            ))}
          </nav>
          <div className="flex rounded-lg border border-linha bg-white p-0.5 text-sm">
            {["antes", "depois"].map((m) => (
              <Link
                key={m}
                href={link(tela, m)}
                aria-current={m === modo ? "page" : undefined}
                className={`rounded px-3 py-1 transition-colors ${
                  m === modo ? "bg-verde font-medium text-white" : "text-cinza hover:text-texto"
                }`}
              >
                {m}
              </Link>
            ))}
          </div>
        </div>
      </Container>

      {tela === "cadastro" &&
        (depois ? <FormClienteV2 cliente={CLIENTE_FICTICIO} contadores={CONTADORES_FICTICIOS} /> : <AntesCadastro />)}

      {tela === "ficha" &&
        (depois ? (
          <FichaV2 aba={aba} />
        ) : (
          <Container>
            <div className="rounded-2xl border border-dashed border-linha bg-white p-5">
              <p className="text-sm text-cinza">
                Hoje a ficha empilha <strong>19 seções</strong> numa coluna só (~330 linhas), com três larguras brigando
                na mesma página: formulário 672px, notas fiscais 896px, outras full-width — a borda direita desce
                serrilhada. Onze desses dezenove domínios também existem como rota própria em outro lugar do sistema.
              </p>
            </div>
          </Container>
        ))}

      {tela === "lista" && (depois ? <ListaV2 /> : <AntesLista />)}
      {tela === "painel" && (depois ? <PainelV2 /> : <AntesPainel />)}
    </div>
  );
}

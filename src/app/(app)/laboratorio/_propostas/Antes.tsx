// Réplicas ESTÁTICAS do layout de hoje, para a comparação ser honesta. São estáticas de
// propósito: os componentes reais exigem `action`/server actions, e a vitrine não salva —
// arrastá-los para cá traria o useActionState e a busca na Receita junto. O que se compara
// aqui é o LAYOUT (largura, grid, ritmo), e ele é reproduzido fielmente.

const INPUT_HOJE = "w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto";

function CampoHoje({ label, valor }: { label: string; valor: string }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="block text-xs font-medium text-cinza">{label}</span>
      <input readOnly value={valor} className={INPUT_HOJE} />
    </label>
  );
}

// FormCliente.tsx:98 — `max-w-2xl` (672px) num <main> de ~1168px, sem mx-auto: usa 58% e
// deixa ~496px vazios, sempre à direita. Os fieldsets usam rounded-lg + p-4 (o Card do
// design system usa rounded-2xl + p-5 — dois raios para o mesmo conceito).
export function AntesCadastro() {
  return (
    <div className="px-4">
      <p className="mb-3 text-xs text-cinza-claro">
        Hoje: 672px de ~1168px (58%), colado à esquerda. O endereço vai num grid uniforme de 2 colunas — a UF recebe a
        mesma largura de &quot;Logradouro&quot; —, e no celular ele continua em 2 colunas.
      </p>
      <div className="max-w-2xl space-y-6">
        <fieldset className="space-y-3 rounded-lg border border-linha bg-white p-4">
          <legend className="px-1 font-display text-sm font-semibold">Cadastrais e fiscais</legend>
          <CampoHoje label="Razão social / Nome" valor="ACME Indústria e Comércio Ltda" />
          <CampoHoje label="Nome fantasia" valor="ACME" />
          <div className="grid grid-cols-2 gap-3">
            <CampoHoje label="Inscrição estadual" valor="123.456.789.000" />
            <CampoHoje label="Inscrição municipal" valor="98765" />
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border border-linha bg-white p-4">
          <legend className="px-1 font-display text-sm font-semibold">Contato</legend>
          <div className="grid grid-cols-2 gap-3">
            <CampoHoje label="E-mail" valor="financeiro@acme.com.br" />
            <CampoHoje label="Telefone" valor="(34) 9 9988-7766" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CampoHoje label="Logradouro" valor="Avenida Rondon Pacheco" />
            <CampoHoje label="Número" valor="1200" />
            <CampoHoje label="Complemento" valor="Sala 12" />
            <CampoHoje label="Bairro" valor="Tibery" />
            <CampoHoje label="Cidade" valor="Uberlândia" />
            <CampoHoje label="UF" valor="MG" />
            <CampoHoje label="CEP" valor="38400000" />
          </div>
        </fieldset>
      </div>
    </div>
  );
}

// clientes/page.tsx — full-width sem régua nem mx-auto; título inline (não usa PageHeader).
export function AntesLista() {
  return (
    <div className="px-4">
      <p className="mb-3 text-xs text-cinza-claro">
        Hoje: full-width sem régua e sem mx-auto — em telas largas a tabela estica sem limite. Card e tabela escritos à
        mão (o padrão se repete em ~45 arquivos).
      </p>
      <div className="overflow-hidden rounded-2xl border border-linha bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">Lista de clientes (layout atual)</caption>
          <thead>
            <tr className="border-b border-linha bg-creme/60 text-left">
              <th className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                Cliente
              </th>
              <th className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                Regime
              </th>
              <th className="px-4 py-3 text-right font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                Situação
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-linha/70">
              <td className="px-4 py-3 font-medium text-texto">ACME Indústria e Comércio Ltda</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-verde/10 px-2.5 py-0.5 text-xs text-verde">Simples</span>
              </td>
              <td className="px-4 py-3 text-right text-sm text-cinza">Ativo</td>
            </tr>
            <tr className="border-b border-linha/70">
              <td className="px-4 py-3 font-medium text-texto">Delta Consultoria</td>
              <td className="px-4 py-3 text-cinza-claro">—</td>
              <td className="px-4 py-3 text-right">
                {/* o amber que vaza do Tailwind: 55 ocorrências no sistema, fora do brand kit */}
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-800">Em constituição</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// (app)/page.tsx — full-width, sem régua.
export function AntesPainel() {
  return (
    <div className="px-4">
      <p className="mb-3 text-xs text-cinza-claro">
        Hoje: cartões sem elevação (só hairline sobre creme) e sem régua de largura.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["MRR", "R$ 36.000,00"],
          ["Clientes ativos", "99"],
          ["Ticket médio", "R$ 363,64"],
          ["Churn", "0,0%"],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-2xl border border-linha bg-white p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-wide text-cinza-claro">{rotulo}</p>
            <p className="mt-1 font-display text-2xl font-bold text-texto">{valor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

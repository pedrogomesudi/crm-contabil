export type EventoErroView = {
  id: string;
  criadoEm: string;
  mensagem: string;
  rota: string | null;
  metodo: string | null;
  digest: string | null;
  stack: string | null;
};

export function TabelaErros({ eventos }: { eventos: EventoErroView[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-linha bg-white">
      <table className="w-full text-sm">
        <thead className="bg-creme text-left text-cinza">
          <tr>
            <th className="p-2 font-medium">Quando</th>
            <th className="p-2 font-medium">Rota</th>
            <th className="p-2 font-medium">Método</th>
            <th className="p-2 font-medium">Mensagem</th>
            <th className="p-2 font-medium">Digest</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => (
            <tr key={e.id} className="border-t border-linha/70 align-top">
              <td className="whitespace-nowrap p-2 text-cinza">
                {new Date(e.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </td>
              <td className="p-2 text-cinza">{e.rota ?? "—"}</td>
              <td className="p-2 text-cinza">{e.metodo ?? "—"}</td>
              <td className="p-2">
                <details>
                  <summary className="cursor-pointer text-texto">{e.mensagem.slice(0, 120)}</summary>
                  <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap text-[11px] text-cinza">
                    {e.stack ?? "(sem stack)"}
                  </pre>
                </details>
              </td>
              <td className="whitespace-nowrap p-2 font-mono text-[11px] text-cinza-claro">{e.digest ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Signatario = { nome: string; papel: string; status: string };

export function StatusAssinatura({ status, signatarios }: { status: string; signatarios: Signatario[] }) {
  const assinados = signatarios.filter((s) => s.status === "assinado").length;
  const rotulo =
    status === "finalizado"
      ? "Finalizado ✓"
      : status === "recusado"
        ? "Recusado ✗"
        : `Aguardando (${assinados}/${signatarios.length})`;
  return (
    <div className="text-xs">
      <span className="font-medium">{rotulo}</span>
      <ul className="mt-1 text-slate-600">
        {signatarios.map((s) => (
          <li key={s.nome + s.papel}>
            {s.papel}: {s.nome} — {s.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

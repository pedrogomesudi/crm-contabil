import { ENDPOINTS } from "@/lib/api/openapi";

export const metadata = { title: "SALDO API — Documentação" };

export default function DocsPage() {
  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "32px 20px",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.5,
      }}
    >
      <h1>SALDO API</h1>
      <p>
        API pública em <code>/api/v1</code>. Autentique com o header <code>Authorization: Bearer &lt;api_key&gt;</code>{" "}
        (chaves em Configurações → API pública). Especificação importável em{" "}
        <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 24 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px 6px" }}>Método</th>
            <th style={{ padding: "8px 6px" }}>Caminho</th>
            <th style={{ padding: "8px 6px" }}>Escopo</th>
            <th style={{ padding: "8px 6px" }}>Descrição</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map((e) => (
            <tr key={`${e.metodo} ${e.caminho}`} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
              <td style={{ padding: "8px 6px", fontWeight: 600 }}>{e.metodo}</td>
              <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, monospace" }}>/api/v1{e.caminho}</td>
              <td style={{ padding: "8px 6px", color: "#666" }}>{e.escopo ?? "—"}</td>
              <td style={{ padding: "8px 6px" }}>
                {e.resumo}
                {e.params && e.params.length > 0 && (
                  <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                    {e.params.map((p) => `${p.nome} (${p.em})`).join(", ")}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

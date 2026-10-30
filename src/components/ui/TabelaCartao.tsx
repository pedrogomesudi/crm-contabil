// Envolve uma <table> para que ela role de lado no desktop e vire cartões abaixo de 768px.
// O comportamento do cartão está em globals.css (.tabela-cartao); aqui só a aplicação.
// Cada <td> da tabela envolvida deve declarar data-rotulo com o nome da sua coluna — sem
// isso o valor aparece no cartão sem dizer do que é.
export function TabelaCartao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`tabela-cartao overflow-x-auto ${className}`}>{children}</div>;
}

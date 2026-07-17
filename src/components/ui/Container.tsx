// A régua de largura do sistema. Antes havia 9 valores de max-w-* espalhados por 74
// lugares e nenhum mx-auto — o conteúdo ficava colado à esquerda, com o vazio todo de
// um lado. Três decisões, declaradas por tela.
const LARGURAS = {
  estreita: "max-w-[720px]", // formulário focado, login
  padrao: "max-w-[1280px]", // a maioria das telas
  larga: "max-w-full", // tabelões, calendário, kanban
} as const;

export function Container({
  largura = "padrao",
  className = "",
  children,
}: {
  largura?: keyof typeof LARGURAS;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`mx-auto w-full ${LARGURAS[largura]} ${className}`}>{children}</div>;
}

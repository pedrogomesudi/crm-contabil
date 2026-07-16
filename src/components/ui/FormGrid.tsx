import { Campo } from "@/components/ui/Campo";

// Grid de formulário em 12 colunas. O span vem da NATUREZA do dado (UF=1, CEP=2,
// logradouro=7), não de uma divisão uniforme: o grid-cols-2 que havia antes dava à UF a
// mesma largura da razão social. No mobile tudo vira 1 coluna — os 40 grid-cols-2 do
// sistema não tinham breakpoint e espremiam a tela do celular.
export function FormGrid({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 gap-4 md:grid-cols-12 ${className}`}>{children}</div>;
}

// Mapa com valores literais é OBRIGATÓRIO: o scanner estático do Tailwind 4 busca strings
// completas no código-fonte e não reconhece interpolações. Se alguém "simplificar" para
// `md:col-span-${span}`, os testes ainda passam (string fica no HTML), mas a classe não é
// gerada no build CSS — o layout quebra em produção, silenciosamente.
const SPANS: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};

export function FormCampo({
  label,
  span = 6,
  hint,
  erro,
  children,
}: {
  label: string;
  span?: number;
  hint?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={SPANS[span] ?? SPANS[6]}>
      <Campo label={label} hint={hint} erro={erro}>
        {children}
      </Campo>
    </div>
  );
}

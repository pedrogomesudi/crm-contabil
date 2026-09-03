import { exigirModulo } from "@/lib/planos/atual";

// Guard de plano: se a instância não tem este módulo, o acesso direto por URL cai na Início.
// O menu já esconde o item; isto é a defesa em profundidade (server-side).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("legalizacao");
  return <>{children}</>;
}

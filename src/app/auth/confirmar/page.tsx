import { AuthCard } from "@/components/auth/AuthCard";
import { ConfirmarForm, NovoLinkForm } from "./ConfirmarForm";

// O token de uso único NÃO é consumido aqui. Esta página só desenha o botão; quem verifica
// é a server action (POST). Pré-visualizadores de link e scanners de e-mail fazem GET e
// nunca POST, então o link sobrevive a eles — foi o preview do WhatsApp queimando o token
// antes do clique que deixou uma usuária sem acesso em 15/10/2026.
export const dynamic = "force-dynamic";
export const metadata = { title: "Confirmar acesso", robots: { index: false, follow: false } };

const TIPOS_OK = ["invite", "recovery"];

export default async function ConfirmarPage({
  searchParams,
}: {
  // Next 16: searchParams é uma Promise.
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const tokenHash = um(sp.token_hash);
  const type = um(sp.type);
  const code = um(sp.code);

  const temToken = Boolean(tokenHash) && TIPOS_OK.includes(type);
  const utilizavel = temToken || Boolean(code);

  return (
    <AuthCard titulo={utilizavel ? "Confirmar acesso" : "Link inválido"}>
      {utilizavel ? (
        <ConfirmarForm tokenHash={tokenHash} type={type} code={code} />
      ) : (
        <div className="space-y-4">
          <p className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">Este link expirou ou é inválido.</p>
          <NovoLinkForm titulo="Informe seu e-mail para receber um link novo." />
        </div>
      )}
    </AuthCard>
  );
}

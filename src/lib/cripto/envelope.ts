import "server-only";
import { cifrar, decifrar } from "@/lib/nfse/cripto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { masterKey } from "./master";
import { desembrulhar } from "./embrulho";
import { DOMINIOS, type Dominio } from "./dominios";

export { embrulhar, desembrulhar } from "./embrulho";

// Cache da DEK DESEMBRULHADA por processo. A rotação da mestra muda o `dek_cifrado`, não o
// valor da DEK — então o cache permanece válido após rotação (só um restart o esvazia).
const cacheDek = new Map<Dominio, string>();

export function limparCacheDek(): void {
  cacheDek.clear();
}

async function dekDoDominio(dominio: Dominio): Promise<string> {
  const emCache = cacheDek.get(dominio);
  if (emCache) return emCache;

  // 1) A DEK cifrada no banco (o caminho normal, pós-migração).
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("chave_dados").select("dek_cifrado").eq("dominio", dominio).maybeSingle();
    if (data?.dek_cifrado) {
      const dek = desembrulhar(data.dek_cifrado as string, masterKey());
      cacheDek.set(dominio, dek);
      return dek;
    }
  } catch {
    // Banco fora ou mestra ausente: tenta o fallback antes de desistir.
  }

  // 2) Fallback (transição): a chave direta do env, idêntica à DEK.
  const doEnv = process.env[DOMINIOS[dominio]];
  if (doEnv) {
    cacheDek.set(dominio, doEnv.toLowerCase());
    return doEnv.toLowerCase();
  }

  throw new Error(`cripto: sem DEK (chave_dados) nem chave de env para o domínio "${dominio}".`);
}

export async function cifrarDominio(dominio: Dominio, dados: Buffer): Promise<string> {
  return cifrar(dados, await dekDoDominio(dominio));
}

export async function decifrarDominio(dominio: Dominio, pacote: string): Promise<Buffer> {
  return decifrar(pacote, await dekDoDominio(dominio));
}

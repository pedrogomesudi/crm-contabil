// Os domínios de cifragem e a variável de ambiente de FALLBACK de cada um (a chave direta
// que existia antes do envelope). Durante a transição, se a DEK não carregar do banco,
// cai para essa chave — que tem o mesmo valor da DEK.
export type Dominio = "whatsapp" | "onboarding" | "boleto" | "email" | "nfse";

export const DOMINIOS: Record<Dominio, string> = {
  whatsapp: "WHATSAPP_CRIPTO_KEY",
  onboarding: "ONBOARDING_CRIPTO_KEY",
  boleto: "BOLETO_CRIPTO_KEY",
  email: "EMAIL_CRIPTO_KEY",
  nfse: "NFSE_CERT_KEY",
};

export const DOMINIOS_LISTA = Object.keys(DOMINIOS) as Dominio[];

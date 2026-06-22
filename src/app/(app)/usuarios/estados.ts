// Estado do formulário de convite. `link` é o action_link gerado (para o admin
// compartilhar manualmente enquanto o SMTP não está configurado).
export type EstadoConvite = { erro?: string; ok?: boolean; link?: string };

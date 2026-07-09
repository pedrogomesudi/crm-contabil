-- Notificações de obrigações: liga/desliga o badge de riscos no menu lateral.
alter table obrigacao_config add column if not exists riscos_badge_ativo boolean not null default true;

-- Perfil é 1:1 com auth.users (que já garante e-mail único). Reforça no nível de
-- usuarios para que lookups por e-mail sejam seguros (case-insensitive).
create unique index if not exists usuarios_email_key on usuarios (lower(email));

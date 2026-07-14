-- HARDENING das solicitações (achado de revisão de segurança).
--
-- Problema: `criado_por`/`autor_id` tinham apenas `default auth.uid()`. Um DEFAULT não
-- impede que a coluna seja ENVIADA explicitamente. Com um JWT válido, um usuário do portal
-- poderia falar direto com o PostgREST e:
--   * postar mensagem com autor_id de um usuário do ESCRITÓRIO (forjar uma resposta na
--     thread) — o mais grave;
--   * abrir solicitação com criado_por de terceiro;
--   * forjar prazo (SLA), responsavel_id e até tarefa_id, pois a policy de INSERT só
--     checava cliente_id e status.
--
-- Correção: os gatilhos abaixo SOBRESCREVEM esses campos no servidor, em vez de confiar
-- no que chega. A autoria passa a ser sempre auth.uid(); e, quando quem insere é um
-- CLIENTE, os campos de gestão (status/prazo/responsável/tarefa/número) são impostos aqui.

create or replace function solicitacao_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sla int;
begin
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    -- Autoria: quem está autenticado. (service_role — auth.uid() nulo — pode definir.)
    new.criado_por := coalesce(auth.uid(), new.criado_por);

    -- Se quem abre é o CLIENTE do portal, os campos de gestão são impostos pelo servidor.
    if auth_cliente_id() is not null and new.cliente_id = auth_cliente_id() then
      new.status := 'aberta';
      new.responsavel_id := null;
      new.tarefa_id := null;
      new.resolvida_em := null;
      new.numero := nextval('solicitacao_numero_seq');
      select solicitacao_sla_dias into v_sla from escritorio_config where id = 1;
      new.prazo := current_date + coalesce(greatest(v_sla, 0), 2);
    end if;
  end if;

  if new.status = 'resolvida' and new.resolvida_em is null then new.resolvida_em := now(); end if;
  if new.status <> 'resolvida' then new.resolvida_em := null; end if;
  return new;
end $$;

drop trigger if exists trg_solicitacao_integridade on solicitacao;
create trigger trg_solicitacao_integridade before insert or update on solicitacao
  for each row execute function solicitacao_integridade();

-- Mensagem: a autoria é SEMPRE de quem está autenticado. Ninguém (nem a equipe) posta
-- em nome de outro.
create or replace function solicitacao_mensagem_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := coalesce(auth.uid(), new.autor_id);
  return new;
end $$;

drop trigger if exists trg_solic_msg_integridade on solicitacao_mensagem;
create trigger trg_solic_msg_integridade before insert on solicitacao_mensagem
  for each row execute function solicitacao_mensagem_integridade();

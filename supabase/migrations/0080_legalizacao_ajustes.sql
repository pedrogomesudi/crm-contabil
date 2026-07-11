-- Legalização — ajustes de curadoria (pós v5.14.0):
-- (1) status "isenta" (tratado como conclusão de etapa);
-- (2) etapa DBE (Receita) entre Viabilidade e Registro nos modelos de abertura;
-- (3) etapa Alvará Sanitário (Vigilância) como última etapa nos modelos de abertura.

-- (1) Novo valor de status. IF NOT EXISTS torna idempotente; não é usado nesta migration.
alter type legalizacao_etapa_status add value if not exists 'isenta';

-- Trigger: "isenta" também marca a conclusão (audita concluido_em/por como uma baixa).
create or replace function legalizacao_etapa_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  if new.status in ('concluido','isenta') and new.concluido_em is null then
    new.concluido_em := now();
    new.concluido_por := auth.uid();
  end if;
  if new.status not in ('concluido','isenta') then
    new.concluido_em := null; new.concluido_por := null;
  end if;
  return new;
end $$;

-- (2)+(3) Re-semeia as etapas dos dois modelos de abertura (delete + insert = idempotente).
-- Só afeta NOVOS processos; instâncias já criadas são cópias e permanecem inalteradas.
do $$
declare t uuid;
begin
  select id into t from legalizacao_template where slug = 'abertura-simples';
  if t is not null then
    delete from legalizacao_template_etapa where template_id = t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Viabilidade de nome e endereço','prefeitura',2,'assistente',false,false),
      (t,2,'DBE — Documento Básico de Entrada','receita',3,'contador',false,false),
      (t,3,'Registro do contrato social','junta',5,'contador',true,false),
      (t,4,'Inscrição no CNPJ','receita',7,'contador',false,true),
      (t,5,'Inscrição municipal','prefeitura',12,'assistente',false,false),
      (t,6,'Opção pelo Simples Nacional','receita',15,'contador',false,true),
      (t,7,'Alvará de funcionamento','prefeitura',20,'assistente',true,false),
      (t,8,'Vistoria do Corpo de Bombeiros','bombeiros',25,'assistente',false,false),
      (t,9,'Alvará Sanitário','vigilancia',30,'assistente',false,false);
  end if;

  select id into t from legalizacao_template where slug = 'abertura-presumido';
  if t is not null then
    delete from legalizacao_template_etapa where template_id = t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Viabilidade de nome e endereço','prefeitura',2,'assistente',false,false),
      (t,2,'DBE — Documento Básico de Entrada','receita',3,'contador',false,false),
      (t,3,'Registro do contrato social','junta',5,'contador',true,false),
      (t,4,'Inscrição no CNPJ','receita',7,'contador',false,true),
      (t,5,'Inscrição estadual','sefaz',12,'contador',false,false),
      (t,6,'Inscrição municipal','prefeitura',12,'assistente',false,false),
      (t,7,'Alvará de funcionamento','prefeitura',20,'assistente',true,false),
      (t,8,'Vistoria do Corpo de Bombeiros','bombeiros',25,'assistente',false,false),
      (t,9,'Alvará Sanitário','vigilancia',30,'assistente',false,false);
  end if;
end $$;

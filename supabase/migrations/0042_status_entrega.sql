-- Read receipts: estados de entrega/leitura da mensagem OUT.
-- Só ADD VALUE (uso ocorre em runtime, outra transação) — seguro quanto ao gotcha do Postgres.
alter type whatsapp_status add value if not exists 'ENTREGUE';
alter type whatsapp_status add value if not exists 'LIDO';

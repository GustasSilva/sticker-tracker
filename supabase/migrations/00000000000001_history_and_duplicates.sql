-- Paridade com producao: coluna `duplicates` em user_progress + tabela history_events
-- (o schema.sql original nao tinha esses; producao tem)

-- Repetidas por figurinha
alter table user_progress
  add column if not exists duplicates integer not null default 0;

-- Histórico de eventos (marcações, trocas, aberturas de envelope, etc.)
create table if not exists history_events (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table history_events enable row level security;

create policy "users manage their own history"
  on history_events for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

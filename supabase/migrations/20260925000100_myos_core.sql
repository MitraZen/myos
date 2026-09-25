-- MYOS core cloud schema. All personal rows are private to one Supabase Auth user.

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in (
    'Capture', 'Knowledge', 'Idea', 'Project', 'Decision', 'Milestone',
    'Goal', 'Journal', 'Book', 'Resource', 'Task', 'Person'
  )),
  title text not null default '',
  original_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  event_date date,
  status text,
  importance smallint check (importance between 1 and 5),
  source text,
  project_status text check (project_status in (
    'Idea', 'Planning', 'Active', 'Paused', 'Completed', 'Cancelled', 'Archived'
  )),
  project_objective text,
  project_start_date date,
  project_target_date date,
  unique (user_id, id)
);

create index captures_user_created_idx on public.captures (user_id, created_at desc);
create index captures_user_type_created_idx on public.captures (user_id, type, created_at desc);
create index captures_user_updated_idx on public.captures (user_id, updated_at desc);
create index captures_content_search_idx on public.captures using gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(original_content, ''))
);

create function public.myos_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger captures_set_updated_at
before update on public.captures
for each row execute function public.myos_set_updated_at();

create table public.capture_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_capture_id uuid not null,
  target_capture_id uuid not null,
  relationship_type text not null check (length(trim(relationship_type)) between 1 and 48),
  created_at timestamptz not null default now(),
  check (source_capture_id <> target_capture_id),
  unique (user_id, source_capture_id, target_capture_id, relationship_type),
  foreign key (user_id, source_capture_id) references public.captures (user_id, id) on delete cascade,
  foreign key (user_id, target_capture_id) references public.captures (user_id, id) on delete cascade
);

create index capture_relations_source_idx on public.capture_relations (user_id, source_capture_id);
create index capture_relations_target_idx on public.capture_relations (user_id, target_capture_id);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('topic', 'tag')),
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, kind, name)
);

create table public.capture_labels (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  capture_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, capture_id, label_id),
  foreign key (user_id, capture_id) references public.captures (user_id, id) on delete cascade,
  foreign key (user_id, label_id) references public.labels (user_id, id) on delete cascade
);

create index capture_labels_label_idx on public.capture_labels (user_id, label_id);

create table public.capture_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  capture_id uuid not null,
  storage_path text not null,
  original_name text not null,
  mime_type text not null check (mime_type like 'image/%' or mime_type like 'audio/%'),
  size_bytes bigint not null check (size_bytes between 0 and 25165824),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path),
  foreign key (user_id, capture_id) references public.captures (user_id, id) on delete cascade
);

create index capture_attachments_capture_idx on public.capture_attachments (user_id, capture_id, created_at);

-- AI output is kept separate from original user-authored capture content.
create table public.capture_ai_metadata (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  capture_id uuid not null,
  ai_summary text,
  ai_topics jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_topics) = 'array'),
  ai_entities jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_entities) = 'array'),
  ai_relationships jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_relationships) = 'array'),
  model_name text,
  generated_at timestamptz,
  primary key (user_id, capture_id),
  foreign key (user_id, capture_id) references public.captures (user_id, id) on delete cascade
);

grant usage on schema public to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'captures',
    'capture_relations',
    'labels',
    'capture_labels',
    'capture_attachments',
    'capture_ai_metadata'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      'myos_owner_' || table_name,
      table_name
    );
  end loop;
end;
$$;

-- Attachments live in a private bucket. Paths follow:
-- <auth-user-id>/<capture-id>/<attachment-id>.<extension>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'myos-private',
  'myos-private',
  false,
  18874368,
  array[
    'image/webp', 'image/jpeg',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/opus',
    'audio/flac', 'audio/x-m4a', 'audio/m4a', 'audio/3gpp'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy myos_private_files_select_own
on storage.objects for select to authenticated
using (bucket_id = 'myos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy myos_private_files_insert_own
on storage.objects for insert to authenticated
with check (bucket_id = 'myos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy myos_private_files_update_own
on storage.objects for update to authenticated
using (bucket_id = 'myos-private' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'myos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy myos_private_files_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'myos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

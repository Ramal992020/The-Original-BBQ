-- ============================================================================
-- The Original BBQ — Supabase PostgreSQL schema
-- ----------------------------------------------------------------------------
-- شغّل الملف ده كامل في Supabase → SQL Editor (schema: public — الافتراضي).
--
-- التصميم:
--   * كل مجموعة بيانات ليها جدول حقيقي (الحسابات/الجلسات/الطلبات/الإشعارات/…).
--   * الصف بيحتفظ بالكائن الكامل في عمود data (jsonb) — نفس شكل البيانات اللي
--     التطبيق بيشتغل بيها — والأعمدة المهمة بتتكتب جنبه (trigger) عشان القيود
--     والفهارس: إيميل فريد، رقم طلب فريد، منع تكرار الطلب (user_id+request_id)،
--     هاش التوكن فريد… إلخ.
--   * كل الكتابات بتم من خلال دوال bbq_* الذرّية (RPC) بصلاحية service_role بس.
--   * RLS مفعّل على كل الجداول من غير أي policies → anon/authenticated مبيقدروش
--     يقروش ولا يكتبوا أي صفقة حتى لو اتجهت لهم مفاتيح anon بالغلط.
--     المفاتيح السرية (SUPABASE_SERVICE_ROLE_KEY) بتفضل على السيرفر بس.
--
-- ملاحظات:
--   * التطبيق مش بيستخدم Supabase Auth خالص — الحسابات والجلسات بتدار هنا
--     بنفس نظام كلمات السر scrypt الحالي (salt/hash فقط — مفيش نص صريح).
--   * bbq_lock = lease قفل موحّد بين النسخ العاملة (زي القفل في وضع Upstash)
--     عشان مفيش طلبين يكتبوا فوق بعض في نفس اللحظة.
--   * bbq_docs = جدول احتياطي لأي مجموعة مستقبلية مش ليها جدول مخصص.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- القفل ----
create table if not exists public.bbq_lock (
  id         text primary key,
  token      text not null,
  expires_at timestamptz not null
);

-- ============================================================ الجداول ======
-- seq: ترتيب الإدراج الأصلي (زي ترتيب المصفوفة في المخزين القديم).

create table if not exists public.bbq_users (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  email       text,              -- lower(data->>'email')
  role        text,              -- customer | supervisor | admin
  is_owner    boolean,
  active      boolean,
  created_at  text               -- ISO timestamp نصيًا (يتجنب اعتماد التوقيت على إعدادات المنطقة)
);

create table if not exists public.bbq_sessions (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  user_id     text,
  token_hash  text,              -- sha256 للتوكن — التوكن الصريح مش بيتحفظ
  expires_at  bigint             -- epoch ms
);

create table if not exists public.bbq_password_reset_tokens (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  user_id     text,
  token_hash  text,
  used        boolean,
  expires_at  bigint
);

create table if not exists public.bbq_login_attempts (
  seq         bigserial,
  id          text primary key,  -- الإيميل
  data        jsonb not null,
  at          bigint,
  n           integer
);

create table if not exists public.bbq_orders (
  seq            bigserial,
  id             text primary key,   -- BBQ-1001 …
  data           jsonb not null,
  number         integer,
  user_id        text,
  status         text,               -- new | received | preparing | on_way | delivered | cancelled
  payment_status text,               -- unpaid | pending | paid | failed | refunded
  request_id     text,               -- Idempotency-Key من العميل
  total          numeric,
  created_at     text
);

create table if not exists public.bbq_notifications (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  user_id     text,
  order_id    text,
  type        text,
  read        boolean,
  created_at  text
);

create table if not exists public.bbq_counters (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  value       bigint
);

create table if not exists public.bbq_settings (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null
);

create table if not exists public.bbq_menu (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  name        text,
  cat         text,
  sort        integer,
  active      boolean,
  available   boolean
);

create table if not exists public.bbq_categories (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  name        text,
  sort        integer,
  active      boolean
);

create table if not exists public.bbq_files (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,    -- { id, mime, size, b64, at } — صور مخزّنة في القاعدة
  mime        text,
  size        integer
);

create table if not exists public.bbq_payments (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null,
  order_id    text,
  status      text,
  created_at  text
);

create table if not exists public.bbq_whatsapp_log (
  seq         bigserial,
  id          text primary key,
  data        jsonb not null
);

-- احتياطي لأي مجموعة بيانات مستقبلية (أو قديمة) مش ليها جدول مخصص
create table if not exists public.bbq_docs (
  collection text not null,
  seq        bigserial,
  id         text not null,
  data       jsonb not null,
  primary key (collection, id)
);

-- ============================================================ الفهارس ======
-- إيميل فريد (case-insensitive) → حساب مكرر مستحيل حتى تحت سباق
create unique index if not exists bbq_users_email_key
  on public.bbq_users (email) where email is not null and email <> '';

create index if not exists bbq_users_role_idx on public.bbq_users (role);
create index if not exists bbq_users_active_idx on public.bbq_users (active);

create unique index if not exists bbq_sessions_token_key
  on public.bbq_sessions (token_hash) where token_hash is not null;
create index if not exists bbq_sessions_user_idx on public.bbq_sessions (user_id);
create index if not exists bbq_sessions_expires_idx on public.bbq_sessions (expires_at);

create index if not exists bbq_reset_user_idx on public.bbq_password_reset_tokens (user_id);
create index if not exists bbq_reset_token_idx on public.bbq_password_reset_tokens (token_hash);

-- رقم طلب فريد + منع تكرار الطلب عند إعادة المحاولة (Idempotency-Key)
create unique index if not exists bbq_orders_number_key
  on public.bbq_orders (number) where number is not null;
create unique index if not exists bbq_orders_request_key
  on public.bbq_orders (user_id, request_id) where request_id is not null;
create index if not exists bbq_orders_user_idx on public.bbq_orders (user_id, created_at desc);
create index if not exists bbq_orders_status_idx on public.bbq_orders (status);
create index if not exists bbq_orders_payment_idx on public.bbq_orders (payment_status);

create index if not exists bbq_notifications_user_idx
  on public.bbq_notifications (user_id, read, created_at desc);
create index if not exists bbq_notifications_order_idx on public.bbq_notifications (order_id);

create index if not exists bbq_menu_cat_idx on public.bbq_menu (cat, sort);
create index if not exists bbq_categories_sort_idx on public.bbq_categories (sort);
create index if not exists bbq_payments_order_idx on public.bbq_payments (order_id);

-- ================================================== أعمدة المراقبة (triggers)
-- الأعمدة المهمة بتتولّد من data مع كل كتابة، والقيود بتتطبق عليها.

create or replace function public.bbq_sync_users() returns trigger
language plpgsql as $$
begin
  new.email      := lower(nullif(new.data->>'email', ''));
  new.role       := new.data->>'role';
  new.is_owner   := coalesce((new.data->>'isOwner')::boolean, false);
  new.active     := coalesce((new.data->>'active')::boolean, true);
  new.created_at := new.data->>'createdAt';
  if new.role is not null and new.role not in ('customer', 'supervisor', 'admin') then
    raise exception 'bbq_users: دور غير معروف %', new.role;
  end if;
  return new;
end $$;

create or replace function public.bbq_sync_sessions() returns trigger
language plpgsql as $$
begin
  new.user_id    := new.data->>'userId';
  new.token_hash := nullif(new.data->>'tokenHash', '');
  new.expires_at := (new.data->>'expiresAt')::bigint;
  return new;
end $$;

create or replace function public.bbq_sync_reset_tokens() returns trigger
language plpgsql as $$
begin
  new.user_id    := new.data->>'userId';
  new.token_hash := nullif(new.data->>'tokenHash', '');
  new.used       := coalesce((new.data->>'used')::boolean, false);
  new.expires_at := (new.data->>'expiresAt')::bigint;
  return new;
end $$;

create or replace function public.bbq_sync_login_attempts() returns trigger
language plpgsql as $$
begin
  new.at := (new.data->>'at')::bigint;
  new.n  := coalesce((new.data->>'n')::integer, 0);
  return new;
end $$;

create or replace function public.bbq_sync_orders() returns trigger
language plpgsql as $$
begin
  new.number         := (new.data->>'number')::integer;
  new.user_id        := new.data->>'user_id';
  new.status         := new.data->>'status';
  new.payment_status := new.data->>'payment_status';
  new.request_id     := nullif(new.data->>'requestId', '');
  new.total          := (new.data->>'total')::numeric;
  new.created_at     := new.data->>'createdAt';
  return new;
end $$;

create or replace function public.bbq_sync_notifications() returns trigger
language plpgsql as $$
begin
  new.user_id    := new.data->>'userId';
  new.order_id   := new.data->>'orderId';
  new.type       := new.data->>'type';
  new.read       := coalesce((new.data->>'read')::boolean, false);
  new.created_at := new.data->>'createdAt';
  return new;
end $$;

create or replace function public.bbq_sync_counters() returns trigger
language plpgsql as $$
begin
  new.value := (new.data->>'value')::bigint;
  return new;
end $$;

create or replace function public.bbq_sync_menu() returns trigger
language plpgsql as $$
begin
  new.name      := new.data->>'name';
  new.cat       := new.data->>'cat';
  new.sort      := (new.data->>'sort')::integer;
  new.active    := coalesce((new.data->>'active')::boolean, true);
  new.available := coalesce((new.data->>'available')::boolean, true);
  return new;
end $$;

create or replace function public.bbq_sync_categories() returns trigger
language plpgsql as $$
begin
  new.name   := new.data->>'name';
  new.sort   := (new.data->>'sort')::integer;
  new.active := coalesce((new.data->>'active')::boolean, true);
  return new;
end $$;

create or replace function public.bbq_sync_files() returns trigger
language plpgsql as $$
begin
  new.mime := new.data->>'mime';
  new.size := (new.data->>'size')::integer;
  return new;
end $$;

create or replace function public.bbq_sync_payments() returns trigger
language plpgsql as $$
begin
  new.order_id   := new.data->>'orderId';
  new.status     := new.data->>'status';
  new.created_at := new.data->>'createdAt';
  return new;
end $$;

drop trigger if exists bbq_users_sync on public.bbq_users;
create trigger bbq_users_sync before insert or update of data on public.bbq_users
  for each row execute function public.bbq_sync_users();

drop trigger if exists bbq_sessions_sync on public.bbq_sessions;
create trigger bbq_sessions_sync before insert or update of data on public.bbq_sessions
  for each row execute function public.bbq_sync_sessions();

drop trigger if exists bbq_reset_tokens_sync on public.bbq_password_reset_tokens;
create trigger bbq_reset_tokens_sync before insert or update of data on public.bbq_password_reset_tokens
  for each row execute function public.bbq_sync_reset_tokens();

drop trigger if exists bbq_login_attempts_sync on public.bbq_login_attempts;
create trigger bbq_login_attempts_sync before insert or update of data on public.bbq_login_attempts
  for each row execute function public.bbq_sync_login_attempts();

drop trigger if exists bbq_orders_sync on public.bbq_orders;
create trigger bbq_orders_sync before insert or update of data on public.bbq_orders
  for each row execute function public.bbq_sync_orders();

drop trigger if exists bbq_notifications_sync on public.bbq_notifications;
create trigger bbq_notifications_sync before insert or update of data on public.bbq_notifications
  for each row execute function public.bbq_sync_notifications();

drop trigger if exists bbq_counters_sync on public.bbq_counters;
create trigger bbq_counters_sync before insert or update of data on public.bbq_counters
  for each row execute function public.bbq_sync_counters();

drop trigger if exists bbq_menu_sync on public.bbq_menu;
create trigger bbq_menu_sync before insert or update of data on public.bbq_menu
  for each row execute function public.bbq_sync_menu();

drop trigger if exists bbq_categories_sync on public.bbq_categories;
create trigger bbq_categories_sync before insert or update of data on public.bbq_categories
  for each row execute function public.bbq_sync_categories();

drop trigger if exists bbq_files_sync on public.bbq_files;
create trigger bbq_files_sync before insert or update of data on public.bbq_files
  for each row execute function public.bbq_sync_files();

drop trigger if exists bbq_payments_sync on public.bbq_payments;
create trigger bbq_payments_sync before insert or update of data on public.bbq_payments
  for each row execute function public.bbq_sync_payments();

-- ========================================================== دوال التطبيق ===
-- كل الدوال SECURITY INVOKER + تنفيذ لـ service_role بس (شوف المنح تحت).

create or replace function public.bbq_ping()
returns text
language sql
set search_path = public
as $$ select 'pong'::text $$;

create or replace function public.bbq_is_dedicated(p_collection text)
returns boolean
language sql
set search_path = public
immutable
as $$
  select p_collection in (
    'users', 'sessions', 'password_reset_tokens', 'login_attempts', 'orders',
    'notifications', 'counters', 'settings', 'menu', 'categories', 'files',
    'payments', 'whatsapp_log'
  )
$$;

-- قراءة كل المجموعات دفعة واحدة: { "users": [...], "orders": [...] }
create or replace function public.bbq_load()
returns jsonb
language sql
set search_path = public
stable
as $$
  with collections as (
    select 'users' as name, coalesce(jsonb_agg(data order by seq), '[]'::jsonb) as rows from public.bbq_users
    union all select 'sessions', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_sessions
    union all select 'password_reset_tokens', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_password_reset_tokens
    union all select 'login_attempts', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_login_attempts
    union all select 'orders', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_orders
    union all select 'notifications', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_notifications
    union all select 'counters', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_counters
    union all select 'settings', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_settings
    union all select 'menu', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_menu
    union all select 'categories', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_categories
    union all select 'files', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_files
    union all select 'payments', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_payments
    union all select 'whatsapp_log', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_whatsapp_log
    union all
      select collection, coalesce(jsonb_agg(data order by seq), '[]'::jsonb)
      from public.bbq_docs group by collection
  )
  select coalesce(jsonb_object_agg(name, rows), '{}'::jsonb) from collections
$$;

create or replace function public.bbq_upsert_row(p_table text, p_row jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_id text := p_row->>'id';
begin
  if v_id is null or v_id = '' then
    raise exception 'bbq: صف بدون id في مجموعة %', p_table;
  end if;
  if public.bbq_is_dedicated(p_table) then
    execute format(
      'insert into public.%I (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data',
      'bbq_' || p_table
    ) using v_id, p_row;
  else
    insert into public.bbq_docs (collection, id, data) values (p_table, v_id, p_row)
      on conflict (collection, id) do update set data = excluded.data;
  end if;
end $$;

create or replace function public.bbq_delete_row(p_table text, p_id text)
returns void
language plpgsql
set search_path = public
as $$
begin
  if public.bbq_is_dedicated(p_table) then
    execute format('delete from public.%I where id = $1', 'bbq_' || p_table) using p_id;
  else
    delete from public.bbq_docs where collection = p_table and id = p_id;
  end if;
end $$;

-- ------------------------------ قفل المعاملات (lease بين النسخ العاملة) ----
create or replace function public.bbq_try_lock(p_token text, p_ttl_ms integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_token is null or p_token = '' then
    return false;
  end if;
  insert into public.bbq_lock (id, token, expires_at)
  values ('transaction', p_token, now() + make_interval(secs => p_ttl_ms / 1000.0))
  on conflict (id) do update
    set token = excluded.token, expires_at = excluded.expires_at
    where public.bbq_lock.expires_at <= now() or public.bbq_lock.token = excluded.token;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

create or replace function public.bbq_renew_lock(p_token text, p_ttl_ms integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.bbq_lock
     set expires_at = now() + make_interval(secs => p_ttl_ms / 1000.0)
   where id = 'transaction' and token = p_token and expires_at > now();
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

create or replace function public.bbq_release_lock(p_token text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  delete from public.bbq_lock where id = 'transaction' and token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- ---------------------------------------- حفظ ذري: commit قبل أي رد نجاح ---
-- بتأكد إن اللسه عندنا اللوك، بيطبّق كل التغييرات في معاملة واحدة، ويشيل اللوك.
-- لو اللوك ضاع → false والتطبيق ما يرجعش نجاح أبدًا.
create or replace function public.bbq_commit(p_token text, p_upserts jsonb, p_deletes jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_rows  integer;
  v_table text;
  v_list  jsonb;
  v_row   jsonb;
  v_id    text;
begin
  update public.bbq_lock
     set expires_at = now() + interval '60 seconds'
   where id = 'transaction' and token = p_token and expires_at > now();
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;   -- اللوك ضاع أو خلص: ممنوع نعلن نجاح
  end if;

  if p_upserts is not null and jsonb_typeof(p_upserts) = 'object' then
    for v_table, v_list in select key, value from jsonb_each(p_upserts) loop
      if jsonb_typeof(v_list) <> 'array' then
        raise exception 'bbq_commit: upserts[%] لازم تكون array', v_table;
      end if;
      for v_row in select value from jsonb_array_elements(v_list) loop
        perform public.bbq_upsert_row(v_table, v_row);
      end loop;
    end loop;
  end if;

  if p_deletes is not null and jsonb_typeof(p_deletes) = 'object' then
    for v_table, v_list in select key, value from jsonb_each(p_deletes) loop
      if jsonb_typeof(v_list) <> 'array' then
        raise exception 'bbq_commit: deletes[%] لازم تكون array', v_table;
      end if;
      for v_id in select jsonb_array_elements_text(v_list) loop
        perform public.bbq_delete_row(v_table, v_id);
      end loop;
    end loop;
  end if;

  delete from public.bbq_lock where id = 'transaction' and token = p_token;
  return true;
end $$;

-- ================================================== الحماية والصلاحيات =====
-- RLS مفعّل بدون أي policies → أي دور بدون BYPASSRLS (anon/authenticated)
-- مبيقدر يوصل لأي صف. service_role (مفتاح السيرفر السري) عنده BYPASSRLS.

alter table public.bbq_lock                  enable row level security;
alter table public.bbq_users                 enable row level security;
alter table public.bbq_sessions              enable row level security;
alter table public.bbq_password_reset_tokens enable row level security;
alter table public.bbq_login_attempts        enable row level security;
alter table public.bbq_orders                enable row level security;
alter table public.bbq_notifications         enable row level security;
alter table public.bbq_counters              enable row level security;
alter table public.bbq_settings              enable row level security;
alter table public.bbq_menu                  enable row level security;
alter table public.bbq_categories            enable row level security;
alter table public.bbq_files                 enable row level security;
alter table public.bbq_payments              enable row level security;
alter table public.bbq_whatsapp_log          enable row level security;
alter table public.bbq_docs                  enable row level security;

-- المنح: متوافق مع Supabase (الأدوار anon/authenticated/service_role موجودة)
-- وأي Postgres عادي (الأدوار دي مش موجودة → نتخطاها من غير خطأ).
do $$
declare
  t text;
  f text;
  public_roles text[] := '{}';
  service_roles text[] := '{}';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    public_roles := array_append(public_roles, 'anon'::text);
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    public_roles := array_append(public_roles, 'authenticated'::text);
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    service_roles := array_append(service_roles, 'service_role'::text);
  end if;
  service_roles := array_append(service_roles, 'postgres'::text);

  foreach t in array array[
    'bbq_lock', 'bbq_users', 'bbq_sessions', 'bbq_password_reset_tokens',
    'bbq_login_attempts', 'bbq_orders', 'bbq_notifications', 'bbq_counters',
    'bbq_settings', 'bbq_menu', 'bbq_categories', 'bbq_files', 'bbq_payments',
    'bbq_whatsapp_log', 'bbq_docs'
  ] loop
    if array_length(public_roles, 1) > 0 then
      execute format('revoke all on public.%I from %s', t, array_to_string(public_roles, ', '));
    end if;
    execute format('grant all on public.%I to %s', t, array_to_string(service_roles, ', '));
  end loop;

  -- تسلسلات bigserial محتاجة usage عند الإدراج
  if array_length(public_roles, 1) > 0 then
    execute format('revoke usage, select on all sequences in schema public from %s', array_to_string(public_roles, ', '));
  end if;
  execute format('grant usage, select on all sequences in schema public to %s', array_to_string(service_roles, ', '));

  -- الدوال: التنفيذ لـ service_role (وصاحب المشروع postgres) بس
  foreach f in array array[
    'bbq_ping()', 'bbq_is_dedicated(text)', 'bbq_load()',
    'bbq_upsert_row(text, jsonb)', 'bbq_delete_row(text, text)',
    'bbq_try_lock(text, integer)', 'bbq_renew_lock(text, integer)',
    'bbq_release_lock(text)', 'bbq_commit(text, jsonb, jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    if array_length(public_roles, 1) > 0 then
      execute format('revoke execute on function public.%s from %s', f, array_to_string(public_roles, ', '));
    end if;
    execute format('grant execute on function public.%s to %s', f, array_to_string(service_roles, ', '));
  end loop;
end $$;

commit;

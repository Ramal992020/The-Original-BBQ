-- ============================================================================
-- 0002_perf.sql — تحسينات السرعة (تُشغّل بعد 0001_init.sql في SQL Editor)
-- ----------------------------------------------------------------------------
-- المشكلة قبل الملف ده:
--   * bbq_load() كانت بترجّع كل المجموعات بما فيها bbq_files (صور base64، حتى
--     ٣٠٠ صورة) — وكل طلب API كان بيحمّل الحِمل ده كامل عبر الشبكة.
--   * طلبات القراءة (GET) كانت بتاخد قفل الكتابة العالمي وتعمل reload كامل،
--     فكانت الطلبات بتتصافّ ورا بعض و"البينج" يعلّي مع كثرة أجهزة الإدارة.
--
-- الحل هنا (جزء قاعدة البيانات فقط — كود السيرفر بيستخدمه من غير تغيير في شكل البيانات):
--   ١) bbq_load(p_include_files boolean default false): نفس الدالة بس بتتخطّى
--      جدول الصور الثقيل افتراضيًا. النسخ الاحتياطي الكامل بيستدعيها بـtrue.
--   ٢) bbq_get_row(p_table, p_id): جلب صف واحد (صورة واحدة) عند الطلب فقط.
--   ٣) bbq_collection(p_table): جلب مجموعة واحدة (لتحميل الصور داخل معاملة كتابة).
--
-- أمان: نفس قواعد 0001 — التنفيذ لـ service_role/postgres بس، وRLS مفعّل.
-- ============================================================================

begin;

-- ١) إعادة تعريف bbq_load مع وسيط اختياري (لازم نحذف التوقيع القديم الأول عشان
--    ميحصلش التباس Overload في PostgREST عند الاستدعاء من غير وسائط).
drop function if exists public.bbq_load();

create or replace function public.bbq_load(p_include_files boolean default false)
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
    union all
      -- الصور base64 ثقيلة: متتجابش إلا عند الطلب الصريح (النسخ الاحتياطي).
      select 'files', case
        when p_include_files then coalesce((select jsonb_agg(data order by seq) from public.bbq_files), '[]'::jsonb)
        else '[]'::jsonb
      end
    union all select 'payments', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_payments
    union all select 'whatsapp_log', coalesce(jsonb_agg(data order by seq), '[]'::jsonb) from public.bbq_whatsapp_log
    union all
      select collection, coalesce(jsonb_agg(data order by seq), '[]'::jsonb)
      from public.bbq_docs group by collection
  )
  select coalesce(jsonb_object_agg(name, rows), '{}'::jsonb) from collections
$$;

-- ٢) جلب صف واحد من جدول مخصص أو من جدول المستندات (يُستخدم للصور عند الطلب).
create or replace function public.bbq_get_row(p_table text, p_id text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if p_id is null or p_id = '' then
    return null;
  end if;
  if public.bbq_is_dedicated(p_table) then
    execute format('select data from public.%I where id = $1', 'bbq_' || p_table)
      into v_row using p_id;
    return v_row;   -- null لو الصف مش موجود
  end if;
  select data into v_row from public.bbq_docs
   where collection = p_table and id = p_id;
  return v_row;
end $$;

-- ٣) جلب مجموعة كاملة كمصفوفة (تحميل كسول لمجموعة الصور داخل معاملة كتابة).
create or replace function public.bbq_collection(p_table text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not public.bbq_is_dedicated(p_table) then
    select coalesce(jsonb_agg(data order by seq), '[]'::jsonb)
      into v_rows from public.bbq_docs where collection = p_table;
    return v_rows;
  end if;
  execute format(
    'select coalesce(jsonb_agg(data order by seq), ''[]''::jsonb) from public.%I',
    'bbq_' || p_table
  ) into v_rows;
  return v_rows;
end $$;

-- ================================================== الحماية والصلاحيات ======
do $$
declare
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

  foreach f in array array[
    'bbq_load(boolean)', 'bbq_get_row(text, text)', 'bbq_collection(text)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    if array_length(public_roles, 1) > 0 then
      execute format('revoke execute on function public.%s from %s', f, array_to_string(public_roles, ', '));
    end if;
    execute format('grant execute on function public.%s to %s', f, array_to_string(service_roles, ', '));
  end loop;
end $$;

commit;

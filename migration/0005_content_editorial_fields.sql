begin;
alter table public.storefront_pages
  add column if not exists status text not null default 'draft',
  add column if not exists trashed_at timestamptz,
  add column if not exists author_id uuid,
  add column if not exists parent_id uuid references public.storefront_pages(id) on delete set null,
  add column if not exists menu_order integer not null default 0,
  add column if not exists password text,
  add column if not exists visibility text not null default 'public',
  add column if not exists template text,
  add column if not exists editor text not null default 'classic',
  add column if not exists allow_comments boolean not null default false,
  add column if not exists scheduled_for timestamptz,
  add column if not exists featured_image_url text;
update public.storefront_pages set status = case when is_published then 'published' else 'draft' end;

alter table public.articles
  add column if not exists trashed_at timestamptz,
  add column if not exists author_id uuid,
  add column if not exists menu_order integer not null default 0,
  add column if not exists password text,
  add column if not exists visibility text not null default 'public',
  add column if not exists template text,
  add column if not exists editor text not null default 'classic',
  add column if not exists allow_comments boolean not null default true,
  add column if not exists format text not null default 'standard';

create table if not exists public.blog_terms (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'category',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, kind, slug)
);
create table if not exists public.article_terms (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  term_id uuid not null references public.blog_terms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, term_id)
);
create index if not exists article_terms_term_idx on public.article_terms(term_id);

grant select on public.blog_terms to anon;
grant select, insert, update, delete on public.blog_terms to authenticated;
grant all on public.blog_terms to service_role;
grant select on public.article_terms to anon;
grant select, insert, update, delete on public.article_terms to authenticated;
grant all on public.article_terms to service_role;

alter table public.blog_terms enable row level security;
alter table public.article_terms enable row level security;
drop policy if exists blog_terms_public_read on public.blog_terms;
create policy blog_terms_public_read on public.blog_terms for select to anon using (public.is_public_merchant(merchant_id));
drop policy if exists blog_terms_member_all on public.blog_terms;
create policy blog_terms_member_all on public.blog_terms for all to authenticated using (public.is_merchant_member(merchant_id, auth.uid())) with check (public.is_merchant_member(merchant_id, auth.uid()));
drop policy if exists article_terms_public_read on public.article_terms;
create policy article_terms_public_read on public.article_terms for select to anon using (public.is_public_merchant(merchant_id));
drop policy if exists article_terms_member_all on public.article_terms;
create policy article_terms_member_all on public.article_terms for all to authenticated using (public.is_merchant_member(merchant_id, auth.uid())) with check (public.is_merchant_member(merchant_id, auth.uid()));
commit;

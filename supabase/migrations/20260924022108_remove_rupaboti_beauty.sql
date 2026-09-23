-- Remove Rupaboti Beauty (demo merchant) — user order 2026-09-24.
--
-- Deletes exactly the `rupaboti-beauty` merchant row. Every FK from child
-- tables to merchants is ON DELETE CASCADE (or SET NULL), so products,
-- orders, pages, members, domains, installs and settings follow the row
-- with no orphan cleanup needed. Staff of other merchants unaffected.
--
-- Re-runnable: no-op when the slug is already gone. The seed migration
-- (20260919100000) is history and stays untouched — migrations never rerun.

delete from public.merchants
where slug = 'rupaboti-beauty';

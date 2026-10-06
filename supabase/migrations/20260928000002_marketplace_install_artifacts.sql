-- FOLLOW-UP — artifact identity columns on marketplace install + listing rows.
--
-- Listings carry artifact refs in code (marketplace.server.ts
-- catalogArtifactForRow/buildListingArtifact) but no DB column ever persisted
-- them: pipeline installs hash the exact ZIP bytes and the marketplace lane
-- patches listing identity onto the ledger row without recording the checksum,
-- so version-pinned installs are unverifiable after the fact and uninstall
-- cannot attribute the manifest-slug asset namespace when it differs from
-- the ledger listing slug (see package-install.server.ts
-- uninstallPluginPackage).
--
-- CONTRACT: all three columns are NULL-able with NO backfill and NO default.
-- NULL = legacy fallback (ledger-only install, builtin install, or a row
-- written before this migration) — every reader feature-detects the columns
-- and treats NULL as "artifact unknown", never a crash. A future publish lane
-- may stamp the listing-row columns at review time; the install lane always
-- hashes what it installs rather than trusting any stored value.
--
--   artifact_checksum: sha256 hex of the exact ZIP the pipeline installed.
--   artifact_version:  manifest version pinned inside that ZIP.
--   artifact_pinned:   provenance label (upload | manifest | version:<id> |
--                      builtin:<id> | pin).
alter table public.marketplace_installs add column if not exists artifact_checksum text;
alter table public.marketplace_installs add column if not exists artifact_version text;
alter table public.marketplace_installs add column if not exists artifact_pinned text;
alter table public.marketplace_widgets add column if not exists artifact_checksum text;
alter table public.marketplace_widgets add column if not exists artifact_version text;
alter table public.marketplace_widgets add column if not exists artifact_pinned text;
alter table public.marketplace_themes add column if not exists artifact_checksum text;
alter table public.marketplace_themes add column if not exists artifact_version text;
alter table public.marketplace_themes add column if not exists artifact_pinned text;
grant select, insert, update, delete on table public.marketplace_installs to authenticated;
grant all on table public.marketplace_installs to service_role;

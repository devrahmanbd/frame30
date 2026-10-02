# Spec Delta

## Purpose
CMS content desk: Pages, Posts, Media with WordPress trash semantics
(trash/restore/delete, homepage assignment), revision history with restore,
and bilingual EN/BN twins on shopper-facing strings.

## Requirements

### Requirement: Trash semantics
Deleting pages/posts SHALL move them to trash first; permanent delete and
restore SHALL be explicit, with scheduled trash sweeps.

#### Scenario: Restore trashed page
- **WHEN** an editor restores a trashed page
- **THEN** it returns with its URL, content, and homepage assignment intact

### Requirement: Revisions
Articles SHALL keep bounded revision history (autosaves capped, manuals
capped) with pair-compare and one-click restore that never publishes.

#### Scenario: Autosave never publishes
- **WHEN** an autosave runs on a scheduled post
- **THEN** the public status and schedule are unchanged

### Requirement: Bilingual twins
Shopper-facing strings SHALL carry inline `_bn` twins with bn→en fallback so
nothing renders blank in either locale.

#### Scenario: Missing bn falls back
- **WHEN** a string lacks its bn twin
- **THEN** the English string renders instead of an empty node

# Check 1 — bundle doc still checks repo paths

A `dev.theme.json` bundle may reference `src/lib/does-not-exist.js`, which is
still a repo path and must exist.

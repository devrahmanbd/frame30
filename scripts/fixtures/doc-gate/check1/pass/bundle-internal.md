# Check 1 — bundle-internal example paths

A Level B bundle has a `dev.theme.json` manifest. Its asset-completeness
rule says `./helper.js` and `./vendor/three.js` must resolve inside the
bundle, and bundle directories such as `components/` are not repo paths.

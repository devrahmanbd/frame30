/**
 * Public-site language exposure.
 *
 * The marketing site is bilingual at the content layer, but the *public*
 * surface ships English-only until a merchant turns Bangla on from the admin
 * dashboard. Rendering both languages in the same band was the source of the
 * "EN selected, Bangla on screen" mix-up: the twins were unconditional, not
 * driven by the selected language.
 *
 * One flag governs it. Flip `PUBLIC_BANGLA_ENABLED` (or wire it to the admin
 * setting) and every Bangla twin plus the header toggle comes back.
 */
export const PUBLIC_BANGLA_ENABLED = false;

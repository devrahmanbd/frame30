# Frame30 CMS Source-to-Specification-to-Proof Correspondence Matrix
**Document ID:** `F30-MATRIX-CMS-001`  
**Version:** 1.0.0  
**Authority:** Human Specification Authority (`@devrahmanbd`)  
**Standard:** Frame30 Engineering SDLC (`F30-SDLC-001` Section 10)  

---

## 1. Overview & Formal Grounding

Per F30-SDLC-001 Layer 04 and Section 10, a formal theorem or model does not prove production correctness unless an explicit, machine-traceable relationship exists between production code, formal models, property generators, and test suites.

This matrix documents the 7-stage chain of custody for every correctness law in the CMS Core pilot:
`Production Source -> Requirement -> Formal Definition -> Theorem / Invariant -> Correspondence Argument -> Differential Property -> Evidence Receipt`.

---

## 2. Traceability Matrix

### Domain A: Multi-Tenant Isolation & RLS Boundary (Risk: CRITICAL)

| Step | Artifact / Element | Exact Description / Identifier |
|---|---|---|
| **1. Production Source** | `src/lib/editor/editor.server.ts` & Supabase RLS | Functions `loadEditor`, `saveEditor`, `currentMerchantId`; RLS policies on `storefront_pages`, `page_revisions`, `articles`, `article_revisions`. |
| **2. Requirement** | `F30-SPEC-CMS-001` §4 Inv 8 | Merchant A cannot read, mutate, or delete Merchant B's content; client-supplied merchant IDs are ignored; staff actions are role-bound. |
| **3. Formal Definition** | `specs/lean/Framique/CmsLifecycle.lean` & `specs/tla/CmsContentLifecycle.tla` | Lean type `TenantContext`, predicate `isTenantOwner`; TLA+ variable `tenantOfDoc`, operator `CanAccess(actor, doc)`. |
| **4. Theorem / Invariant** | `tenant_isolation_theorem` / `NoCrossTenantAccess` | Lean theorem proving no action by Actor with `tenant A` can return or mutate content of `tenant B`; TLA+ invariant `\A a \in Actors, d \in Docs : Access(a, d) => tenantOf[a] = tenantOf[d]`. |
| **5. Correspondence Argument** | Database RLS session binding | Supabase client uses JWT session claims `auth.uid()`; Postgres RLS helper `is_merchant_member(merchant_id)` strictly enforces tenant context. |
| **6. Differential Property** | `src/lib/cms-tenant-rls.test.ts` & `src/lib/cms-properties.test.ts` | fast-check randomized generation of 1,000 multi-merchant access attempts asserting 100% rejection of cross-tenant reads, updates, and forged IDs. |
| **7. Evidence Receipt** | `docs/verification-evidence/cms-rls-receipt.txt` | Raw execution log of PostgreSQL RLS and fast-check verification. |

---

### Domain B: CMS Content Lifecycle & Publishing Concurrency (Risk: HIGH / CRITICAL)

| Step | Artifact / Element | Exact Description / Identifier |
|---|---|---|
| **1. Production Source** | `src/lib/editor/editor.server.ts`, `src/lib/cms.server.ts` | Functions `resolvePublishStatus`, `saveArticle`, `saveEditor`, `listRevisions`, `readRevision`. |
| **2. Requirement** | `F30-SPEC-CMS-001` §3, §4 Inv 1, 2, 4 | Drafts never public; scheduled content publishes atomically at release time; stale saves rejected with conflict; rollback appends forward revision. |
| **3. Formal Definition** | `specs/lean/Framique/CmsLifecycle.lean` & `specs/tla/CmsContentLifecycle.tla` | Lean inductive type `ContentState`, transition relation `Step`; TLA+ variables `docState`, `serverRev`, `clientRev`, actions `SaveValidRevision`, `DropStaleSave`. |
| **4. Theorem / Invariant** | `draft_not_public`, `stale_save_rejected`, `rollback_preserves_history` / `NoPublicDraft`, `NoStaleRevisionOverwrite` | Lean theorems verifying draft secrecy, monotonicity, and history preservation; TLA+ invariants checked by TLC across all reachable states. |
| **5. Correspondence Argument** | State transition validation | Production `editor.server.ts` validates `updated_at` before save (throwing `stale_revision`), sets `is_published = false` on draft/scheduled, and appends to revisions table on restore. |
| **6. Differential Property** | `src/lib/cms-properties.test.ts` & `src/lib/cms-lifecycle.test.ts` | fast-check sequence testing concurrent saves, simulated network delays, out-of-order commits, and state machine replay. |
| **7. Evidence Receipt** | `docs/verification-evidence/tlc-cms-lifecycle-proof.txt` | TLC model checker log verifying 0 invariant violations across state space. |

---

### Domain C: Builder AST & Widget Integration Parity (Risk: HIGH)

| Step | Artifact / Element | Exact Description / Identifier |
|---|---|---|
| **1. Production Source** | `src/lib/builder-ast.ts`, `src/components/builder/SectionRenderer.tsx` | Schema parser `parseAst`, `validateBody`, `resolveResponsiveProp`, `isRedundantCollectionRail`. |
| **2. Requirement** | `F30-SDLC-001` Layer 04, `DIE-001`, `DIE-002`, `DIE-005` | Authoritative AST schema, widget prop validation, mobile override authoritative (`DIE-001`), collection self-exclusion (`DIE-002`). |
| **3. Formal Definition** | `specs/lean/Framique/Responsive.lean`, `CollectionComposition.lean` & `specs/bend/LAWS.bend` | Lean definitions of responsive resolution and collection filtering; Bend laws `law_responsive_cascade_mobile` and `law_collection_self_exclusion`. |
| **4. Theorem / Invariant** | `responsive_precedence_mobile`, `matching_rail_is_redundant` | Lean theorems and Bend proofs verified by `lake env lean` and `bend --verdict`. |
| **5. Correspondence Argument** | Structural equivalence | TypeScript `resolveResponsive` mirrors Lean/Bend specification; `isRedundantCollectionRail` returns true if rail collection matches page slug. |
| **6. Differential Property** | `src/lib/themes/*properties.test.ts` & `.e2e/cms-content-lifecycle.spec.ts` | fast-check tests across 1,500 random AST trees and Playwright journey asserting widget save/reload/preview parity. |
| **7. Evidence Receipt** | `docs/verification-evidence/bend-proof.txt`, `tlc-responsive-autosave-proof.txt` | Bend 2 compiler verdict `ALL PROOFS CHECK` and TLC receipts. |

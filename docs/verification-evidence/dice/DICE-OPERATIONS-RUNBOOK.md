# Frame30 DICE Operational Runbook
**Standard Operating Procedures, Key Management & Governance Protocol**

- **Specification Authority**: Human Specification Authority (`@devrahmanbd`)
- **Normative Document**: `F30-DICE-ARCH-001 Revision 2.3` Section 9 & `F30-SDLC-001` Section 13
- **Date**: 2026-11-25

---

## 1. Scope & Authority

This runbook defines standard operating procedures (SOPs) for maintaining, operating, rotating, and troubleshooting the Frame30 Die-driven Invariant & Conformance Engine (DICE). All operational actions require authorization from the Human Specification Authority (`@devrahmanbd`).

---

## 2. Standard Operating Procedures (SOPs)

### SOP-01: Adding a New Accepted Capability to the Permanent Die Registry (`dies/`)
When a new product capability achieves `POST_RELEASE_VERIFIED` status in the 18-state SDLC:
1. Create a new directory under `dies/<die_id>/` (e.g., `dies/DIE-006-cart-reservation/`).
2. Author the 8 mandatory die components in `die.json`:
   - Requirement description (merchant/shopper perspective).
   - Protected invariants (must never regress).
   - Forbidden failure modes.
   - Formal laws (Bend 2 / Lean 4).
   - Executable model / reference oracle.
   - Conformance test suites.
   - Adversarial mutation checks.
   - Regression dependencies on earlier dies.
3. Register the new die in `registries/dice/registry.json`.
4. Run the die registry gate: `bun run test:dies`.
5. Obtain explicit Human Specification Authority sign-off on the change contract before committing.

### SOP-02: Cryptographic Key Generation & Rotation
The DICE signing key (`DICE_SIGNING_KEY`) signs release attestations using Ed25519 (RFC 8032):
1. **Generate New Keypair**:
   ```bash
   node -e '
     const crypto = require("node:crypto");
     const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
     console.log("PUBLIC_KEY_PEM:\n" + publicKey.export({ type: "spki", format: "pem" }));
     console.log("PRIVATE_KEY_PEM:\n" + privateKey.export({ type: "pkcs8", format: "pem" }));
   '
   ```
2. **Update Trusted Key Registry (`registries/dice/trusted-keys.json`)**:
   Add the new public key entry with active status and expiration timestamp.
3. **Configure CircleCI Secret**:
   Update `DICE_SIGNING_KEY` environment variable in CircleCI project settings (restricted to protected contexts).
4. **Mark Old Key Deprecated**:
   Update the previous key entry status to `"deprecated"` (retains signature verification capability for historic attestations).
5. **Verify Signing Pipeline**:
   Execute `bunx vitest run src/lib/dice/signing-e2e.test.ts` to confirm end-to-end signing and verification.

### SOP-03: Emergency Key Revocation Procedure
In the event of key compromise or suspected secret exposure:
1. Immediately revoke the compromised key in `registries/dice/trusted-keys.json` by setting `"status": "revoked"`, `"revocation_reason": "compromise"`, and recording the revocation timestamp.
2. Invalidate `DICE_SIGNING_KEY` in CircleCI settings immediately.
3. Deploy a new keypair following SOP-02.
4. Any attestation signed with a revoked key will evaluate strictly to `BLOCKED` during verification.

### SOP-04: Updating the Trusted Root-of-Trust Pinned Reference (`$TRUSTED_REF`)
When ratifying a new baseline commit for DICE trusted tools:
1. Verify that all gates pass cleanly on the candidate commit:
   `gate:scope` -> `gate:drift` -> `lint` -> `typecheck` -> `test:dies` -> `test:contracts` -> `test:lean` -> `test:bend` -> `test:tla` -> `test:bombadil` -> `vitest run src/lib/dice/`.
2. Extract the commit SHA ($C$) and tree SHA ($T$):
   ```bash
   COMMIT_SHA=$(git rev-parse HEAD)
   TREE_SHA=$(git rev-parse HEAD^{tree})
   ```
3. Update `DEFAULT_TRUSTED_REF` and `APPROVED_ROOTS` in `scripts/dice-root-of-trust.mjs`:
   ```javascript
   export const APPROVED_ROOTS = Object.freeze({
     ...
     [COMMIT_SHA]: TREE_SHA,
   });
   ```
4. Update `DICE_TRUSTED_REF` in `.circleci/config.yml`.
5. Run `bunx vitest run src/lib/dice/root-of-trust.test.ts` to verify root resolution.

### SOP-05: Authorizing an Emergency Obligation Waiver
Waivers are governed strictly by RFC 8785 canonical JSON and Inviolable Invariant 3:
1. **Rule**: Baseline mandatory obligations (`OBL-SYS-SCOPE-GUARD-001`, `OBL-SYS-DRIFT-GUARD-001`, `OBL-SYS-DIE-REGISTRY-001`, `OBL-SYS-SECRETS-SCAN-001`) can **NEVER** be waived under any circumstances. Any attempt to waive a mandatory obligation triggers immediate `QUALIFIED_FAIL`.
2. For eligible non-mandatory obligations, create a signed waiver file:
   ```json
   {
     "waiver_id": "WAIV-2026-001",
     "obligation_id": "OBL-OPTIONAL-CHECK-001",
     "candidate_commit": "<target_commit>",
     "authorized_by": "@devrahmanbd",
     "reason": "Documented emergency operational exemption",
     "expires_at": "2026-12-01T00:00:00Z"
   }
   ```
3. Sign the waiver with the human specification authority's private key.
4. Include the waiver in the change contract under `waived_obligations`.
5. The qualification engine verifies that waivers alone never grant `QUALIFIED_PASS` (vacuous pass prevention).

---

## 3. Incident Response & Troubleshooting

### Issue 1: `QUALIFIED_BLOCKED: STALE_PROVENANCE_TREE_MISMATCH`
- **Cause**: Receipt tree SHA does not match current git candidate tree SHA.
- **Remediation**: Candidate repository was modified after verification tests were run. Re-run verification against the current tree SHA.

### Issue 2: `QUALIFIED_BLOCKED: MISSING_METHOD_RECEIPT`
- **Cause**: Multi-method obligation declared two or more methods, but one worker failed to record a receipt.
- **Remediation**: Check worker logs for process timeouts or early exits. Re-run worker with full method list.

### Issue 3: `QUALIFIED_FAIL: MANDATORY_WAIVER_PROHIBITED`
- **Cause**: Change contract or plan attempted to place a mandatory baseline obligation in `waived`.
- **Remediation**: Inviolable Invariant 3 breach. Remove baseline obligation from `waived` list; mandatory obligations must pass verification.

### Issue 4: `BLOCKED: Bubblewrap binary unavailable`
- **Cause**: Attempted to run authoritative sandbox worker on macOS or system without `bwrap`.
- **Remediation**: Inviolable Invariant 5 requires live bwrap on Linux. Authoritative runs must execute in CircleCI (`ubuntu-2204:current`). For local developer inspection, use `--dry-run`.

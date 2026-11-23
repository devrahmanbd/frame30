---
name: frame30-ui-verification
description: Project-local skill for autonomous UI property testing, 8-viewport responsive layout exploration, and Playwright merchant acceptance on Frame30.
---

# Frame30 UI Verification Skill

This skill provides deterministic and property-based browser exploration runbooks for Frame30 storefront and merchant builder interfaces.

## 1. Launch
- Ensure local dev server or ephemeral test server is booted:
  ```bash
  bun run dev &
  ```
- Verify HTTP readiness at `http://127.0.0.1:3000/`.

## 2. Doctor
Verify browser drivers and viewport prerequisites:
```bash
# Check Playwright Chromium installation
bunx playwright --version
# Test headless browser launch
node -e "import('playwright').then(p => p.chromium.launch().then(b => { console.log('Chromium ready'); return b.close(); }))"
```

## 3. Drive
Execute the required browser suites:
- **8-Viewport Responsive Conformance**:
  ```bash
  bunx playwright test -c .e2e/playwright.config.ts responsive-inspector-reset -g "A4:"
  ```
  Tests viewports: `320`, `360`, `390`, `430`, `768`, `1024`, `1280`, `1440`.
  Invariants asserted:
  - `document.documentElement.scrollWidth <= window.innerWidth + 1`
  - Zero fatal console errors.
  - Header and footer layout geometry stability.
- **Fail-Closed Authenticated Merchant Workflow**:
  ```bash
  bunx playwright test -c .e2e/playwright.config.ts responsive-inspector-reset -g "A3:"
  ```
  Fails closed with explicit exception if merchant credentials or seeded environment are absent.
- **Interactive Component Tests**:
  ```bash
  bun run test:responsive
  ```

## 4. Evidence
- Viewport screenshots are stored in `docs/verification-evidence/responsive-viewports/`:
  - `mobile-320.png`, `mobile-360.png`, `mobile-390.png`, `mobile-430.png`
  - `tablet-768.png`, `laptop-1024.png`, `desktop-1280.png`, `desktop-1440.png`
- Visual baselines require human review; never update automatically.

## 5. Cleanup
- Terminate background dev server processes:
  ```bash
  pkill -f "bun run dev" || true
  ```
- Remove temporary test profiles and browser traces.

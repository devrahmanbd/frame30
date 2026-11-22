# Feature SF-04: Theme Builder Responsive Customization

## 1. Entry Route & Parameters
- **Primary Routes**: `/dashboard/builder`, `/`
- **Key Modules**: `src/lib/responsive.ts`, `src/lib/builder-ast.ts`, `src/components/builder/SectionInspector.tsx`, `src/components/builder/BuilderTopBar.tsx`, `src/components/builder/songoskriti.tsx`

## 2. Preconditions
- Active theme published for merchant (Songoskriti reference theme).
- Builder initialized with valid AST document (`main` sections).
- Responsive viewports defined: 320, 360, 390, 430, 768, 1024, 1280, 1440.

## 3. Supported Actions
- **Select Viewport Preset**: Switch between 8 viewport presets in `src/components/builder/BuilderTopBar.tsx`.
- **Edit Baseline Property**: Modify property when active device is desktop (`section.props[key]`).
- **Set Responsive Override**: Modify property when active device is tablet or mobile (`section.bp[device][key]`).
- **Reset to Inherited**: Clear override on active device (`onClearOverride`), restoring cascade inheritance.
- **Toggle Device Visibility**: Hide/show section on specific device (`section.hidden`).

## 4. State Transitions
- `inherited(source)` -> (Edit property on device) -> `overridden(device)`
- `overridden(device)` -> (Click Reset) -> `inherited(source)`
- `device(desktop)` -> (Select Preset 390) -> `device(mobile)`
- `visible(everywhere)` -> (Toggle Mobile off) -> `hidden(mobile)`

## 5. Executable Invariants
- **Preset Immutability**: Selecting any of the 8 preview presets never mutates the underlying theme AST.
- **Layer Isolation**: Overriding a property on `mobile` never mutates desktop baseline (`section.props`) or tablet overrides (`section.bp.tablet`).
- **Reset Restores Inheritance**: Clearing an override completely removes the key from `section.bp[device]`, deterministically restoring inheritance from tablet or desktop.
- **Responsive Layout Fluidity**: Merchant layouts maintain `document.documentElement.scrollWidth <= window.innerWidth` across all supported viewports (320px–1440px).
- **Parity Guarantees**: Studio builder preview and live storefront resolve identical responsive properties for any `(section, device)` pair.

## 6. Verification Commands
- `bun run test:features`
- `bun run test:responsive`
- `bun run test:properties`
- `bun run test:bombadil --smoke`

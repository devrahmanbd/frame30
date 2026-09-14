---
version: 1.0
name: Framique-Design-System
description: A modern, high-conversion commerce platform design system anchored on a minimal black-and-white foundation, elevated with Facebook Blue (#1877F2) for commercial trust and calm soft pink (#FFF1F3 / #FDF8F9) for soothing tactile smoothness. Pink replaces cold, sterile flat white with ambient warmth and tranquility, while Facebook Blue delivers universal digital familiarity and playful energy. Bengali typography is treated as a first-class script with zero negative tracking and generous vertical clearance.

colors:
  primary: "#1877F2"
  primary-active: "#1465CC"
  primary-disabled: "#E2E8F0"
  ink: "#0F172A"
  ink-secondary: "#334155"
  body: "#475569"
  muted: "#64748B"
  muted-soft: "#94A3B8"
  hairline: "#E2E8F0"
  hairline-soft: "#F1F5F9"
  hairline-pink: "#FCE7EC"
  canvas: "#FDFBFB"
  canvas-pink-calm: "#FFF1F3"
  surface-soft: "#F8FAFC"
  surface-card: "#FFFFFF"
  surface-card-pink: "#FDF2F4"
  surface-strong: "#E2E8F0"
  surface-dark: "#0F172A"
  surface-dark-elevated: "#1E293B"
  on-primary: "#FFFFFF"
  on-dark: "#FFFFFF"
  on-dark-soft: "#94A3B8"
  brand-blue: "#1877F2"
  brand-blue-hover: "#1465CC"
  brand-blue-soft: "#EBF5FF"
  brand-pink: "#F43F5E"
  brand-pink-calm: "#FFF1F3"
  brand-pink-subtle: "#FDF8F9"
  success: "#10B981"
  warning: "#F59E0B"
  error: "#EF4444"
  badge-blue: "#EBF5FF"
  badge-pink: "#FFF1F3"
  badge-emerald: "#ECFDF5"
  badge-amber: "#FEF3C7"

typography:
  display-xl:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.10
    letterSpacing: -1.5px
  display-lg:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 42px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -1.0px
  display-md:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.6px
  display-sm:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.3px
  title-lg:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: -0.2px
  title-md:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: 0
  title-sm:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  caption:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.40
    letterSpacing: 0.2px
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  button:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.00
    letterSpacing: 0
  nav-link:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.40
    letterSpacing: 0
  bangla-display:
    fontFamily: "'Noto Sans Bengali', Inter, sans-serif"
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: 0
  bangla-body:
    fontFamily: "'Noto Sans Bengali', Inter, sans-serif"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 24px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  button-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.brand-blue-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
    height: 44px
  button-pink-subtle:
    backgroundColor: "{colors.brand-pink-calm}"
    textColor: "{colors.brand-pink}"
    border: "1px solid {colors.hairline-pink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
  top-nav:
    backgroundColor: "rgba(253, 251, 251, 0.85)"
    backdropFilter: "blur(12px)"
    borderBottom: "1px solid {colors.hairline}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    height: 64px
  nav-pill-group:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    rounded: "{rounded.pill}"
    padding: 4px
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: 96px 24px
  dummy-placeholder-frame:
    backgroundColor: "{colors.surface-dark}"
    border: "1px dashed {colors.hairline-soft}"
    rounded: "{rounded.lg}"
    textColor: "{colors.muted-soft}"
  feature-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.title-md}"
    rounded: "{rounded.lg}"
    padding: 28px
  tour-tab-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 20px
  tour-tab-button-active:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.brand-blue}"
    border: "1px solid {colors.hairline}"
    shadow: "0 1px 3px rgba(0,0,0,0.05)"
  testimonial-card:
    backgroundColor: "{colors.surface-card}"
    border: "1px solid {colors.hairline}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 28px
  pricing-tier-card:
    backgroundColor: "{colors.surface-card}"
    border: "1px solid {colors.hairline}"
    textColor: "{colors.ink}"
    typography: "{typography.title-lg}"
    rounded: "{rounded.lg}"
    padding: 32px
  pricing-tier-card-featured:
    backgroundColor: "{colors.surface-card}"
    border: "2px solid {colors.brand-blue}"
    textColor: "{colors.ink}"
    typography: "{typography.title-lg}"
    rounded: "{rounded.lg}"
    padding: 32px
  badge-calm-pink:
    backgroundColor: "{colors.brand-pink-calm}"
    textColor: "{colors.brand-pink}"
    border: "1px solid {colors.hairline-pink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  badge-facebook-blue:
    backgroundColor: "{colors.brand-blue-soft}"
    textColor: "{colors.brand-blue}"
    border: "1px solid rgba(24, 119, 242, 0.2)"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  footer:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark-soft}"
    typography: "{typography.body-sm}"
    padding: 64px 24px
---

## 1. Overview & Core Philosophy

Framique is the modern commerce operating system built specifically for Bangladesh's growing online brands, physical retailers, and omnichannel merchants.

The design system reconciles a fundamental aesthetic truth: **monochrome minimalism provides clarity and credibility, but stark flat white feels cold, sterile, and clinical.** By blending a **minimal black-and-white core** with **calm soft pink** and **Facebook Blue**, Framique achieves a warm, confident, and deeply human aesthetic:

1. **Minimal Black & White Foundation**:
   - Deep slate ink (`#0F172A`) against clean white cards (`#FFFFFF`) ensures impeccable readability and structural authority.
   - Generous whitespace and restrained geometry inspire the confidence of tier-one software (Cal.com, Linear, Stripe).
2. **Pink for Calm and Smoothness (Not Flat White)**:
   - Pure `#ffffff` canvases create harsh glare and visual fatigue on modern screens.
   - Our canvas utilizes `{colors.canvas}` (`#FDFBFB`) with `{colors.canvas-pink-calm}` (`#FFF1F3`) ambient under-glows.
   - This blush/rose undertone softens the entire viewport, delivering a calm, velvety tactile smoothness that feels soothing, approachable, and premium.
3. **Facebook Blue (`#1877F2`)**:
   - The universal gold standard for digital trust and commercial familiarity across Bangladesh.
   - Applied intentionally to primary action CTAs, verified badges, active navigation indicators, and high-conversion moments.
   - Introduces energetic, playful confidence without visual clutter.
4. **First-Class Bilingualism**:
   - English and Bengali co-exist seamlessly. Bengali display headlines retain their natural geometry with zero negative tracking, allowing matras and conjunct characters to render without clipping.

---

## 2. Color System & Color Roles

### 2.1 Brand & Action Accents
- **Facebook Blue** (`{colors.brand-blue}` — `#1877F2`): Dominant primary action color. Triggers instant trust for merchant checkout, signup, and primary buttons. Active press state transitions to `{colors.brand-blue-hover}` (`#1465CC`).
- **Blue Soft Wash** (`{colors.brand-blue-soft}` — `#EBF5FF`): Background for verified badges, active tab pills, and secondary focus states.
- **Rose / Pink Accent** (`{colors.brand-pink}` — `#F43F5E`): Playful accent for live status pills, conversion highlights, and notification indicators.

### 2.2 Surface Palette (The Calm Warmth Hierarchy)
- **Canvas** (`{colors.canvas}` — `#FDFBFB`): The default page floor. Infused with 0.5% rose warmth to eradicate the harshness of flat white.
- **Calm Pink Surface** (`{colors.canvas-pink-calm}` — `#FFF1F3`): Ambient hero lighting, section transitions, and subtle badge containers. Provides visual tranquility.
- **Card Surface** (`{colors.surface-card}` — `#FFFFFF`): Elevated content cards, bento tiles, and input surfaces with crisp hairline borders.
- **Dark Surface** (`{colors.surface-dark}` — `#0F172A`): Deep carbon/navy footer and dummy image placeholder interiors. Serves as a solid visual anchor at the bottom of long-scroll pages.

### 2.3 Typographic Ink
- **Deep Ink** (`{colors.ink}` — `#0F172A`): Headlines, display typography, and primary button labels. High-contrast, WCAG AAA compliant (14.2:1 against canvas).
- **Secondary Ink** (`{colors.ink-secondary}` — `#334155`): Subheadings, card titles, and bold highlights.
- **Body Text** (`{colors.body}` — `#475569`): Running paragraphs, list items, and matrix cells.
- **Muted Text** (`{colors.muted}` — `#64748B`): Captions, helper text, and secondary timestamps.

---

## 3. Typography & Dual-Script Hierarchy

Type hierarchy is governed by strict functional roles. We pair the geometric clarity of **Inter** with the cultural grace of **Noto Sans Bengali**.

### Typographic Scale & Usage

| Token | Font Size | Weight | Line Height | Letter Spacing | Primary Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `{typography.display-xl}` | 56px | 700 | 1.10 | -1.5px | Homepage Hero H1 ("The modern commerce platform for Bangladesh") |
| `{typography.display-lg}` | 42px | 700 | 1.15 | -1.0px | Major Band Section Headings |
| `{typography.display-md}` | 32px | 600 | 1.20 | -0.6px | Sub-section headings, Modal titles |
| `{typography.display-sm}` | 24px | 600 | 1.25 | -0.3px | Bento Card Titles, Tour Headings |
| `{typography.title-lg}` | 20px | 600 | 1.35 | -0.2px | Pricing Tier Names, Feature Highlights |
| `{typography.title-md}` | 18px | 600 | 1.40 | 0px | Card subheadings, Accordion Question Titles |
| `{typography.title-sm}` | 16px | 600 | 1.40 | 0px | Small card headers, Table Column Labels |
| `{typography.body-md}` | 16px | 400 | 1.55 | 0px | Default body copy, Lead explanations |
| `{typography.body-sm}` | 14px | 400 | 1.50 | 0px | Secondary explanations, Footer links |
| `{typography.caption}` | 12px | 500 | 1.40 | +0.2px | Floating badges, Asset specs, Date stamps |
| `{typography.code}` | 13px | 400 | 1.50 | 0px | API endpoints, Barcodes, Webhook payloads |
| `{typography.button}` | 14px | 600 | 1.00 | 0px | Interactive CTA button labels |

### Dual-Script Rules
1. **Never apply negative tracking to Bengali text**: Latin letter-spacing tokens (`-1.5px`, `-1.0px`) break Bengali conjuncts (*juktakkhor*). When `lang="bn"` or Bengali characters are detected, `letter-spacing` is strictly forced to `0px`.
2. **Vertical Clearance**: Bengali script requires a minimum line-height of `1.35` for display type and `1.60` for body copy to prevent upper and lower diacritic clipping.

---

## 4. Spacing, Geometry & Visual Hierarchy

- **8-Point Spatial Grid**: All padding, margin, and gap values are multiples of 4px and 8px (`8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `96px`).
- **Section Rhythm**: Major sections breathe with `{spacing.section}` (`96px` desktop, `64px` mobile).
- **Border Radius Hierarchy**:
  - `rounded.sm` (6px): Badges, tooltips, inline code chips.
  - `rounded.md` (8px): Primary and secondary buttons, form inputs, tab buttons.
  - `rounded.lg` (12px): Bento cards, tour containers, pricing tier cards.
  - `rounded.xl` (16px): Hero placeholder frames, modal sheets.
  - `rounded.pill` (9999px): Floating status badges, filter chips.

---

## 5. Component Specifications

### 5.1 Primary Button (`button-primary`)
- **Background**: `{colors.brand-blue}` (`#1877F2`)
- **Text**: `{colors.on-primary}` (`#FFFFFF`) with weight 600
- **Radius**: `{rounded.md}` (8px)
- **Dimensions**: `height: 44px`, `padding: 0 24px`
- **Interaction**: Subtle spring scale (`scale(0.98)` on click), shadow lift on hover.

### 5.2 Secondary Button (`button-secondary`)
- **Background**: `{colors.surface-card}` (`#FFFFFF`)
- **Border**: `1px solid {colors.hairline}` (`#E2E8F0`)
- **Text**: `{colors.ink}` (`#0F172A`)
- **Hover**: Background shifts to `{colors.brand-pink-subtle}` (`#FDF8F9`) with `{colors.brand-pink}` border tint.

### 5.3 Dummy Image Placeholder (`dummy-placeholder-frame`)
- **Philosophy**: Pure graphic placeholder. **Zero faux OS window chrome, zero fake browser dots, zero fake URL bars.**
- **Canvas**: Clean dark container (`#0F172A`) with subtle dashed outline (`#334155`).
- **Visual Icon**: Universal photography/artwork vector icon with centered text: `"DUMMY PLACEHOLDER IMAGE"`.
- **Alt Text Requirement**: The `alt` attribute strictly serves as an **AI image generation prompt** (e.g. for Midjourney/DALL-E) detailing subject, style, lighting, composition, and aspect ratio.

### 5.4 Bento & Feature Cards
- **Background**: Crisp `{colors.surface-card}` (`#FFFFFF`) with subtle 1px hairline border.
- **Top Accent**: Micro-interactive animated icon wrapper with smooth spring physics (`bounce`, `pulse`, `tilt`, `lift`).
- **Hover**: 2px lift elevation with subtle ambient rose shadow (`0 12px 32px -8px rgba(244, 63, 94, 0.08)`).

### 5.5 Interactive Tour Switcher
- **Container**: Tab strip grouped inside a `{colors.surface-soft}` container.
- **Active Tab**: Elevated white pill with `{colors.brand-blue}` icon highlight and subtle box shadow.
- **Animation**: 250ms cross-fade for seamless content transitions.

---

## 6. Motion & Micro-Interactions

1. **Hover Physics**: Micro-interactions on buttons and icons use spring dampening:
   ```css
   transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease;
   ```
2. **Animated Iconography**:
   - `pulse`: Subtle rhythmic breathing (scale 1.05) for security and verification icons.
   - `lift`: Upward elevation (-3px) for action triggers and links.
   - `tilt`: 12-degree isometric rotation for logistics and delivery icons.
   - `bounce`: Playful vertical spring for mobile and conversion icons.
3. **Reduced Motion**:
   All animations automatically deactivate when `prefers-reduced-motion: reduce` is detected by the client device.

---

## 7. Responsive Breakpoint Contract

| Breakpoint | Target Devices | Layout Behavior |
| :--- | :--- | :--- |
| **< 640px** (`sm`) | Compact Smartphones (320px–414px) | Single-column stack. Full-width buttons (`w-full`). Multi-step tables collapse into touch-friendly cards. Fixed 16px horizontal gutters. |
| **640px – 1023px** (`md`) | Tablets & Foldables (768px–960px) | 2-column balanced grids. Hero visual flows below title. Tab controls convert to horizontal swipeable scrollbar. |
| **1024px – 1439px** (`lg`/`xl`) | Laptops & Desktops | Full 3-column bento grids. Side-by-side hero layout (text left, visual right). 32px gutters. |
| **≥ 1440px** (`2xl`) | Ultrawide Monitors (1440px–2560px) | Fixed maximum container constraint (`max-w-7xl` / 1280px). Proportional reading measure (`max-w-2xl` for paragraphs). |

---

## 8. Real-World Business Copywriting Rules

1. **Outcome Over Mechanism**:
   - *Don't write*: "Integrated webhook listeners sync SQL tables with Pathao API."
   - *Do write*: **"One click to print barcodes and book riders. Zero copy-pasting."**
2. **Confidence Over Defense**:
   - *Don't write*: "Is Framique another Shopify clone? Here's our defense."
   - *Do write*: **"The first commerce engine built natively for how Bangladesh sells."**
3. **Positive Prevention Over Painful Math**:
   - *Don't write*: "You lose ৳180 every time a customer rejects a COD order."
   - *Do write*: **"Stop return losses before they happen with automated buyer trust scoring."**

---

## 9. Do's and Don'ts / Design Guardrails

### Do
- **Do** anchor the visual hierarchy in a crisp black-and-white typographic core.
- **Do** use calm soft pink (`oklch(0.978 0.008 25)`) to soften section transitions and eliminate harsh flat-white glare.
- **Do** use Facebook Blue (`oklch(0.55 0.22 255)`) exclusively for primary high-intent action buttons and trust verification.
- **Do** write every image placeholder `alt` tag as an explicit AI generation prompt starting with `"Prompt: "`.
- **Do** maintain bilingual line-height allowances (1.4+ for display, 1.6+ for body) for Bengali script.
- **Do** provide smooth theme toggling with 44px touch targets.

### Don't
- **Don't** use faux OS window chrome (no 3 macOS colored dots, no fake browser URL bars).
- **Don't** coat the artboard in stark `#ffffff` everywhere; always layer smooth calm warmth.
- **Don't** allow contrast to shoot to harsh 21:1 pure black on pure white, nor drop below 4.5:1. Target the 7:1–12:1 eye-soothing sweet spot.
- **Don't** apply negative letter-spacing to Bengali typography.
- **Don't** introduce competing accent colors (purple, green, orange) on primary CTA buttons. Keep primary action blue clean and singular.

---

## 10. Hallmark & 10-Skill WCAG Contrast Matrix (Light & Dark Themes)

### Color Mathematics & Eye-Soothing Calibration
Hallmark enforces perceptual uniformity via OKLCH color space. Instead of blinding 21:1 stark glare or washed-out text, both themes hit the **eye-soothing comfort band**:

#### Light Theme (Warm Blush / Minimalist B&W)
- **Canvas Base**: `oklch(0.978 0.008 25)` (`#FAF6F7`)
- **Card / Elevated Plates**: `oklch(0.995 0.003 25)` (`#FDFBFB`)
- **Headings & Body Ink**: `oklch(0.26 0.015 25)` (`#2B272A`) — **11.2:1** on canvas, **11.8:1** on card (WCAG AAA)
- **Muted / Secondary Copy**: `oklch(0.48 0.018 25)` (`#665E64`) — **5.3:1** on canvas, **5.5:1** on card (WCAG AA)
- **Hairline Borders**: `oklch(0.91 0.008 25)` (`#E7E0E3`) — **1.25:1** subtle structural division
- **Facebook Blue Primary CTA**: `oklch(0.55 0.22 255)` (`#1465E8`) — White text contrast **5.1:1** (WCAG AA)
- **Brand Pink Focal Pip**: `oklch(0.62 0.22 18)` (`#F43F5E`) — 3% viewport rule

#### Dark Theme (Twilight Obsidian)
- **Canvas Base**: `oklch(0.17 0.012 25)` (`#181517`)
- **Card / Elevated Plates**: `oklch(0.21 0.014 25)` (`#221F22`)
- **Headings & Body Ink**: `oklch(0.91 0.008 25)` (`#EAE4E7`) — **11.8:1** on canvas, **10.6:1** on card (WCAG AAA)
- **Muted / Secondary Copy**: `oklch(0.70 0.015 25)` (`#A79EA4`) — **5.8:1** on canvas, **5.2:1** on card (WCAG AA)
- **Hairline Borders**: `oklch(0.30 0.016 25)` (`#363236`) — **1.45:1**
- **Facebook Blue Dark CTA**: `oklch(0.58 0.21 255)` (`#1D70F4`) — White text contrast **4.6:1** (WCAG AA)
- **Brand Pink Luminous Pip**: `oklch(0.72 0.18 20)` (`#FA7287`) — **7.2:1** on dark canvas


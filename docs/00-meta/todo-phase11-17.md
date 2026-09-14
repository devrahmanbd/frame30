# Console UX — Phase 11+ : WordPress-grade content management

Phases 1–10 (Slate & Signal palette, kit, shell, list/detail surfaces, dashboard,
motion, a11y gate) are **done** and stay as the base. Their summary lives in
`docs/02-merchant/console-ux-checklist.md`.

This file now covers the next block of work, derived from a hands-on walk of a
live WordPress 7.1 + Elementor 4.2 admin (pages list, quick edit, post editor,
Elementor canvas/panel, themes screen) plus the Rank Math / Yoast SEO model.
The goal: a merchant who knows WordPress should feel at home in **five
seconds** — same mental model, same words, same click paths — while the visual
layer stays ours (Phase 2 tokens, no wp-admin grey).

---

## Special UI/UX instructions (hand-picked from the maxwilliam.shop walk)

These are non-negotiable for every phase below. If a screen violates one, it is
not done.

| Your ask | Reference screen analysed | What must change in our UI/UX | Phase |
|---|---|---|---|
| **Elementor-like page builder** | `post.php?post=7&action=elementor` | Full-screen editor with dark 48px top bar (Add · Templates · History · doc switcher · Desktop/Tablet/Mobile · Structure · Preview · **Publish**), left 300px widget panel as a searchable 2-column card grid grouped by category, canvas in an iframe with hover handle bars on containers/columns/widgets, empty drop-zone with `+ / folder / ✦` buttons and "Drag widget here", floating Structure navigator, and a **Content · Style · Advanced** settings panel with collapsible sections, per-breakpoint controls, unit toggles and global colours. Our current single inspector + 10 widgets is replaced, not extended. | 14 |
| **Rank Math / Yoast-like extended SEO** | Not installed on the reference site — spec follows Rank Math's meta box | Score chip in the sidebar header, Desktop/Mobile SERP preview with pixel meters, focus-keyword pills, title/description with `%title% %sep% %sitename%` tokens, grouped pass/fail analysis (Basic · Additional · Title readability · Content readability), plus **General · Advanced · Schema · Social** tabs and a site-level Titles & Meta / Sitemap / Redirections settings page. The current `SeoDrawer` (flat form) goes away. | 13 |
| **WordPress-like page management** | `edit.php?post_type=page` + Quick Edit | Status links `All (3) · Published (1) · Drafts (2) · Trash` above the table, `Bulk actions ▾ Apply · All dates ▾ Filter`, right-aligned search, title cell with `— Draft, Builder` suffix and hover row actions `Edit · Quick Edit · Trash · Preview · Edit with Builder`, **Quick Edit expanding in place of the row** (Title · Slug · Date · Password/Private · Parent · Order · Template · Status), two-line `Last Modified / date` column, Trash with restore. | 11 |
| **Post editor like Classic editor** | `post.php?post=1&action=edit` | Editor is a takeover (console chrome hidden), top bar `← · + · ↶↷ · Outline · Edit with Builder · title pill · Preview · device · sidebar toggle · Save`, right sidebar with **Post / Block** tabs and the WordPress key-value list (Status · Publish · Slug · Author · Template · Discussion · Format → popovers), `Set featured image`, `Add an excerpt…`, word count + read time, `Move to trash`, collapsible Categories/Tags. Body uses the Classic two-row toolbar with `Visual | Code` tabs. First open of a post asks **Classic editor** or **Page builder**. | 12 |
| **Theme screen like Appearance › Themes** | `themes.php` | `Themes` + count badge, `Add theme` button, search on the right, 3-up screenshot cards; active card gets a coloured footer bar `Active: <name>` + `Customize`; hover shows centred `Theme details`, inactive cards reveal `Activate · Live preview`; dashed `+ Add theme` card; `Theme details` is a full-screen modal with prev/next arrows. `Customize` opens the builder in Site-settings mode with the live storefront. | 15 |
| **WordPress management (the rest)** | Sidebar, Media, Menus, ⌘K | Content lives under one **Content** section with tabs `Pages · Posts · Media · Menus · Themes`; Media grid + attachment drawer + reusable picker modal; Menus with the two-column "Add items / nested drag list" screen; ⌘K stays in the top bar. Sidebar stays at eight sections — we do **not** copy the 13-item wp-admin menu, grey canvas or plugin nags. | 11, 16 |

Visual rules on top of all of the above: Phase 2 tokens only (no wp-admin
`#f0f0f1` / `#2271b1`), two text tones, hairlines, radii 6/10/14, signal colour
for exactly one primary action per screen, every new state contrast-checked by
the Phase 10 gate.

---

## Click-by-click findings (second walk: every button pressed, 2026-09-04)

Reference screenshots for everything below are in `docs/02-merchant/wp-reference/`
(28 PNGs, named per item). These are **exact behaviours** to reproduce; where a
WordPress detail is rejected it is marked ✗.

### A. Themes (`themes.php`, `theme-install.php`, `customize.php`) → Phase 15

| Clicked | Observed | Our spec |
|---|---|---|
| Themes grid | 3 installed + dashed `Add Theme` card. Active card label reads **`Active: Twenty Twenty-Five`** with single `Customize` button; inactive cards show `Activate · Live Preview` on hover only. Card = screenshot 4:3, name row 48px. | Same three states. Count badge in header. Active footer bar in signal colour. |
| Theme card → `Theme Details` | Full-screen overlay: `‹ ›` prev/next, `✕`, big screenshot left; right: **`Active Theme` eyebrow**, name + `Version: 1.5`, `By the WordPress team`, **`Enable auto-updates`** link, description, `Tags:` line, footer `Customize` (active) / `Activate · Live Preview · Delete` (inactive). | Same layout; replace auto-updates with `Auto-update ▢` toggle from `theme_versions`. |
| `Add Theme` | Top filter bar: **count `8555`**, tabs `Popular · Latest · Block Themes · Favorites`, `Feature Filter` toggle, search on the right, **`Upload Theme`** toggle button beside the title. | Marketplace grid with the same tab row; `Upload theme` toggle reveals a drop-zone plate. |
| `Upload Theme` | Inline panel "If you have a theme in a .zip format, you may install or update it by uploading it here." + file input + `Install Now`. | Same copy shape; accept `.zip`, show progress + validation result (theme.json present, name, version) before install. |
| `Feature Filter` | Drawer with 3 checkbox groups **Subject / Features / Layout** (Blog, E-Commerce, Portfolio… · Accessibility Ready, Custom Colors, Custom Logo… · Grid Layout, One Column, Two Columns…), `Apply Filters` at top and bottom. | Same three groups; our tags come from `theme_registry.tags`. |
| Card hover in Add Theme | Buttons **`Install` + `Preview`**, and centre `Details & Preview` overlay. | Same. Installed ones show `Installed` disabled + `Activate`. |
| `Preview` | Full-screen split: left 300px sidebar (`Close · ‹ · ›`, `Install` button, name, author, **star rating "4.0 rating based on 128 ratings"**, version, description, `Collapse` handle at the bottom), right = live iframe of the demo. No device toggle in this WP version. | Same split; add Desktop/Tablet/Mobile toggle at the sidebar bottom (Customizer has it). |
| `Customize` (block theme) | Customizer shows only `Site Identity · Homepage Settings · Additional CSS`, a "Hurray! Your theme supports site editing" banner, and **device toggle `Desktop · Tablet · Mobile` at the bottom**. Block themes push to the Site Editor (`Identity · Styles · Pages · Navigation · Patterns · Templates`). | `Customize` opens our builder in **Site settings** mode (Elementor model, section C). Keep the bottom device toggle. |
| `Appearance` menu | Only `Themes · Editor · Fonts`; **Menus & Widgets screens say "Your theme does not support navigation menus or widgets"** on block themes. | Our Menus screen still ships (Phase 16) — we're not block-theme bound. |

### B. Elementor editor chrome (`post.php?post=7&action=elementor`) → Phase 14

- **Top bar (48px, `#0c0d0e`)** left→right, exact aria-labels: `Elementor logo (menu)` · `Add Element` · `Angie (AI)` ✗ · `Post Settings` · `History` · `Design System` · centre pill **`Elementor #7 (Draft) ▾`** (document switcher) · device toggle group `Desktop · Tablet Portrait (up to 1024px) · Mobile Portrait (up to 767px)` (tooltip shows breakpoint) · right: `Checklist` ✗ · `What's New` ✗ · `Finder` · `Structure` · `Preview Changes` · **`Publish`** (lilac, 48px tall, disabled until dirty) · `Save Options ▾`.
- **Logo menu** items: `Site Settings · Theme Builder · User Preferences · Keyboard Shortcuts · Help Center · Connect my account ✗ · Exit to WordPress`. Site Settings is **disabled while the Design System panel is open** — mutually exclusive panels.
- **Keyboard shortcuts modal** (three columns Actions / Panels / Go To): Undo ⌘Z · Redo ⌘⇧Z · Copy ⌘C · Paste ⌘V · Paste Style ⌘⇧V · Delete ⌦ · Duplicate ⌘D · Save ⌘S · Finder ⌘E · Show/Hide Panel ⌘P · Site Settings ⌘K · Structure ⌘I · Page Settings ⌘⇧Y · History ⌘⇧H · User Preferences ⌘⇧U · Responsive Mode ⌘⇧M · Template Library ⌘⇧L · Keyboard Shortcuts ⇧? · Quit Esc. **Adopt all of them verbatim** (our ⌘K palette moves to ⌘/ inside the builder).
- **Left panel `Elements` (280px)**: tabs `Widgets · Components · Globals`; search "Search Widget…"; categories are **collapsible headers with a caret** (`Atomic Elements [New] · Atomic Form · Custom Widget · Pro · Layout · Basic · General · Link In Bio · Site · Single · WooCommerce · WordPress`). Cards 120×86 with 24px icon + 12px label; locked cards show a 🔒 top-right; **searching for "Image" returns 7 cards across categories** (fuzzy across all). Footer strip `Access all Pro widgets. Upgrade Now` ✗.
- **Empty canvas**: dashed plate with three 40px round buttons **`+` (dark), `📁` (dark), `✦` (lilac)** and italic "Drag widget here".
- **`+` → "Which layout would you like to use?"** two big icons `Flexbox · Grid`, then a **12-preset picker**: `c100 · r100 · 50-50 · 33-66 · 25-25-25-25 · 25-50-25 · 50-50-50-50 · 50-50-100 · c100-c50-50 · 33-33-33-33-33-33 · 33-33-33-33-66 · 66-33-33-66` (each preset shows direction "Column"/"Row" on hover), `‹` back and `✕`. Reproduce the same 12 presets.
- **Drag & drop**: dragging a card over the canvas shows a **4px lilac horizontal drop indicator line** at the insertion point and the target container gets a lilac outline; the card itself does not ghost. Drop = insert + auto-select + panel switches to the widget's settings. **Clicking a card while a container is selected also inserts** (click-to-add) — required, because many users never drag.
- **Hover/selection handles**: containers get a floating tab centred on the top edge with `+ Add Flexbox · ⋮⋮⋮ Edit/drag · ✕ Delete`; selected = 2px lilac solid outline, hovered = 1px lilac; children inside the same container get lighter outline. Widgets show no handle bar in the atomic editor — selection outline only; **double-click a heading = inline contenteditable**.
- **Right-click context menu** (exact list): `Edit Heading · Duplicate ⌘D · Copy ⌘C · Paste ⌘V · Paste style ⌘⇧V · Paste interactions · Paste from other site · Reset style · Notes · Structure ⌘I · Delete ⌦`.
- **Structure (navigator)**: floating 240px panel top-right, header `▾ collapse-all · ✦ · Structure · ✕`, tree rows 30px with element-type icon; clicking a row selects in canvas; `…` resize grip at the bottom; empty state text "Easy Navigation is Here! Once you fill your page with content…".
- **Responsive mode**: canvas iframe narrows to the breakpoint width (tablet 1024 → 768-wide canvas centred on dark `#3a3b3c` backdrop) and the device tooltip appears above; **no responsive bar in this version**. In Site Settings › Layout the merchant can enable up to 6 breakpoints (`Mobile Portrait · Mobile Landscape · Tablet Portrait · Tablet Landscape · Laptop · Widescreen`) with editable `Breakpoint (px)` inputs. We ship 3 + the same "Active breakpoints" multiselect.
- **Publish / Save Options**: `Publish` is disabled when clean; `Save Options ▾` = `Save Draft · Save as Template`; ⌘S saves; opening Design System with unsaved changes shows a modal **"You have unsaved changes — To open the Design System, save your page first"** with `Stay here · Save & Continue`. Copy the guard.
- **History (⌘⇧H)**: two tabs `Actions · Revisions`. Actions list rows = `<Element> <Verb>` ("Kit Show global settings Edited", "Editing Started"). Revisions empty state: "No Revisions Saved Yet — Revision history lets you save your previous versions…".
- **Page Settings (⌘⇧Y)**: tabs `Settings · Style · Advanced`. Settings = `Title · Status (Draft/Pending Review/Private/Published) · Featured Image · Order · Allow Comments · Hide Title · Page Layout (Default / Elementor Canvas / Elementor Full Width / Theme / Page No Title)`. Style = `Body Style: Margin · Padding · Background Type`. Advanced = `Custom CSS`.
- **User Preferences (⌘⇧U)**: `Panel: Display mode (light/dark/auto) · Width (px)`; `Canvas: Show quick edit options · Expand images in lightbox · Show hidden elements`; `Get Started: Show launchpad checklist` ✗; `Design System: Show global settings`; `Navigation: Exit to (dashboard / this post / all posts)`. Ship Panel + Canvas + Exit-to.
- **Template Library (⌘⇧L)**: modal header tabs `Blocks · Pages · Templates(My Templates)`, actions `Import Template · Sync Library · Save`, left category list (`about · archive · Benefits · call to action · clients · contact · faq · features · footer · Gallery · header · hero · pricing · services · stats · subscribe · team · testimonials · 404 page …`), `MY FAVORITES`, search. Our Blocks tab reuses the 117 storefront sections grouped by these category names.
- **Finder (⌘E)**: floating command box that searches pages/templates/settings/"Create new" — our ⌘K palette already does this; keep it reachable at ⌘E inside the builder.

### C. Elementor settings panel (atomic V4 editor) → Phase 14

- Panel header: `Edit Image` + widget icon, tabs **`General · Style · Interactions`** (equal width, 2px underline). Classic widgets use `Content · Style · Advanced`; we adopt the **V4 naming** since that is where Elementor is heading, but keep an `Advanced` accordion at the bottom of Style for attributes/CSS.
- **General (Heading)**: `Content › Title` (textarea) · `Settings › Tag (H1–H6/div/span/p)` · `Link (+ opens URL/target/nofollow popover)` · `ID` · `Attributes 👑` · `Display Conditions 👑`. **General (Image)**: `Image` picker plate with three entry points **`Select image · Upload · Insert from URL`**, `Resolution (Full/Large/Medium/Thumbnail)`, `Link`, `ID`.
- **Style tab** starts with a **`Classes` row**: chip `local ⋮` + input "Type class name" — styles apply to the local instance unless a global class is chosen; `Class Manager` button top-right; Design System › Classes lists them (empty state "There are no global classes yet…"). Then eight **collapsible sections, all closed by default**, each with a chevron and hairline separator:
  - `Layout` — Display · Flex child (Align self · Order · Flex Size)
  - `Spacing` — Margin (Top/Right/Bottom/Left with link toggle) · Padding (same)
  - `Size` — Width · Height · Min width · Min height · Max width · Max height · Overflow
  - `Position` — Position · Z-index · Anchor offset
  - `Typography` — Font family · Font weight · Font size · Text align · Text color
  - `Background` — Overlay · Color · Clipping
  - `Border` — Border width · Border color · Border type · Border radius
  - `Effects` — Blend mode · Opacity (%) · Box shadow (+) · Transform (+, has ⚙ presets) · Transitions (+) · Filters (+) · Backdrop filters (+)
  - `Custom CSS 👑` (locked in free)
  Every numeric control = input + unit dropdown (`px % em rem vw auto`); "+" rows open a repeater; every control has a hidden per-breakpoint indicator that appears when the device toggle is not Desktop.
- **Interactions tab**: empty state "Animate elements with Interactions — Add entrance animations and effects triggered by user interactions such as page load or scroll." + `Create an interaction` button. Ship entrance animation (fade/slide/zoom, duration, delay, once/repeat) here, not in Advanced.
- **Design System button (💧)** opens a dark panel with tabs **`Variables · Classes`**; `Create a variable ▾` offers **`Color · Font · Size`**; footer `Save changes`. Map to our theme tokens editor.

### D. Site Settings (⌘K) hierarchy → Phases 14/15 "Customize" mode

Panel title `Site Settings`, back `‹` top-left, `✕` top-right, sticky lilac `Save Changes` footer. Menu is grouped:

- **DESIGN SYSTEM** — `Global Colors` (System: `Primary #6EC1E4 · Secondary #54595F · Text #7A7A7A · Accent #61CE70`; Custom list + `Add Color`); `Global Fonts` (System: Primary/Secondary/Text/Accent each with ✎ typography popover; Custom + `Add Style`; `Fallback Font Family` input).
  - Toggle **`Show global settings`** ("Temporarily overlay the canvas with the style guide") swaps the canvas for a **live style-guide page** showing colour swatches with hex labels and the four font samples "The five boxing wizards jump quickly." **Build this style-guide overlay** — it is the single best onboarding moment we saw.
- **THEME STYLE** — `Typography` (Body text colour/typography/paragraph spacing; Link colour/typography; H1–H6 colour+typography), `Buttons` (Typography · Text Shadow · Text Color · Background Type Classic/Gradient · Box Shadow · Border Type · Border Radius · Padding, with Normal/Hover tabs), `Images` (Border Type · Radius · Opacity · Box Shadow · CSS Filters), `Form Fields` (Label colour/typography; Field typography/text/accent/background colour/box shadow/border/radius/padding).
- **SETTINGS** — `Site Identity` (Site Name · Site Description · Site Logo · Site Favicon), `Background` (Type · Mobile Browser Background · Overscroll Behavior), `Layout` (Content width, gap, breakpoints — see B), `Lightbox` (Image Lightbox on/off · Counter · Fullscreen · Zoom · Share · Title/Description source (None/Title/Caption/Alt/Description) · colours · icon sizes), `Page Transitions 👑`, `Custom CSS 👑`, `Additional Settings`.

### E. Media & uploads (Elementor media control + `upload.php`) → Phases 14/16

- Media modal = WordPress `Add media` frame: left rail `Actions › Add media · Insert from URL`, top tabs **`Upload files · Media Library`**, filters `All media items ▾ · All dates ▾`, search, big drop-zone "Drop files to upload — or — Select Files — Maximum upload file size: 100 MB", right `ATTACHMENT DETAILS` column (thumb, filename, date, size, dimensions, `Edit with Elementor AI` ✗, `Edit Image`, `Delete permanently`, **`Alt Text` with helper link, `Title`, `Caption`, `Description`, `File URL` + `Copy URL to clipboard`**), footer `Insert into post`. Reproduce this exact modal as `MediaPicker` (also used for featured image, SEO social image, theme logo).
- **SVG upload is rejected by default** — dropping `t.svg` shows an inline red row "**t.svg — This file cannot be processed by the web server**" with `Dismiss errors`. It only works after `Elementor › Settings › Advanced › Enable Unfiltered File Uploads` (warning copy: "Allowing uploads of any files (SVG & JSON included) is a potential security risk. Elementor will try to sanitize…"). **Our rule**: SVG allowed by default but always sanitised server-side (strip `<script>`, `on*=`, `<foreignObject>`, external hrefs); show a `Sanitised` badge in details; a merchant toggle `Allow raw SVG` under Settings › Media, off.
- PNG upload works instantly; details show `156 B · 64 by 64 pixels`; re-uploading the same name auto-suffixes (`t-4.png`) — do the same.
- Atomic **`SVG` widget** and `Image` widget both offer `Upload · Insert from URL`; Image adds `Select image` (library).
- `upload.php`: `List view | Grid view` toggle, `Add Media File` reveals an inline drop-zone under the header, filters `All media items · All dates`, `Bulk select`, search. List columns `File · Author · Uploaded to · Date`. Grid item click → the same attachment modal with `‹ ›` prev/next. Plus footer links `View media file | Edit more details | Download file | Delete permanently`.
- Elementor › Settings › Performance shows what to expose later: `CSS Print Method (External/Internal)`, `Optimized Image Loading (fetchpriority on LCP, lazy below fold)`, `Lazy Load Background Images`, `Load Google Fonts Locally`, `Element Cache`. Ship `Optimized image loading` + `Local fonts` as always-on, no toggle.

### F. Pages / Posts management (`edit.php`) → Phase 11

- **Screen Options** drawer: `Columns ☑ Author ☑ Comments ☑ Date`, `Pagination — Number of items per page`, `View mode ◉ Compact ◯ Extended`. We fold this into the DataTable column chooser + a `Compact / Comfortable` density toggle.
- Row hover actions exactly: **`Edit | Quick Edit | Trash | Preview | Edit with Elementor`** (published rows say `View` instead of `Preview`).
- **Quick Edit plate** (screenshot `wp_pages_quick_edit.png`): 2-column grid inside the table width, label column 80px; left `Title (focused on open) · Slug · Date [09-Sep ▾][04],[2026] at [11]:[14] · Password [ ] –OR– ☐ Private`; right `Parent ▾ (Main Page (no parent)) · Order [0] · Template ▾ (Default template / Elementor Canvas / Elementor Full Width / Page No Title / Theme) · ☐ Allow Comments · Status ▾ (Published / Pending Review / Draft)`; footer `Update` (primary) `Cancel` (outline). Field order is fixed — copy it.
- **Bulk Edit** plate: left list of selected titles each with `✕ Remove`, then `Author · Parent · Template · Comments · Status` all defaulting to **`— No Change —`**, footer `Update · Cancel`.
- Posts list adds `Categories · Tags · 💬` columns and an `All Categories ▾` filter; Categories screen is the classic **left "Add Category" form (Name · Slug · Parent · Description) + right table** — reuse for our Collections/Categories tab.
- Comments screen: status links `All · Mine · Pending · Approved · Spam · Trash`, bulk `Unapprove · Approve · Mark as spam · Move to Trash` — map to product reviews moderation.

### G. Block/Classic editor (`post-new.php`, `post.php?post=1`) → Phase 12

- Top bar buttons, in order: `Block Inserter (+)` · `Undo` · `Redo` · `Document Overview` · **`Edit with Elementor`** (button beside the title) · centre `No title · Page` pill · `Save draft` · `View` · `Preview (opens in a new tab)` · `Settings` · **`Publish`** · `Options ⋮`.
- Right sidebar `Page | Block` tabs. Page tab order: title, `Set featured image` plate, `Generate with Elementor AI` ✗, `Add an excerpt…`, "15 words, 1 minute read time.", "Last edited 14 hours ago.", then key/value rows `Status Draft · Publish Immediately · Slug 21 · Author maxw · Template Pages · Discussion Closed · Parent None` (posts: `Format Standard`, `Move to trash`, `Categories`, `Tags`).
- Inserter tabs `Blocks · Patterns · Media` with groups `TEXT · MEDIA · DESIGN · WIDGETS · THEME`; the **`Classic` block** is what gives the TinyMCE two-row toolbar — our Classic editor = that toolbar as the whole body.
- Admin bar: `W · Site name · Ctrl+K (command palette) · 💬 0 · + New · Howdy, user`. Keep `+ New ▾` (Page · Post · Product · Media) in our top bar.

### H. Users, Settings, Tools (for "the rest of WordPress management")

- `Add User`: Username* · Email* · First · Last · Website · Password (`Generate password`, strength meter `Strong`, `Hide`) · `☑ Send User Notification` · Role ▾ (Subscriber · Contributor · Author · Editor · Administrator). Map to `merchant_members` invite with our roles.
- Profile: `Personal Options (Syntax highlighting · Admin color scheme · Keyboard shortcuts · Toolbar · Language)`, `Name`, `Contact Info`, `About Yourself + Profile Picture`, `Account Management (New password · Sessions › Log out everywhere · Application Passwords)`. Ship Sessions + App passwords (API keys) in Settings › Account.
- Elementor `Role Manager`: "Manage What Your Users Can Edit In Elementor Editor" per role (`No access · Access to edit content only`). Add the same per-role builder permission.
- Elementor `Tools`: tabs `General (Regenerate CSS · Sync Library) · Replace URL · Version Control (rollback) · Maintenance Mode (Coming soon / Maintenance + template) · Website Templates (Import/Export kit)`. **Maintenance mode + Replace URL + Export kit** go into our Settings › Store › Advanced.
- Settings sub-pages we mirror: `Reading (homepage displays · posts per page · search-engine visibility)`, `Discussion (reviews defaults)`, `Media (image sizes · organise uploads by month)`, `Permalinks (structure, category/tag base)`.

---

## What we copy from WordPress, and what we deliberately don't

| WordPress behaviour we adopt | Why |
|---|---|
| **One list screen per content type**: status tabs `All (n) · Published · Drafts · Trash` above the table, bulk-actions select + Apply, date filter, search on the right, item count | Universally learned pattern; our DataTable already has 80% of it |
| **Row hover actions** `Edit · Quick Edit · Trash · Preview · Edit with Builder` | Zero-navigation management |
| **Quick Edit** inline panel that expands *in place of the row* (title, slug, date, status, parent, order, template, password/private) | Fastest way to fix metadata without opening the editor |
| **Title cell status suffix** `— Draft`, `— Builder`, `— Privacy Policy Page` | Status readable without a badge column |
| **Editor = full-screen takeover** with its own top bar (back arrow, +, undo/redo, outline, preview device, settings toggle, Save/Publish) | Editing is a mode, not a page |
| **Right settings sidebar with two tabs** — `Page`/`Post` (status, publish date, slug, author, template, featured image, excerpt, discussion, categories, tags, Move to trash) and `Block` (selected element) | Document vs element settings never fight for one panel |
| **Trash, not delete**: 30-day restore, count on the Trash tab | Recoverability |
| **Themes as cards** with screenshot, `Active:` bar, `Customize`, hover `Theme Details`, `Activate` / `Live Preview` on inactive, dashed `Add Theme` card | Instantly recognisable |
| **Command palette ⌘K** in the top bar | Already have it — surface it in the same spot |

| WordPress behaviour we **reject** | Why |
|---|---|
| Grey `#f0f0f1` canvas, black `#1d2327` sidebar, `#2271b1` link-blue everywhere | Legacy look the palette phase removed |
| Plugin nag banners above every list | Noise |
| Comments column for pages | No comments on storefront pages |
| Screen Options / Help tabs | Our column chooser lives in the DataTable toolbar |
| 13-item sidebar | Phase 5 kept eight sections; content lives under **Content** |

---

## Phase 11 — Content desk: Pages & Posts management (WordPress list + quick edit)

**Status: BUILT (2026-09-04).** Shipped as `/admin/content/pages` and `/admin/content/posts`
(`src/components/admin/content/*`, `src/lib/content-desk{,.server,.functions}.ts`, 23 unit tests,
migration adding status/trash/author/parent/order/password/visibility/template/editor columns and
the `content_desk_counts` / `content_desk_authors` RPCs — authenticated-only). Verified headlessly:
status strip + counts, search/date filter, hover row actions, Quick Edit in-row plate, Bulk Edit,
Trash → Restore → Delete permanently with 30-day countdown, `j/k/e/q/#/x/?` shortcuts, 390px layout
with no horizontal overflow, console gate ≥ 90 on both routes.
Carried forward: the old `/admin/pages` and `/admin/marketing/articles` screens still host the
editors (deep-linked via `?edit=<id>` / `?new=1`) until Phase 12 replaces them; Media · Menus · Themes
tabs land in Phases 15–16.

Route family: `/admin/content` with tabs **Pages · Posts · Media · Menus · Themes**.
`/admin/pages` and `/admin/marketing/articles` redirect here.

**List screen (both Pages and Posts), built only from `kit.tsx`:**
- Header: title + primary `Add page` / `Add post` (signal colour, 36px, radius 10).
- Status strip directly under header: `All (12) · Published (9) · Drafts (2) · Scheduled (0) · Trash (1)` — text links with counts, active one in `foreground` + 600 weight, others `muted-foreground`. This is *not* the saved-views chip row; it sits above the toolbar.
- Toolbar: `Bulk actions ▾` (Edit / Move to Trash / Publish / Unpublish) + `Apply`, `All dates ▾`, `Filter`; search input right-aligned with `Search pages` button; item count to the far right in `fq-num`.
- Columns — Pages: `☐ · Title · Author · Template · SEO · Date`. Posts: `☐ · Title · Author · Categories · Tags · SEO · Date`.
  - Title cell = bold link + muted suffix (`— Draft`, `— Builder`, `— Home page`), hover reveals action row under it: `Edit · Quick Edit · Trash · Preview · Edit with Builder` (13px, separated by `|` in `border`, `Trash` in `danger`).
  - SEO cell = Rank Math-style score dot (green ≥ 80 / amber ≥ 55 / red) + focus keyword in muted; tooltip lists failing checks.
  - Date cell = two lines `Last Modified` / `2026/09/04 at 8:53 am` or `Published` / date, tabular numerals.
- **Quick Edit**: clicking it replaces the row with an inline plate (`bg-card`, hairline, radius 10) holding a 2-column form: left `Title · Slug · Date (d/m/y h:m) · Password —OR— ☐ Private`, right `Parent ▾ · Order · Template ▾ · Status ▾ · ☐ Allow comments (posts only)`; footer `Update` (signal) + `Cancel` (ghost). Esc cancels. Saves via optimistic() with rollback.
- Bulk Edit (when ≥2 rows selected + Bulk actions → Edit): same plate but fields become "— No change —" selects.
- Trash tab rows show `Restore · Delete permanently` instead of the normal action row; a 30-day purge notice sits under the tab strip.
- Empty state: one plate, "No pages yet", CTA `Add page`, secondary `Browse templates`.
- Keyboard: `j/k` row, `e` edit, `q` quick edit, `#` trash — hint row in `?` shortcut help.

**Data:** add `trashed_at`, `menu_order`, `parent_id`, `password`, `visibility`, `template`, `editor` (`classic|builder`) to `storefront_pages` / `articles` where missing; counts come from one RPC per content type.

---

## Phase 12 — Editors: full-screen takeover shell (shared by classic editor & builder)

**Status: BUILT (2026-09-04).** Shipped as `/admin/content/editor?kind=page|post[&id][&editor=builder]`
(`src/components/admin/editor/*`, `src/lib/editor/*` — doc model, history, markdown↔block bridge,
server + typed server functions, 20 unit tests; migration adding `featured_image_url`, `articles.format`,
`article_revisions`, `page_revisions`). Route renders without console chrome (`chrome: false` on the
route → bare `<Outlet />` in `admin.tsx`). Verified headlessly on both kinds: takeover with no shell in
tab order, 56px top bar, Page/Block sidebar tabs, `⌘S` create + URL id, status/publish popovers,
publish, reload persistence, revisions list/restore, Classic ↔ Builder switch, first-visit post choice
card, list → editor → list round trip, 390px no horizontal overflow, Esc back to list, console gate 100
at 390/768/1280/1920 × light/dark/reduced-motion, zero console errors.
Carried forward: post tags are free text stored on `articles.tags` and categories degrade gracefully
because the `blog_terms` / `article_terms` taxonomy tables referenced by the older TaxonomyDesk were
never migrated — restore them (or point TaxonomyDesk at a real table) before Phase 13's SEO panel;
the old `/admin/pages?edit=` and `/admin/marketing/articles?edit=` editors can now be retired.

One `EditorShell` used by pages, posts and the builder.


- **Takeover**: `position: fixed; inset: 0`, `z` above console shell; the console sidebar/topbar are gone while editing (WordPress Gutenberg behaviour). `←` at far left returns to the list and asks to save if dirty.
- **Top bar (56px, `bg-card`, hairline bottom)** left → right: `← back` · `+ Add` (signal square 32px) · `↶ ↷` · `☰ Outline` · `▣ Edit with Builder` (signal, only in classic mode) · centre pill showing `Title · Page` in `bg-muted` radius 8 · right: `Preview in new tab ↗` · device switch `🖥 📱` · `Settings sidebar toggle` (filled when open) · `Save draft` (ghost) · `Publish`/`Update` (signal) · `⋮`.
- **Canvas**: centred 720px reading column for classic; full-width for builder.
- **Right sidebar (320px, resizable to 420)**: two tabs `Page`/`Post` and `Block`/`Element` styled as underline tabs (2px signal underline, not pills).
  - Document tab, top → bottom, exactly as WordPress: featured image button plate → `Add an excerpt…` link → word count + read time + "Last edited 13 hours ago" (muted) → key/value list `Status · Publish · Slug · Author · Template · Discussion · Format` (label muted left, value as signal-coloured inline button right; clicking opens a popover, not a new page) → `Move to trash` (full-width, hairline, danger text) → collapsible `Categories`, `Tags` (posts) or `Page attributes` (pages) → **`SEO` collapsible (Phase 13)**.
- **Status popover**: radio `Draft / Pending review / Private / Published`, `Publish` date picker with "Immediately" default, `☐ Password protected`.
- **Save semantics**: autosave every 10 s to a draft revision (badge "Saved" / "Saving…" / "Unsaved changes" in top bar, reuse `SaveIndicator`); `Publish` opens a pre-publish check panel listing visibility, publish date, SEO score and unresolved builder lints.
- `⌘S` save, `⌘⇧P` publish, `⌘\` toggle sidebar, `⌘Z/⇧⌘Z` undo/redo, `⌘K` command palette still works inside the editor.

**Classic editor (posts + optional for pages)**: TipTap/markdown toolbar in the WordPress Classic layout — one row: `Paragraph ▾ · B I U S · " · ≡ list · 1. list · link · image · ↔ align · ¶ more · ⌨ toolbar toggle`; second row appears on toggle (`text colour · paste as text · clear formatting · special char · indent · undo/redo · help`). `Visual | Code` tabs at top-right of the editor box. Excerpt, Custom fields and Discussion as collapsible meta boxes under the body on narrow screens only.

Posts get a first-visit choice card: **Classic editor** vs **Page builder** with two wireframe thumbnails; remembered per post in `editor`.

---

## Phase 13 — Extended SEO (Rank Math / Yoast model) — replaces `SeoDrawer` — **BUILT**

Shipped: `src/lib/seo/seo-meta.ts` (model, tokens, robots, JSON-LD, grouped analysis),
`src/lib/seo/site-seo{,.server,.functions}.ts`, `src/components/admin/seo/metabox/`
(`SeoMetaBox`, `SerpPreviewCard`, `parts`), `/admin/settings/seo` (Titles & Meta,
Sitemap, Verification, Redirections, 404 monitor), editor wiring through the new
`seo_extended` column on `storefront_pages` / `articles`, and `src/lib/seo/seo-meta.test.ts`.
Remaining for a follow-up: the second render of `SeoMetaBox` under the classic body,
`blog_terms` / `article_terms` taxonomy tables, and the signed-in console gate sweep
(the gate skips without a preview session).

Component: `SeoMetaBox`, rendered (a) in the editor sidebar as a collapsible with the score chip in its header, and (b) as a full meta box under the classic editor body. Same analyser, same score.

**Header**: `SEO` + score chip `82 / 100` coloured green/amber/red (Rank Math ranges: ≥81 great, 51–80 good, <51 poor) + focus keyword as a pill.

**Tabs inside (underline style): `General · Advanced · Schema · Social`**

- **General**
  1. **Preview card** with `Desktop | Mobile` toggle; shows favicon + site name + URL breadcrumb line, blue title, description; pixel width meters underneath (`Title 512 / 580 px`, `Description 720 / 920 px`) rendered as thin progress bars turning amber past 90 %.
  2. `Focus keyword` input with pill chips, allows up to 5, first is primary; keyword suggestions hidden for now (no external API).
  3. `SEO title` input with **variable tokens**: `%title%`, `%sep%`, `%sitename%`, `%excerpt%`, `%category%` — token insert dropdown at the right of the input; live-resolved in preview; length bar.
  4. `Permalink` slug editor with the full URL prefix shown in muted.
  5. `Meta description` textarea with token dropdown; length bar; "Use excerpt" ghost link.
  6. **Analysis groups** (Rank Math style, collapsible, each with pass/fail count in the header):
     - *Basic SEO*: keyword in title, in description, in URL, in first 10 %, in content, content length.
     - *Additional*: keyword in subheading, in image alt, keyword density, URL length, external/internal links, keyword not used before.
     - *Title readability*: keyword at beginning, sentiment/power word (skip if no dataset), number in title.
     - *Content readability*: table of contents, short paragraphs, media present.
     Each check = ✓/✗/! icon + one-line hint; failing ones first.
- **Advanced**: `Robots meta` checkboxes (`Index / No index / No follow / No archive / No image index / No snippet`), `Advanced robots` (`max-snippet`, `max-video-preview`, `max-image-preview`), `Canonical URL`, `Redirect` (301/302/307 target + toggle), `Breadcrumb title`.
- **Schema**: schema type select (`Article · BlogPosting · Product · FAQPage · HowTo · Organization · WebPage · None`) with per-type fields (headline, author, dates auto-filled; FAQ repeater; HowTo steps repeater); live JSON-LD preview in a code plate with a `Test with Rich Results` external link.
- **Social**: sub-tabs `Facebook | X`; image picker with recommended size hint, title + description with "Use SEO title/description" toggle, card type select for X, live card preview.

**Site-level SEO** (`/admin/settings/seo`): `Titles & Meta` (per type templates using the same tokens; separator picker `- · | · –`), `Sitemap` (per type include toggle, links to `/store/:slug/sitemap.xml`), `Search Console` (verification meta), `Redirections` table, `404 monitor` (last 100), `Instant indexing` off. Reuse `seo_meta`, `seo_meta_audit`, `merchant_settings`.

Data: extend `PageSeo` with `focusKeywords[]`, `robots{}`, `advancedRobots{}`, `redirect{}`, `breadcrumbTitle`, `schema{}`, `twitter{}`; keep `scoreBuilderSeo` pure and shared client/server.

---

## Phase 14 — Page builder: Elementor parity for the visual model

Today: sections → columns → 10 widgets, one inspector, device switch, undo/redo. Elementor 4 shows what is missing. Target model:

**Layout (Elementor 4.2 structure)**
- **Top bar (48px, near-black, always)**: exactly the button order, tooltips and shortcuts in **Findings §B** (logo menu · Add Element · Page Settings · History · Design System · doc switcher · Desktop/Tablet/Mobile with "(up to 1024px)" tooltips · Finder · Structure · Preview · **Publish** disabled-when-clean · `Save Options ▾` = Save draft / Save as template). All 19 keyboard shortcuts from §B verbatim. Unsaved-changes guard modal before opening Design System / Site settings.
- **Left panel (300px)**: header `Elements`, tabs `Widgets | Components | Globals`, search `Search widget…`, **collapsible categories** each a 2-column grid of 120×88px cards (icon 24px + label 12px); pro/locked cards show a lock, greyed.
- **Canvas (iframe at device width)**: sections show a floating handle bar on hover/selection (`⋮⋮ drag · + add · ⧉ duplicate · ✕ delete`) centred on top edge; columns show a small handle at top-left; widgets show a right-edge handle (`✎ edit · ⧉ · ✕`). Selected outline = signal 2px; hover = signal 1px dashed. Empty column shows the three round buttons `+ · 📁 · ✦` and "Drag widget here".
- **Right panel — Structure/Navigator (280px, floating, draggable, collapsible)**: tree of `Container › Column › Widget`, drag to reorder, eye to hide, rename on double-click. Empty state: illustration + "Once you fill your page with content, this window gives an overview…".
- **Bottom of left panel**: `Settings ⚙ · Navigator · History · Responsive` icon row; `Access all widgets` footer removed.

**Widget settings panel (replaces left panel when an element is selected)**: header `Edit Heading` with back arrow; **three tabs `Content · Style · Advanced`** styled as equal-width top tabs with icon + label; each tab is a list of **collapsible sections** (`Title`, `Typography`, `Text shadow` …) with a chevron; every responsive-able control shows a small device icon that switches the value per breakpoint; every colour control shows a global-colour dropdown + picker; units toggle (`px % em rem vw`) on size controls; a `↺ reset` on hover.
- *Content*: widget-specific (text, link, level, size preset, alignment).
- *Style*: text colour, typography (family/size/weight/transform/style/decoration/line-height/letter-spacing), text shadow, blend mode.
- *Advanced*: layout (margin, padding with link-toggle, width, position, z-index), motion effects (entrance animation with duration/delay), transform, background, border, mask, responsive (hide on desktop/tablet/mobile), attributes (custom id/class), custom CSS.

**Containers**: replace fixed section→column with Elementor 4's `Flexbox` and `Grid` — direction, justify, align, gap, wrap; the `+` on an empty area asks "Which layout would you like to use? Flexbox · Grid" then shows the **12 presets listed in §B** (`c100 · r100 · 50-50 · 33-66 · 25-25-25-25 · 25-50-25 · 50-50-50-50 · 50-50-100 · c100-c50-50 · 33×6 · 33×4+66 · 66-33-33-66`).

**Drag & drop and selection (§B)**: 4px signal drop-indicator line + container outline while dragging; click-to-add when a container is selected; container handle tab `+ · ⋮⋮⋮ · ✕` on the top edge; 2px selected / 1px hover outlines; double-click text = inline edit; right-click context menu with the 11 items in §B; floating resizable Structure panel.

**Settings panel (§C)**: tabs `General · Style · Interactions`; Style opens with the `Classes` chip row then the eight closed accordions `Layout · Spacing · Size · Position · Typography · Background · Border · Effects` with exactly the controls listed in §C, unit dropdowns on every length, `+` repeaters for shadow/transform/transitions/filters; Interactions holds entrance animations. Image/SVG controls expose `Select image · Upload · Insert from URL` and open the `MediaPicker` from §E (SVG sanitised, never rejected with a server error).

**Responsive (§B)**: canvas resizes to breakpoint width on a dark backdrop; per-control device indicator when not on Desktop; Site settings › Layout offers the 6-breakpoint "Active breakpoints" multiselect with editable px values.

**Widget catalogue** — free-Elementor basics first, all styled by tokens: `Container, Grid, Heading, Image, Text editor, Video, Button, Divider, Spacer, Google Maps, Icon, Tabs, Accordion, Toggle, Image box, Icon box, Image carousel, Basic gallery, Icon list, Counter, Progress bar, Testimonial, Social icons, Alert, HTML, Shortcode→App block, Menu anchor, Read more, Rating, Text path`. Commerce widgets (`Products, Product categories, Add to cart, Cart, Checkout, Menu cart, Reviews`) reuse the existing 117 storefront section renderers via adapter.

**Templates & blocks**: `Templates` (⌘⇧L) opens the modal from §B — tabs `Blocks | Pages | My templates`, `Import · Sync · Save` actions, the left category list (hero, features, pricing, testimonials, faq, footer, header, cta, team, stats, subscribe, 404…), favourites, search, `Insert`; `Save as template` on any container; `Import/Export` JSON. **Design System** panel (Variables: Color/Font/Size · Classes) and **Site Settings** (⌘K, hierarchy in §D incl. the *Show global settings* style-guide overlay) map to the theme token editor.

**Page settings (⌘⇧Y)**: tabs `Settings · Style · Advanced` with the exact fields in §B (Title · Status · Featured image · Order · Allow comments · Hide title · Page layout Default/Canvas/Full width/Theme/No title; Body margin/padding/background; Custom CSS).

**History (⟲)**: `Actions | Revisions` — actions list with element + verb ("Heading edited"), revisions list with author/time + restore.

Keep: single render path (`PageCanvas`) for edit and preview; JSON in the existing body column; server-side HTML fallback.

---

## Phase 15 — Themes screen (Appearance › Themes parity) — **BUILT**

Route: `/admin/content/themes` (also linked from Settings). Replaces the marketplace-first view for the merchant.

- Header `Themes` + count badge in a `bg-muted` pill.
- Toolbar: `Add theme` (signal) left; `Search installed themes` right.
- Card grid, 3-up ≥1280 / 2-up ≥768 / 1-up: 16:10 screenshot plate, hairline, radius 14, micro-shadow; **hover** darkens the shot and centres a `Theme details` button plate; footer row `Name` + actions.
  - **Active card**: footer becomes a signal-coloured bar `Active: Atelier` with a white-outline `Customize` button. Same for our accent, not WP blue.
  - **Inactive card**: `Activate` (ghost) + `Live preview` (signal) appear on hover.
  - Last cell: dashed `+ Add theme` card.
- `Theme details` opens a full-screen modal (WordPress behaviour): large screenshot left; right: name, version, author, description, tags; footer `Activate / Live preview / Customize`, `Delete` far right in danger. `‹ ›` arrows to move between themes.
- `Customize` opens the existing builder in **Site settings** mode with the full §D hierarchy (Design system › Global colours/fonts with the style-guide overlay; Theme style › Typography/Buttons/Images/Form fields; Settings › Identity/Background/Layout/Lightbox) and the storefront live in the iframe, bottom device toggle from the Customizer.
- `Add theme` = the §A install screen: count badge, tabs `Popular · Latest · Favourites`, `Feature filter` drawer (Subject / Features / Layout), `Upload theme` toggle with .zip drop-zone + validation, cards with `Install · Preview` and centred `Details & Preview`; installed ones show `Installed` + `Activate`.
- `Preview` = the §A split view (300px sidebar with `‹ ›`, Install, rating, version, description, collapse handle; live iframe; device toggle at bottom).
- Theme details modal adds `Version · By author · Auto-update toggle · Tags`.
- Data: `store_themes` (installed), `theme_registry`/`marketplace_themes` (catalogue), `theme_versions`.

---

## Phase 16 — Media library & Menus (rounds out "WordPress management")

- **Media**: the §E screen — `List | Grid` toggle, `Add media file` inline drop-zone ("Drop files to upload · Select files · Max size"), filters type/date, `Bulk select`, search; grid click → attachment modal with `‹ ›`, `Edit image`, `Alt text (helper link) · Title · Caption · Description · File URL + Copy`, footer `View · Edit more · Download · Delete permanently`. Same modal as `MediaPicker` (`Upload files | Media library`, `Insert from URL`) used by builder widgets, featured image, SEO social image, theme logo/favicon. **SVG**: accepted, sanitised, badge shown; raw-SVG toggle off by default. Duplicate filenames auto-suffix.
- **Menus**: left column "Add menu items" accordion (`Pages · Posts · Collections · Products · Custom links`) with checkboxes + `Add to menu`; right column nested drag list with expandable item settings (`Navigation label · Title attribute · Open in new tab · CSS class`), depth via drag-right; `Menu settings` display locations (header, footer, mobile); `Save menu`.

---

## Phase 17 — Storefront theme runtime — **BUILT**

- `theme_assets` table + `src/lib/themes/assets.ts|.server.ts|.functions.ts`: custom CSS and colour-token overrides, scoped to one installed theme or all, enable/disable without deleting, sanitised client- and server-side (`@import`, `expression()`, `javascript:`, `<script>`, `behavior` stripped), 100 KB cap.
- Appearance › Themes gains a **Custom CSS & assets** view (`ThemeAssetsPanel`) with live rule/byte counters and a removal warning; zero axe violations at 390/1280.
- Storefront injects the combined CSS through `ThemeChrome` (`<style data-fq-theme-assets>`).
- Per-page theme pinning: `storefront_pages.theme_id`, resolved by the page loader via `publishedThemeById`; picked in the editor sidebar (`Theme → Site theme / installed theme`).
- Builder documents now render as builder HTML on the storefront for both pages (`store/$slug/pages/$pageSlug`) and posts (`ArticleBody`), with the `fq-builder-page` base style utility.

---

## Phase 17b — Verification (extends the Phase 10 gate)

- `scripts/console-gate.mjs` gains `content` (list + quick edit open), `editor-classic`, `editor-builder` (with a widget selected, Style tab open), `themes`, `media`, `menus` scenarios at 390/768/1280/1920 × light/dark/reduced.
- Contrast: every new signal-on-card element (SEO score chips, active theme bar, selected outlines) asserted ≥ 4.5:1 text / 3:1 UI via `console-a11y.ts`.
- Keyboard-only run: list → quick edit → save → open editor → publish → back, without a mouse.
- The 28 reference screenshots already live under `docs/02-merchant/wp-reference/`; add a side-by-side page to `console-ux-checklist.md` so reviewers compare intent, not memory.
- Builder-specific checks: drop indicator visible while dragging; click-to-add works; every §B shortcut fires; SVG upload succeeds and is sanitised; tablet/mobile canvas widths are 1024/767; all eight Style accordions open/close with keyboard; unsaved-changes guard blocks Site settings.

---

## Order of execution

11 (lists + quick edit) → 12 (editor shell + classic) → 13 (SEO box) → 14 (builder) → 15 (themes) → 16 (media/menus) → 17 (gate). Each phase ships behind the existing permission guards and keeps every old `/admin/*` URL redirecting.

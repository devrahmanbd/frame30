# `/contact`

Route: `src/routes/contact.tsx` · Shell: marketing (top-nav + footer) · Scope: public, unauthenticated

## SEO

- **Title** (58 characters): `Contact Framique — sales, support, security, press`
- **Description** (159 characters): `Reach the right Framique team the first time. Routed contact form for sales, migration, technical support, billing, security and partnerships — no ticket maze.`
- **og:title**: `Talk to the right person. First time.`
- **og:description**: `One form, eight destinations, no ticket maze. Sales, support, billing, security disclosure, partnerships — routed on submit.`
- **og:image**: `/og/contact.png` (1200×630, dark canvas, glass card mock of the routed form, white Geist headline "Talk to the right person")
- **canonical**: `/contact`
- **JSON-LD**: `ContactPage` node wrapping an `Organization` with an array of `ContactPoint` entries (one per queue: sales, technicalSupport, billingSupport, security, partnerships, press, careers), each with `contactType`, `availableLanguage: ["en","bn"]`, and `{{support_email}}` placeholders per queue until real addresses are confirmed. Add `BreadcrumbList` (`Home / Contact`).
- **H1 rule**: exactly one `<h1>` on the route — the hero headline. All routing-band, form, and FAQ headings are `<h2>`/`<h3>`.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `contact framique support`
  - **Secondary**:
    - `ecommerce platform support bangladesh`
    - `sales enquiry ecommerce platform`
    - `security disclosure contact`
    - `migration help online store`
  - **Long-tail / question intents**:
    - `talk to an ecommerce platform sales team in bangladesh`
    - `report a security issue to a saas vendor`
  - **Placement**: H1 (primary), routing band labels, FAQ band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/contact`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

**To confirm before publish**: legal entity name, registered address, phone number(s), per-queue email addresses, published response-time SLAs, business hours in BST — none of these are invented below; every instance is a labelled placeholder.

## Band order

1. Hero
2. Choose the right door (routing table)
3. The contact form (full field spec)
4. Write a ticket that gets solved first time (template + guidance)
5. Ticket lifecycle and severity definitions
6. Self-serve deflection
7. Anti-spam, rate limits, and privacy notice
8. What happens to your data after you submit
9. Enterprise & migration consultation
10. Offices & hours (placeholder template)
11. Accessibility spec
12. Success and failure states
13. FAQ
14. Final CTA

---

## 1. Hero — aurora hero, canvas

*Lever: reduce commitment anxiety before the ask — tell people what happens the moment they click send.*

- **Eyebrow**: `{{support_hours_placeholder}} · {{support_timezone_placeholder}}`
- **H1**: **Talk to the right person. First time.**
- **H1 বাংলা**: **প্রথমবারেই সঠিক মানুষের সাথে কথা বলুন।**
- **Sub**: One form, eight destinations. Tell us what you need and we route it — no ticket number instead of an answer.
- **Sub বাংলা**: একটি ফর্ম, আটটি গন্তব্য। আপনার প্রয়োজন জানান, আমরা তা সঠিক জায়গায় পাঠিয়ে দেব — উত্তরের বদলে শুধু টিকিট নম্বর নয়।
- **Primary CTA**: `Send a message` (scrolls to form, id `#contact-form`)
- **Primary CTA বাংলা**: `বার্তা পাঠান`
- **Alt CTA**: `Check docs and status first`
- **Alt CTA বাংলা**: `প্রথমে ডকুমেন্টেশন ও স্ট্যাটাস দেখুন`
- **Design note**: hero mesh at low alpha (violet→teal), headline in `display-xl`, sub in `subhead` on `ink-muted`. No gradient spotlight card in the hero itself — that's reserved for the enterprise band further down the page, per the "one or two gradient cards per long page" rule.

---

## 2. Choose the right door — glass card grid + comparison table

*Lever: category clarity — people commit faster once they see their own situation named back to them, and abandon less when they can see the queue is real (staffed, scoped) rather than a black box.*

Intro line: **Pick the row that matches what you actually need. It sets the form fields you'll see next and the queue that receives it.**
বাংলা: **আপনার প্রয়োজনের সাথে মিলে যায় এমন সারিটি বেছে নিন। এটি পরবর্তী ফর্মের ফিল্ড এবং যে দল বার্তাটি পাবে তা নির্ধারণ করে।**

| Enquiry type | Destination queue | What to include | Expected handling |
|---|---|---|---|
| Sales & pricing | Sales | Store size (SKU count, monthly order volume), current platform if migrating, target launch date | Reviewed same working day; a named sales rep replies with next steps, not a form letter |
| Store migration | Migration specialists | Current platform, product/order/customer counts, custom domain status, any custom checkout logic | Discovery call offered within {{migration_response_placeholder}}; see the consultation band below |
| Technical support (existing merchant) | Support engineers | Store URL, account email, error message or screenshot, steps to reproduce, browser/device | Triaged by severity (table below); acknowledged within {{support_response_placeholder}} |
| Billing & invoices | Billing | Store URL, invoice number if disputing a charge, payment method (bKash/Nagad/card), what looks wrong | Reviewed within {{billing_response_placeholder}}; refunds/adjustments confirmed in writing before processing |
| Security disclosure | Security | Affected endpoint or surface, reproduction steps, impact assessment, your PGP key if you want an encrypted reply | Acknowledged within {{security_response_placeholder}}; see disclosure note below |
| Partnerships & integrations | Partnerships | Company name, integration type (payment/courier/app), audience size or reach, proposed scope | Reviewed within {{partnerships_response_placeholder}} |
| Press & media | Communications | Outlet, deadline, specific ask (quote, interview, data), publication date | Acknowledged within {{press_response_placeholder}}; deadline-flagged requests are prioritised |
| Careers | People team | Role of interest, portfolio/CV link, location preference (remote/Dhaka office) | Applications route to the open-roles board; unsolicited enquiries acknowledged within {{careers_response_placeholder}} |

**Security disclosure note (verbatim, no placeholder needed for the process itself)**: We do not offer a public bug bounty at this time. Good-faith disclosures that avoid data destruction, privacy violation, or service disruption during testing will be acknowledged and, where we can, credited once fixed. Do not test against live merchant stores you do not own.

**Design note**: eight rows collapse to a `glass-card` grid on mobile (2-up), each card carrying the queue name, an icon, and a one-line "include" hint; the full table appears at ≥900px as a real `<table>` with a hairline row divider, not an image. Icons: `Banknote`, `ArrowRightLeft`, `LifeBuoy`, `Receipt`, `ShieldAlert`, `Handshake`, `Newspaper`, `Users` (Lucide set, 20px, ink-muted, blue on hover).

---

## 3. The contact form — glass card, full field spec

*Lever: reduce perceived form length by only ever showing fields relevant to the selected enquiry type — progressive disclosure lowers abandonment more than a shorter fixed form does.*

Form id: `#contact-form`. Submit method: POST to routing endpoint; client-side validation blocks submit until all required fields pass; server re-validates identically.

### 3.1 Base fields (always shown)

| Field | Label | Placeholder | Helper text | Validation rule | Error string (EN) | Error string (BN) |
|---|---|---|---|---|---|---|
| Enquiry type | `What do you need?` | `Select one` | Sets the fields below and the destination queue | Required, must match one of the 8 queue values | `Choose an enquiry type so we can route this correctly.` | `সঠিকভাবে পাঠাতে একটি বিষয় নির্বাচন করুন।` |
| Full name | `Your name` | `e.g. Ayesha Rahman` | Used to address you in the reply, not published anywhere | Required, 2–80 chars, no URLs | `Enter your name (2–80 characters).` | `আপনার নাম লিখুন (২–৮০ অক্ষর)।` |
| Email | `Email address` | `you@company.com` | We reply here — check your spam folder for the first message | Required, valid email format (RFC 5322 subset), disposable-domain blocklist | `Enter a valid email address.` | `একটি সঠিক ইমেইল ঠিকানা দিন।` |
| Phone (optional) | `Phone number (optional)` | `+8801XXXXXXXXX` | Only if you'd rather we call — bKash/Nagad-linked numbers are fine | Optional; if filled, must match BD mobile pattern `^(\+?880|0)1[3-9]\d{8}$` or international E.164 | `That doesn't look like a valid phone number.` | `এটি একটি সঠিক ফোন নম্বর মনে হচ্ছে না।` |
| Store URL (optional unless Support/Billing/Migration) | `Your store URL` | `yourstore.framique.shop or your custom domain` | Lets support pull up your account instantly | Required for Support, Billing, Migration; optional otherwise; must be a valid hostname | `Enter your store's web address so we can find your account.` | `আপনার স্টোরের ঠিকানা দিন যাতে আমরা অ্যাকাউন্টটি খুঁজে পেতে পারি।` |
| Message | `Tell us what's going on` | `Include what you expected, what happened instead, and any error text` | Minimum detail: what/where/when. See the ticket template below for the fastest path to a fix | Required, 20–4000 chars | `Add a bit more detail (at least 20 characters) so we don't have to ask twice.` | `আরেকটু বিস্তারিত লিখুন (কমপক্ষে ২০ অক্ষর) যাতে আমাদের আবার জিজ্ঞেস করতে না হয়।` |
| Attachment (optional) | `Attach a screenshot or file (optional)` | — | PNG, JPG, PDF, or CSV, up to 10MB, up to 3 files | Optional; file type/size enforced client-side | `Files must be PNG, JPG, PDF or CSV and under 10MB each.` | `ফাইল অবশ্যই PNG, JPG, PDF বা CSV হতে হবে এবং প্রতিটি ১০MB-এর কম হতে হবে।` |
| Consent checkbox | `I agree Framique can use these details to respond to this message. See the privacy policy.` | — | Unchecked by default; "privacy policy" is a link, opens in new tab | Required, must be checked | `You need to accept this before we can reply.` | `উত্তর দেওয়ার আগে এটি গ্রহণ করা প্রয়োজন।` |
| Honeypot | hidden field `website_url_confirm` | — | Invisible to real users via CSS, not `display:none` (screen-reader safe) | Must remain empty; non-empty = silent reject | (no user-facing error — see anti-spam band) | — |

### 3.2 Conditional fields by enquiry type

| Enquiry type | Extra field(s) shown | Field details |
|---|---|---|
| Sales & pricing | `Monthly order volume` (select: 0–50 / 51–500 / 501–5,000 / 5,000+) · `Current platform` (text, optional) | Both optional; used to route to the right sales tier, not gatekept |
| Store migration | `Current platform` (required select: Shopify / WooCommerce / Daraz seller / custom / other) · `Approx. product count` (number) · `Target launch date` (date picker, optional) | "Current platform" required — the migration path differs by source system |
| Technical support | `Severity` (required select, definitions in §5) · `Error message or code` (textarea, optional) · `Browser/device` (text, optional) | Severity selection changes the acknowledgement-time promise shown live above the submit button |
| Billing & invoices | `Invoice number` (optional, format `INV-XXXXXX`) · `Payment method` (select: bKash / Nagad / card / bank transfer / other) | Invoice number speeds lookup but is not required — "I don't have it" is an explicit option in the select, not left blank and guessed |
| Security disclosure | `Affected URL or endpoint` (required) · `Severity self-assessment` (select: informational / low / medium / high / critical) · `PGP public key` (optional textarea, monospace) | If PGP key is supplied, our first reply is encrypted to it; otherwise plaintext with a note that encrypted reply is available on request |
| Partnerships & integrations | `Company name` (required) · `Integration type` (select: payment gateway / courier / app or plugin / agency reseller / other) · `Website` (optional URL) | — |
| Press & media | `Outlet name` (required) · `Deadline` (date picker, optional but flagged red if within 48 hours to auto-prioritise) | — |
| Careers | `Role of interest` (text, optional if attaching a general CV) · `Portfolio or CV link` (URL, optional) | No résumé upload here by design — link to Drive/portfolio keeps the form light; a dedicated careers page can add upload later |

**Design note**: conditional fields animate in with opacity+8px translate, 280ms, `cubic-bezier(0.22,1,0.36,1)` — matches the site's motion spec, never a layout jump. The severity select for Technical support live-updates a caption under the submit button: *"Selected: {{severity}} — first response target {{X}}."* sourced from the table in §5, so the promise is never disconnected from the picked value.

### 3.3 Submit button and micro-trust line

- **Button label**: `Send message`
- **Button label বাংলা**: `বার্তা পাঠান`
- **Loading state label**: `Sending…` / `পাঠানো হচ্ছে…`
- **Under-button microcopy (EN)**: We reply from a real address you can hit reply on. No autoresponder loop, no ticket number instead of an answer.
- **Under-button microcopy (BN)**: আমরা একটি প্রকৃত ঠিকানা থেকে উত্তর দিই যেখানে আপনি রিপ্লাই দিতে পারবেন। কোনো অটো-রিপ্লাই লুপ নেই, উত্তরের বদলে শুধু টিকিট নম্বর নেই।

---

## 4. Write a ticket that gets solved first time — glass card, single column

*Lever: worked example — showing the ideal input format outperforms a bulleted "tips" list because people copy structure, not advice.*

Intro: **The fastest replies come from the most complete first message. Copy this template into the message field and fill the brackets.**
বাংলা: **সবচেয়ে দ্রুত উত্তর আসে সবচেয়ে সম্পূর্ণ প্রথম বার্তা থেকে। নিচের টেমপ্লেটটি বার্তার ঘরে কপি করে বন্ধনীগুলো পূরণ করুন।**

```
What I expected:
[e.g. "Payment should confirm and redirect to the order confirmation page."]

What happened instead:
[e.g. "bKash prompt closed after OTP entry, order shows 'Payment pending' in dashboard."]

When it started:
[date/time, and whether it's every time or intermittent]

Order/transaction reference (if applicable):
[order ID, invoice number, or bKash transaction ID]

Store URL:
[yourstore.framique.shop or custom domain]

What I've already tried:
[e.g. "Retried with a different bKash number, cleared cache, tested on two devices."]
```

**বাংলা টেমপ্লেট:**

```
আমি যা আশা করেছিলাম:
[যেমন, "পেমেন্ট নিশ্চিত হয়ে অর্ডার কনফার্মেশন পেজে যাওয়ার কথা ছিল।"]

আসলে যা হয়েছে:
[যেমন, "OTP দেওয়ার পর bKash প্রম্পট বন্ধ হয়ে গেছে, ড্যাশবোর্ডে অর্ডারটি 'Payment pending' দেখাচ্ছে।"]

কখন শুরু হয়েছে:
[তারিখ/সময়, এবং এটি প্রতিবার হয় নাকি মাঝে মাঝে]

অর্ডার/লেনদেন রেফারেন্স (যদি থাকে):
[অর্ডার আইডি, ইনভয়েস নম্বর, বা bKash লেনদেন আইডি]

স্টোরের ঠিকানা:
[yourstore.framique.shop অথবা কাস্টম ডোমেইন]

আমি ইতিমধ্যে যা চেষ্টা করেছি:
[যেমন, "ভিন্ন bKash নম্বর দিয়ে আবার চেষ্টা করেছি, ক্যাশ পরিষ্কার করেছি, দুটি ডিভাইসে পরীক্ষা করেছি।"]
```

**Three things that slow a ticket down** (shown as a compact three-row list below the template):
1. "It's broken" with no store URL — we can't reproduce what we can't see.
2. Screenshots of the error without the URL bar visible — we can't confirm which environment.
3. Multiple unrelated issues in one message — each gets its own ticket so nothing gets lost when one is resolved and the other isn't.

**Design note**: template rendered in a monospace-styled `<pre>` inside a `surface-1` block with a `Copy template` button (copies plain text, toast confirms "Copied"). বাংলা version toggled by a small pill switch, not a separate accordion, so both stay discoverable.

---

## 5. Ticket lifecycle and severity — two tables, canvas

*Lever: uncertainty reduction — a visible status vocabulary turns "why haven't they replied" into "it's in Investigating, that's expected."*

### 5.1 Lifecycle states

| Status | Meaning | What you'll see |
|---|---|---|
| `Received` | Your message passed spam/rate checks and is in the destination queue | Automatic confirmation email with a reference number |
| `Acknowledged` | A named person has read it and is working the case | Reply from a real person, not a template — may ask clarifying questions |
| `Investigating` | We're reproducing the issue, checking logs, or consulting engineering | May take longer than the first-response target; you'll get an interim update if it crosses {{investigating_update_placeholder}} |
| `Waiting on you` | We've asked a question or need something from you (access, a screenshot, a decision) | The clock pauses on our SLA while this status holds |
| `Resolved` | The fix is live or the answer is final | A closing message explains what changed; you can reopen by replying to the same thread within {{reopen_window_placeholder}} |
| `Closed` | No reply from either side within {{auto_close_placeholder}} of Resolved | Reopens automatically if you reply to the thread after closing |

### 5.2 Severity definitions (technical support and security disclosure)

| Severity | Definition | Example | First-response target |
|---|---|---|---|
| Critical | Store is down, checkout is broken for all customers, or a security issue allows data exposure | No orders can be placed on any storefront | {{critical_response_placeholder}} |
| High | A core feature is broken for a meaningful share of merchants or customers, no workaround exists | bKash payments failing intermittently store-wide | {{high_response_placeholder}} |
| Medium | A feature is degraded or broken but a workaround exists, or affects a single store | CSV export missing one column | {{medium_response_placeholder}} |
| Low | Cosmetic issue, minor inconvenience, or a "how do I" question | Dashboard label text is misaligned | {{low_response_placeholder}} |
| Informational | Feature request, feedback, or general question | "Can invoices support a custom logo?" | {{informational_response_placeholder}} |

**Design note**: both tables render on canvas with hairline row dividers (`{colors.hairline-soft}`), status names as small `caption`-weight pills (semantic-success green for Resolved, ink-muted for Closed, signal-blue outline for Investigating), never full-color badge fills that would compete with the aurora system.

---

## 6. Self-serve deflection — three hairline rows, canvas

*Lever: fluency — the fastest support experience is not needing to contact anyone; surfacing this before the form footer (not just after) respects people who came here mid-typing.*

- **Status** — Is something down right now, and for how long? → `/status`
- **Status বাংলা** — এখন কি কিছু ডাউন আছে, এবং কতক্ষণ ধরে? → `/status`
- **Docs** — API keys, webhooks, error codes, courier integration setup → `/docs`
- **Docs বাংলা** — API কী, ওয়েবহুক, এরর কোড, কুরিয়ার ইন্টিগ্রেশন সেটআপ → `/docs`
- **Pricing FAQ** — Plan limits, VAT treatment, downgrade rules → `/pricing`
- **Pricing FAQ বাংলা** — প্ল্যান সীমা, ভ্যাট নিয়ম, ডাউনগ্রেড নিয়মাবলী → `/pricing`

**Design note**: each row is a full-width hairline-bordered link block with an arrow icon that translates 4px right on hover (matches magnetic-hover spec, capped smaller than the primary CTA's 6px).

---

## 7. Anti-spam, rate limits, and privacy notice

*Lever: transparency about friction — telling people why a limit exists reduces frustration when they hit it, versus a bare "too many requests."*

### 7.1 Anti-spam mechanics (plain-language, not marketing copy)

- A hidden honeypot field rejects bot submissions silently — no error is shown to the (non-human) submitter, and no email is sent to the destination queue.
- Submissions are rate-limited per IP and per email address: **{{rate_limit_count_placeholder}} submissions per {{rate_limit_window_placeholder}}**. Limits reset on a rolling window, not a fixed clock.
- A submission that fails rate-limiting shows this message rather than a silent failure: `You've sent a few messages recently. Please wait a moment before sending another, or reply to your existing confirmation email.` / বাংলা: `আপনি সম্প্রতি কয়েকটি বার্তা পাঠিয়েছেন। আরেকটি পাঠানোর আগে একটু অপেক্ষা করুন, অথবা আপনার বিদ্যমান কনফার্মেশন ইমেইলে রিপ্লাই দিন।`
- No CAPTCHA by default — CAPTCHA is added automatically only if abuse patterns are detected for a given IP range, to avoid taxing every legitimate submitter for a minority's behaviour.

### 7.2 Privacy notice (shown as a collapsed disclosure under the consent checkbox, labelled "What we do with this")

Copy: *We store your name, email, message, and any attachments to answer this enquiry and to keep a record if you contact us again. We don't sell this data or use it for marketing unless you separately opt in elsewhere. Full detail: {{privacy_policy_link_placeholder}}.*

বাংলা: *এই অনুরোধের উত্তর দিতে এবং আপনি আবার যোগাযোগ করলে রেকর্ড রাখতে আমরা আপনার নাম, ইমেইল, বার্তা এবং সংযুক্ত ফাইল সংরক্ষণ করি। আমরা এই তথ্য বিক্রি করি না বা অন্য কোথাও আলাদাভাবে সম্মতি না দিলে মার্কেটিংয়ের জন্য ব্যবহার করি না। সম্পূর্ণ বিবরণ: {{privacy_policy_link_placeholder}}।*

---

## 8. What happens to your data after you submit

*Lever: concrete process disclosure lowers submission anxiety more effectively than a generic "your privacy matters" line.*

Presented as a four-step horizontal strip (collapses to a vertical stack on mobile):

1. **Routing** — Your enquiry type and message are matched to one destination queue (§2) and a confirmation email with a reference number is sent to the address you gave.
2. **Access** — Only people on that named team can see the message; sales cannot read security disclosures, support cannot read careers applications.
3. **Retention** — Resolved/closed enquiries are retained for {{retention_period_placeholder}} for support-quality and dispute purposes, then deleted or anonymised. Attachments follow the same schedule.
4. **Your control** — You can ask us to delete your enquiry record at any time by replying to the confirmation email with "please delete this record," subject to any legal retention requirement we disclose in that reply.

বাংলা (compressed under a "বাংলায় পড়ুন" toggle rather than duplicated four times, to keep the strip visually light): *আপনার বার্তা সঠিক দলে পাঠানো হয়, শুধুমাত্র সেই দলের নির্দিষ্ট সদস্যরা এটি দেখতে পারেন, সমাধান হওয়ার পর {{retention_period_placeholder}} পর্যন্ত রাখা হয়, এবং আপনি যেকোনো সময় মুছে ফেলার অনুরোধ করতে পারেন।*

---

## 9. Enterprise & migration consultation — gradient spotlight card

*Lever: reciprocity — leading with a structured discovery list (rather than a bare "book a call") signals the call will be substantive, which raises show-up rate.*

- **Eyebrow**: `For teams doing 500+ orders/month or migrating a live store`
- **H2**: **Bring your platform. We'll map the move.**
- **H2 বাংলা**: **আপনার প্ল্যাটফর্ম নিয়ে আসুন। আমরা স্থানান্তরের পরিকল্পনা করব।**
- **Sub**: A 30-minute discovery call before any commercial conversation. No slide deck, just questions that determine whether Framique is actually a fit.

**Discovery questions we'll ask** (rendered as a numbered list on the card):
1. What platform are you migrating from, and what's forcing the move — cost, features, or reliability?
2. How many products, orders/month, and customer records need to come across?
3. Do you have custom checkout logic, subscriptions, or a POS integration that has to survive the move unchanged?
4. Which payment methods are non-negotiable (bKash, Nagad, card, COD split)?
5. Which courier partners do you currently reconcile against, and how?
6. Is there a hard launch date tied to a campaign, investor update, or contract?
7. Who signs off technically, and who signs off commercially — are they the same person?
8. What would make this migration a failure in your eyes, even if the store technically works?

- **CTA**: `Book a discovery call`
- **CTA বাংলা**: `একটি ডিসকভারি কল বুক করুন`
- **Fine print**: Calls are conducted in English or বাংলা, your preference — say so when booking.
- **Design note**: one of the page's two permitted gradient-spotlight cards (violet→magenta stop), `gradient-spotlight-card` token, white ink at ≥4.5:1. This is the only band on the page using a full gradient background rather than glass — reserved for the highest-commitment CTA on the route.

---

## 10. Offices & hours — placeholder template, canvas

*Lever: legitimacy signal — a real address and hours reduce fraud-anxiety on a payments platform more than any trust badge; we do not fabricate this.*

> **NAP block — confirm all fields before publish, do not launch with bracketed placeholders live:**
>
> - **Legal entity**: `{{legal_entity_name}}`
> - **Registered address**: `{{street_address}}, {{area}}, Dhaka {{postcode}}, Bangladesh`
> - **Phone**: `{{phone_number}}`
> - **General email**: `{{support_email}}`
> - **Sales email**: `{{sales_email}}`
> - **Security email**: `{{security_email}}` (PGP key fingerprint: `{{pgp_fingerprint}}`)
> - **Business hours**: `{{business_days}}, {{open_time}}–{{close_time}} {{timezone}}`
> - **Public holidays**: `{{holiday_calendar_link_or_note}}`

Identical block is emitted once as machine-readable data on this route (`ContactPage` + `ContactPoint` JSON-LD, §SEO) and mirrored in human-readable form on `/about` — the two must never drift; update both from one source of truth.

**Design note**: rendered as a simple two-column definition list on canvas, no card, no icon grid — this band is intentionally quiet so it doesn't compete with the routing table or the form above it.

---

## 11. Accessibility spec (form)

- Every field has a visible `<label for>` — no placeholder-as-label. Placeholders supplement, never replace, the label text listed in §3.
- Required fields carry `aria-required="true"` and a visible `*` appended to the label text (not colour alone).
- Field-level errors: `aria-invalid="true"` on the input, error text in a `<span id="{field}-error" role="alert">` referenced via `aria-describedby`; the error string is announced by screen readers the moment validation fails on blur, and again (not duplicated) on failed submit.
- Error summary: on failed submit, focus moves to a summary block (`role="alert"`, `tabindex="-1"`) listing every failing field as a link that jumps to and focuses that field.
- Focus order follows visual/DOM order: enquiry type → conditional fields (inserted in place, not appended at the end) → name → email → phone → store URL → message → attachment → consent checkbox → submit. Conditional fields never reorder existing focus stops.
- The honeypot field is visually hidden via absolute positioning off-screen (not `display:none` or `visibility:hidden`), carries `aria-hidden="true"` and `tabindex="-1"` so it is never announced or focusable, while still being present in the DOM for bot traps to fill.
- Success and failure banners (§12) use `role="status"` (success, polite) and `role="alert"` (failure, assertive) respectively.
- Colour is never the sole indicator of state: required marker is `*` + label text, not red text alone; severity pills carry text labels, not colour-only dots.
- Minimum touch target 44×44px for the enquiry-type select, checkboxes, and submit button on mobile.
- The whole form is operable by keyboard alone, including the file attachment control (native `<input type="file">`, not a custom drag-only zone without a click fallback).
- `lang="bn"` is set on every Bangla string's containing element so screen readers switch pronunciation correctly mid-page.

---

## 12. Success and failure states

### 12.1 Success (inline banner replaces the form, `role="status"`)

- **Headline**: `Message sent.`
- **Headline বাংলা**: `বার্তা পাঠানো হয়েছে।`
- **Body**: Reference number `{{ticket_reference}}`. We've emailed a confirmation to `{{submitted_email}}`. Reply to that email any time to add detail — it goes straight to the same thread.
- **Body বাংলা**: রেফারেন্স নম্বর `{{ticket_reference}}`। আমরা `{{submitted_email}}` ঠিকানায় একটি নিশ্চিতকরণ ইমেইল পাঠিয়েছি। বিস্তারিত যোগ করতে যেকোনো সময় সেই ইমেইলে রিপ্লাই দিন — এটি সরাসরি একই থ্রেডে যাবে।
- **Secondary link**: `Send another message` (resets form) · `Check /status while you wait`

### 12.2 Failure — submission error (network/server, `role="alert"`)

- **Headline**: `That didn't go through.`
- **Headline বাংলা**: `এটি পাঠানো যায়নি।`
- **Body**: Nothing was lost — your message is still in the box below. Try again, or email us directly at `{{fallback_email_placeholder}}`.
- **Body বাংলা**: কিছুই হারায়নি — আপনার বার্তা নিচের বাক্সে এখনও আছে। আবার চেষ্টা করুন, অথবা সরাসরি `{{fallback_email_placeholder}}`-এ ইমেইল করুন।
- **Retry CTA**: `Try again`

### 12.3 Failure — validation error (client-side, summary block)

- **Headline**: `A few fields need a second look.`
- **Headline বাংলা**: `কয়েকটি ঘর আবার দেখুন প্রয়োজন।`
- Followed by the linked list of field-specific errors from §3.

---

## 13. FAQ — 10 rows, faq-row accordion

*Lever: objection pre-emption — answering the "will this actually reach someone" question directly reduces support-avoidant behaviour (people not writing in at all).*

1. **Is this a real inbox or a bot?** — A named person on the relevant team reads and replies to every message. The confirmation email is automatic; the reply that follows is not.
2. **How fast will I hear back?** — Depends on the queue and, for support, the severity you select — see the tables in §2 and §5. The exact target is shown live above the submit button once you pick your enquiry type.
3. **Can I attach a screenshot or a CSV?** — Yes, up to three files, 10MB each, PNG/JPG/PDF/CSV.
4. **I already have a ticket open — should I submit a new one?** — No. Reply to the confirmation email on your existing thread; a second submission creates a duplicate and can slow both down.
5. **Do you offer phone support?** — Listed under Offices & hours (§10) once confirmed; leave a phone number in the optional field if you'd rather we call than email.
6. **What if my issue is affecting customers right now?** — Select Technical support and mark severity Critical or High — this changes the acknowledgement target shown on the form.
7. **How do I report a security vulnerability responsibly?** — Use the Security disclosure enquiry type; see the disclosure note in §2 for scope and what "good faith" means here.
8. **Will you use my email for marketing?** — No, not from this form. See the privacy notice in §7.2 and the data-handling steps in §8.
9. **Can I write to you in বাংলা?** — Yes — the message field accepts বাংলা directly, and every reply-worthy queue can respond in বাংলা on request.
10. **I run a large store — can I skip the form and talk to someone directly?** — Use the Enterprise & migration consultation band (§9) to book a discovery call instead of the general form.

---

## 14. Final CTA — canvas

- **H2**: Prefer to see it first?
- **H2 বাংলা**: আগে দেখতে চান?
- **Sub**: Start free and bring your questions to the walkthrough — no card required.
- **Sub বাংলা**: বিনামূল্যে শুরু করুন এবং আপনার প্রশ্নগুলো ওয়াকথ্রুতে নিয়ে আসুন — কোনো কার্ড লাগবে না।
- **Primary**: `Start free — no card` / বাংলা: `বিনামূল্যে শুরু করুন — কোনো কার্ড নেই`
- **Alt**: `Book a 20-minute walkthrough` / বাংলা: `২০ মিনিটের ওয়াকথ্রু বুক করুন`

---

## Internal linking plan

- `/contact` → `/status` (self-serve band, hero alt CTA target)
- `/contact` → `/docs` (self-serve band)
- `/contact` → `/pricing` (self-serve band, FAQ item 2 sales context)
- `/contact` → `/about` (NAP block cross-reference, single source of truth)
- `/contact#enterprise` → `/pricing#enterprise-tier` (consultation band, if an enterprise tier exists)
- `/contact` ← linked from footer on every marketing route (`Contact` in the Company column)
- `/contact` ← linked from `/pricing` ("Talk to sales" CTA on the top pricing tier)
- `/contact` ← linked from `/security` if it exists, or from footer "Report a vulnerability" link
- `/careers` (if separate) ↔ `/contact` careers enquiry type cross-links both ways

## Image brief

- **OG image** (`/og/contact.png`): dark canvas, glass card mock of the routed form with the enquiry-type select open, white Geist headline "Talk to the right person," no photography, no stock people.
- **Hero background**: aurora mesh, low alpha, violet/teal drift, no focal image — text-led hero per design system.
- **Enterprise band**: no image; gradient-spotlight card is the visual weight, per the one-gradient-card rule.
- No merchant photography needed on this route — it is a utility page, not a persuasion page, and imagery competing with the form would raise cognitive load.

## Icon list

`ChevronDown` (enquiry-type select), `Banknote` (Sales), `ArrowRightLeft` (Migration), `LifeBuoy` (Support), `Receipt` (Billing), `ShieldAlert` (Security), `Handshake` (Partnerships), `Newspaper` (Press), `Users` (Careers), `Paperclip` (attachment), `Check` (consent, success state), `AlertCircle` (validation error, failure banner), `Copy` (ticket template copy button), `ArrowRight` (self-serve row hover), `Lock` (PGP key field).

## Motion spec

- Conditional form fields: opacity 0→1 + translateY 8px→0, 280ms, `cubic-bezier(0.22,1,0.36,1)`, on enquiry-type change only — never on page load.
- Self-serve row arrow: translateX 0→4px on hover, 200ms ease-out.
- Submit button: magnetic hover capped at 6px per design system, disabled during `Sending…` state (no magnetic hover while disabled).
- Success/failure banners: fade+8px slide in, 320ms; error summary block additionally receives programmatic focus with no animation delay (accessibility over polish for the focus jump itself).
- Enterprise gradient card: aurora drift 24–38s loop, matches hero drift timing so the two gradient moments on the page feel related, not arbitrary.
- All motion collapses to instant state changes under `prefers-reduced-motion: reduce`.

## Measurement plan

- **Funnel**: hero view → enquiry-type selected → conditional fields completed → submit attempted → submit succeeded, tracked as five discrete events to isolate where drop-off happens.
- **Per-queue volume**: tag each submission with its enquiry type to compare load against the response-time promises in §2/§5 — if a queue consistently misses its target, the promise or the staffing needs to change, not the copy.
- **Validation friction**: log which field triggers the most inline errors (by field name, not by raw input) to find the worst-worded label or the most miscalibrated pattern rule.
- **Deflection effectiveness**: click-through rate on the self-serve band (§6) relative to form starts — rising docs/status clicks alongside falling low-severity support submissions indicates the deflection copy is working.
- **Template adoption**: track `Copy template` button clicks (§4) against subsequent message length — longer first messages should correlate with fewer back-and-forth exchanges per resolved ticket, measurable via lifecycle-status timestamps.
- **Consultation conversion**: discovery-call bookings (§9) as a share of Migration/Sales enquiry-type submissions, and show-up rate against booked calls, to validate the reciprocity lever.
- **Language split**: track বাংলা vs English message submissions to prioritise which support scripts/macros need বাংলা-first drafting.
- **Time-to-acknowledge vs promise**: for every queue and severity, compare actual `Received → Acknowledged` duration against the published target so §2 and §5 stay honest over time rather than becoming stale marketing copy.

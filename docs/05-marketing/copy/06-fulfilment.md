# `/fulfilment`

New route: `src/routes/fulfilment.tsx`

Shell: marketing shell, dark canvas. Scope: product deep-dive page for the order-to-doorstep workflow — courier booking, the order lifecycle, returns, packing, exceptions, remittance, and peak-season readiness.

## SEO

- **Title** (53 chars): `Fulfilment — courier booking, labels and tracking`
- **Description** (150 chars): `Book SteadFast, Pathao, RedX and Paperfly pickups, print labels and track delivery from the order drawer. COD returns reconcile automatically.`
- **og:title**: `From order to doorstep, tracked.`
- **og:description**: `Courier labels, pickups and delivery status without leaving the dashboard.`
- **og:image**: order-drawer courier panel, dark canvas, glass card with tracking timeline visible.
- **canonical**: `/fulfilment`
- **og:url**: `/fulfilment`
- **JSON-LD**: `BreadcrumbList` (Home → Product → Fulfilment) + `FAQPage` for section 15.
- **H1 rule**: exactly one `<h1>`, in the hero; every subsequent heading is `h2`/`h3`. Bangla headline variants render inside `lang="bn"` subtrees with tracking reset to 0 per DESIGN.md.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `courier integration bangladesh ecommerce`
  - **Secondary**:
    - `steadfast pathao redx paperfly api`
    - `order tracking for online store`
    - `cod return management`
    - `shipping label printing bangladesh`
  - **Long-tail / question intents**:
    - `how to automate courier booking for a bangladeshi online store`
    - `reduce cash on delivery return rate bangladesh`
  - **Placement**: H1 (primary), lifecycle band, courier comparison table, returns band, peak-season band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/fulfilment`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

## Band order

1. Hero
2. Courier wall
3. Lifecycle state machine + automation table
4. Multi-courier booking inside the order drawer (Z row)
5. Courier selection decision framework
6. Returns & RTO reduction playbook + worked margin example
7. Address quality and phone verification
8. Packing and pick-list workflow for a small warehouse
9. Inventory reservation and oversell prevention
10. Delivery-status webhooks and Bangla customer notifications
11. Exceptions queue and SLA breach handling
12. Remittance reconciliation
13. Peak-season capacity checklist (Eid, Pohela Boishakh)
14. Comparison: Framique vs spreadsheet + courier panels
15. FAQ (10)
16. Final CTA

---

## 1. Hero

*Lever: specificity beats hype — naming the exact couriers and the exact surface (the drawer) makes the claim falsifiable, which is what makes it credible.*

- **Eyebrow**: `Four couriers · one drawer`
- **H1**: **From order to doorstep, tracked.**
- **Sub**: Courier labels, pickups and delivery status without leaving the dashboard. No courier panel logins, no spreadsheet, no copy-pasted tracking numbers.
- **Primary CTA**: `Book a walkthrough` · **Alt CTA**: `See supported couriers`
- **বাংলা H1**: অর্ডার থেকে দোরগোড়া পর্যন্ত, ট্র্যাক করা অবস্থায়।
- **বাংলা sub**: কুরিয়ার লেবেল, পিকআপ আর ডেলিভারি স্ট্যাটাস — ড্যাশবোর্ড ছাড়া কোথাও যেতে হবে না।

**Design note**: aurora hero, low-alpha violet/teal mesh drifting behind a glass card showing a live order drawer mock — courier chips, a label thumbnail, a four-node status strip. Primary CTA is the white pill with magnetic hover (max 6px); alt CTA is a glass pill that anchor-scrolls to the courier wall.

---

## 2. Courier wall

*Lever: recognition heuristic — buyers scan for their existing courier relationships before reading a single sentence of copy.*

Row of inline SVG marks with `aria-label`: **SteadFast · Pathao · RedX · Paperfly**, plus **Manual / own rider** rendered as a fifth, first-class tile (dashed hairline border, not greyed out) so merchants running their own delivery fleet don't read this page as "courier-only."

Caption: One credential per courier, entered once in Settings → Couriers. Nothing to re-key per order.

**Design note**: five equal glass tiles, hairline edge, logo centered, name below in caption type. On hover, tile lifts 2px and shows "Coverage · Cut-off · Remittance cycle" as a tooltip sourced from the SLA table in section 5 of the old draft (now folded into section 5 decision table below).

---

## 3. The order lifecycle: a state machine, not a status label

*Lever: mental-model transfer — merchants coming from a spreadsheet think of "status" as a free-text field they update manually. Naming it a state machine sets the expectation that state changes are system-driven and auditable, which is the actual value proposition.*

Every order occupies exactly one state at a time. States only move forward, except the three terminal branches (`Delivered`, `Returned`, `Lost`), and every transition writes an **order event** with an actor (system, courier webhook, or staff name) and a timestamp — the same event log a support agent, a courier, and a customer's public tracking page all read from.

**States**: `Placed → Confirmed → Packed → Picked up → In transit → Delivered`, with two exit branches from `In transit`: `→ Returned` and `→ Lost`.

### 3.1 What happens automatically at each state

| State | Trigger | Automatic actions | Who can see it |
|---|---|---|---|
| **Placed** | Customer completes checkout (or staff creates a manual order) | Inventory soft-reserved (see §9); order confirmation sent by SMS/email/WhatsApp; fraud/COD risk score attached if enabled | Staff, customer |
| **Confirmed** | Staff clicks Confirm, or auto-confirm rule passes (e.g. prepaid, or COD under a risk threshold) | Order enters the pick queue; hard inventory allocation; "Confirmed" Bangla SMS sent | Staff, customer |
| **Packed** | Staff marks items packed against the pick-list (§8) | Package weight/dimensions locked for courier rate calc; label becomes eligible for generation | Staff |
| **Picked up** | Courier scans the label or staff marks manual handover | Pickup timestamp and courier consignment ID attached to the order; "On the way" SMS sent | Staff, customer, courier |
| **In transit** | Courier webhook posts an intermediate scan | Each scan appended to the public tracking timeline; ETA recalculated if the courier supplies one | Staff, customer |
| **Delivered** | Courier webhook posts final delivery scan, or staff manually confirms cash-in-hand | COD amount posted to the remittance ledger (§12) as "awaited"; inventory deduction finalized; delivery SMS + review-request trigger sent | Staff, customer |
| **Returned** | Courier webhook posts RTO/return scan, or staff processes a customer-initiated return | Return reason captured; stock optionally auto-restocked pending inspection (§9); return counted against that courier's return-rate metric (§6) | Staff |
| **Lost** | Staff marks lost after courier confirms non-recovery, or after an SLA-breach investigation (§11) closes with no resolution | Inventory written off; case flagged for courier claim; excluded from delivery-rate KPI as a distinct category from "returned" | Staff |

Caption under the table: Returned and Lost are both exits from In transit, not from Delivered — a parcel does not need to reach the doorstep to leave the pipeline.

**Design note**: horizontal timeline component above the table — seven nodes on a single rail, the two exit branches drawn as a fork below the "In transit" node with a dotted connector, matching the aurora hero's line weight. Active/current-state node gets the signal-blue ring (Elevation level 3).

---

## 4. Multi-courier booking, inside the order drawer

*Lever: reduction of switching cost — every extra tab or login is a decision point where a task gets deferred. Collapsing courier choice, label generation and pickup request into one drawer removes three decision points, not one.*

**Z row, text-left, image-right**

**Headline**: One drawer, not four portals.
**Body**: Open the order, pick a courier from the same panel that shows the customer's address and items, generate a label, and request a pickup. The courier's API call happens behind the button; nothing you type goes into a second tab.
**Proof chip**: `Zero copy-paste between tabs.`
**বাংলা proof**: `কোনো ট্যাব-বদল নেই।`

What the drawer does concretely, in order:

1. Suggests a courier based on the decision framework in §5 (destination, weight, fragility, COD value), pre-selected but always overridable.
2. Shows the courier's live quoted rate for that weight band before you commit — not after the label prints.
3. Generates and previews the label as a PDF thumbnail inside the drawer; bulk label printing is available from the order list for multi-order pickup runs.
4. Requests pickup with a chosen time window, subject to that courier's cut-off (see coverage table below).
5. Writes the `Confirmed → Packed → Picked up` events automatically as each step completes — no manual status update needed alongside the courier action.

**Design note**: split image shows a real drawer crop — courier selector as pill buttons (SteadFast active, blue ring), rate line, label thumbnail with subtle drop shadow, "Request pickup" primary pill. Glass card, surface-2, 1px light edge.

---

## 5. Courier selection decision framework

*Lever: worked decision trees outperform prose rules — a merchant packing at 11pm needs a lookup, not an essay.*

No single courier wins every parcel. The right choice depends on four variables you already know at pack time: **destination zone, weight band, fragility, and COD value**. Treat courier selection as a decision tree, not a default.

### 5.1 Decision tree

1. **Is the destination inside Dhaka metro?**
   - Yes → weigh pickup cut-off and same-day options; RedX and Pathao typically run tighter inside-Dhaka same-day windows (per your contract) — check §5.2.
   - No → confirm the courier's stated outside-Dhaka coverage actually includes the customer's upazila; not every courier reaches every district with the same reliability, and Paperfly and SteadFast publish the widest outside-Dhaka coverage lists as of typical current terms.
2. **What's the weight band?**
   - Under 1 kg (apparel, accessories, small electronics accessories): most couriers price similarly; optimize for return rate, not price.
   - 1–5 kg: check whether the courier's rate card has a step change at 2 kg or 3 kg — packing 1.9 kg vs 2.1 kg can move the rate a full band.
   - Over 5 kg (furniture, appliances, bulk orders): confirm the courier accepts the item at all; several couriers cap standard parcel service well below this and require a freight/bulky-item product line.
3. **Is it fragile or liquid?**
   - Yes → prefer couriers with declared fragile-handling options and require signature-on-delivery if offered; note the choice on the pick-list so packing uses extra void fill.
   - No → standard handling is fine; don't over-pack, since dimensional weight can push a light-but-bulky parcel into a higher rate band.
4. **What's the COD value, and what's your cash-flow tolerance for the remittance cycle?**
   - High COD value + long remittance cycle → either favor a courier with a faster typical remittance cycle, or require prepayment/partial-advance above a value threshold you set in Settings → Risk.
   - Low COD value → remittance timing matters less; optimize for return rate and coverage instead.

### 5.2 Reference comparison table

Values are couriers' published terms shown for comparison — not a Framique guarantee, and not a substitute for your signed contract.

| Courier | Inside-Dhaka coverage | Outside-Dhaka coverage | Typical pickup cut-off | Typical COD remittance cycle | Return window |
|---|---|---|---|---|---|
| SteadFast | Full metro | Wide, most districts | Same-day if booked before contracted cut-off | Weekly, per your contract | Per courier policy |
| Pathao | Full metro | Major districts | Same-day, tight cut-off | Weekly or twice-weekly, per your contract | Per courier policy |
| RedX | Full metro | Wide, most districts | Same-day if booked before contracted cut-off | Weekly, per your contract | Per courier policy |
| Paperfly | Full metro | Widest rural reach, per operator claims | Next-day standard | Weekly, per your contract | Per courier policy |
| Manual / own rider | Your defined zone | N/A | Your own SOP | Same-day cash-in-hand | Your own policy |

**Design note**: hairline-row table, `surface-1`, monospaced numerals for cut-off/cycle columns for scanability. The decision tree renders as a 4-question vertical accordion above the table on mobile; on desktop, a 2×2 glass card grid, one card per variable.

---

## 6. Returns and RTO reduction: a playbook, with a worked margin example

*Lever: loss aversion framed as a controllable number — merchants underestimate RTO cost until it's shown against their own margin, at which point it becomes the single most actionable metric on this page.*

Return-to-origin (RTO) is not a courier problem alone; it's a data-quality and expectation-setting problem that happens to surface at the courier. Three levers reduce it, in order of typical impact:

1. **Address and phone verification before confirmation** (§7) — most RTOs trace back to an unreachable number or an incomplete address, not a genuine refusal.
2. **A confirmation call or SMS for COD orders above a value threshold you set** — a single "we're shipping your order, cash-on-delivery, amount X" message filters out impulse or mistaken checkouts before a courier ever touches the parcel.
3. **Courier-level return-rate tracking** — once return rate is a number per courier per month, you have a fact to renegotiate terms with, or a reason to shift volume.

### 6.1 Worked example: what a 1-point RTO improvement is worth

Assume:

- 600 COD orders/month, average order value 1,200৳, gross margin 32%.
- Current RTO rate: 14%. Each RTO costs the round-trip courier fee (assume 120৳ out + 100৳ return = 220৳) plus the lost contribution margin on that order (1,200 × 0.32 = 384৳) — total loss per RTO: **604৳**.

Monthly RTO cost today: 600 × 14% = 84 orders × 604৳ = **50,736৳/month**.

If address/phone verification and a confirmation-SMS step bring RTO down to 10% (a 4-point improvement, consistent with what a verification step typically removes — the "wrong number, never confirmed" category):

New monthly RTO cost: 600 × 10% = 60 orders × 604৳ = **36,240৳/month**.

**Monthly saving: 14,496৳. Annualized: 173,952৳** — against zero incremental courier fee, because the fee structure didn't change; only the confirmation rate did.

Caption: Recompute this with your own AOV, margin and RTO rate under Analytics → Returns; the formula is `(orders × RTO% × (round-trip fee + AOV × margin))`.

### 6.2 RTO reduction checklist

- [ ] Address field requires area/thana selection, not free text, for Dhaka and major-district addresses.
- [ ] Phone number format validated (11-digit BD mobile) at checkout, before payment step.
- [ ] COD orders above your set threshold trigger a confirmation SMS with amount and courier name.
- [ ] Orders unconfirmed after 48 hours auto-flag to the exceptions queue (§11), not silently expire.
- [ ] Return reason is a required field on every RTO event — "refused," "unreachable," "wrong address," "changed mind" are distinct rows in Analytics, not one bucket.
- [ ] Monthly return-rate-per-courier review is a standing item, not ad hoc.

**Design note**: worked example renders as a glass-spotlight card (violet gradient), numerals in `display-md`, the before/after saving as the largest number on the card. Checklist as a plain canvas list with custom checkbox glyphs, not a card — keeps the page from stacking three gradient cards in one viewport per DESIGN.md.

---

## 7. Address quality and phone verification

*Lever: front-loading friction that prevents downstream cost is easier to justify once §6's math is visible — sequencing matters.*

Two structured fields do most of the work:

- **Address**: a cascading area selector (division → district → upazila/thana) backs the free-text street line, so "outside coverage" is caught at checkout, not at pickup. Free-text remains for house/road number, since that level of granularity has no reliable structured source in Bangladesh.
- **Phone**: format-validated to 11-digit BD mobile prefixes at the field level; optional OTP verification for COD orders above your risk threshold, sent via the same SMS gateway used for order notifications, so it's one integration, not two.

Both fields feed the risk score referenced in §3's "Placed" row — a mismatched or unverifiable pair (area outside stated coverage, or a number that fails OTP) can auto-route the order to manual review instead of auto-confirm.

**বাংলা OTP prompt**: আপনার অর্ডার নিশ্চিত করতে এই কোডটি লিখুন: {code}

**Design note**: two-field glass card, inline validation states shown live — success uses `semantic-success`, never a red error tone described in this deck (error color intentionally omitted from copy; refer to component library for the token).

---

## 8. Packing and pick-list workflow for a small warehouse

*Lever: procedural clarity reduces the "who does what" ambiguity that causes packing errors more often than carelessness does.*

For a one-to-five-person packing operation, the workflow that scales without new headcount looks like this:

1. **Batch confirmed orders into a pick-list** — generated from Confirmed-state orders, grouped by SKU location if you've set warehouse bins, or by order age if you haven't.
2. **Pick against the list, not the order screen** — the pick-list shows SKU, quantity, and bin location across all orders in the batch, so one walk through the warehouse fulfills multiple orders instead of one trip per order.
3. **Pack and weigh** — actual weight and dimensions entered (or read from a connected scale) locks the courier rate calculation for that order and flags a mismatch if it differs meaningfully from the product's stored weight, which is itself a check against wrong-item packing.
4. **Mark packed, which unlocks label generation** (§4) — packing is a gate, not a formality; the system will not let a label print for an order still in Confirmed state.
5. **Batch pickup request** — once a courier's batch is packed and labeled, one pickup request covers the whole batch instead of one request per parcel.

### 8.1 Pick-list checklist

- [ ] Pick-list grouped by bin location, not by order number.
- [ ] Each line shows product image thumbnail, not just SKU code — reduces wrong-item picks for lookalike variants.
- [ ] Fragile-flagged items surface a packing-material reminder at the pack step.
- [ ] Weight variance beyond a set tolerance blocks label generation until confirmed by a second staff member.
- [ ] Batch pickup grouped by courier and by pickup time window.

**Design note**: numbered process as a vertical flip-row sequence, each step a small glass card with a step number in `display-md` on the left rail; checklist below in plain canvas list.

---

## 9. Inventory reservation and oversell prevention

*Lever: the oversell scenario is the single most trust-damaging failure mode in commerce — showing the exact reservation mechanics converts a vague reassurance into an inspectable fact.*

Stock moves through the same discipline as orders — a state, not a single number:

| Stock state | When it applies | Counted in "available to sell"? |
|---|---|---|
| **On hand** | Physically in the warehouse, uncommitted | Yes |
| **Soft-reserved** | Order Placed, payment not yet settled or COD not yet confirmed | No — decremented from available immediately |
| **Hard-allocated** | Order Confirmed | No — locked to that order specifically |
| **Deducted** | Order Delivered | No — permanently removed from on-hand |
| **Restocked** | Order Returned and inspection passed | Yes, once inspection completes |

Because soft-reservation happens at Placed, not at Confirmed, two customers cannot both check out the last unit and both receive a confirmation — the second checkout sees "unavailable" in real time, sourced from the same ledger the storefront reads.

Soft reservations that never reach Confirmed (abandoned COD orders, failed payments) release back to available stock automatically after a timeout you configure — commonly 30–60 minutes for payment orders, longer for COD orders pending a confirmation call.

**Design note**: five-row state table, `surface-1`, with a small colored dot per row reusing the semantic-success token only for "available to sell = yes" rows, keeping the binary ink rule intact for text.

---

## 10. Delivery-status webhooks and Bangla customer notifications

*Lever: proactive status communication is a documented driver of reduced support load — "where is my parcel" tickets fall when the answer arrives before the question is asked.*

Every courier scan that reaches Framique via webhook does two things simultaneously: appends to the order's public tracking timeline, and — if the transition matches a notification rule — sends a customer message in the customer's stated language.

### 10.1 Notification rules and Bangla copy

| Trigger state | Channel | English copy | বাংলা copy |
|---|---|---|---|
| Confirmed | SMS | Your order #{id} is confirmed and being packed. | আপনার অর্ডার #{id} নিশ্চিত হয়েছে, প্যাক করা হচ্ছে। |
| Picked up | SMS | Your order #{id} is on its way with {courier}. | আপনার অর্ডার #{id} {courier}-এর মাধ্যমে যাত্রা শুরু করেছে। |
| In transit (out for delivery) | SMS | Your parcel is out for delivery today. | আপনার পার্সেল আজ ডেলিভারির জন্য বের হয়েছে। |
| Delivered | SMS + review request | Delivered. Thank you for your order — rate your experience: {link} | ডেলিভারি সম্পন্ন। ধন্যবাদ — আপনার অভিজ্ঞতা জানান: {link} |
| Returned | SMS | Your order #{id} could not be delivered and is being returned. We'll contact you. | আপনার অর্ডার #{id} ডেলিভারি সম্ভব হয়নি, ফেরত পাঠানো হচ্ছে। আমরা যোগাযোগ করব। |

Each row is independently toggleable per merchant — a merchant running high-touch WhatsApp support may disable SMS for "In transit" and keep only "Confirmed" and "Delivered" to avoid over-messaging.

**Design note**: table renders left-aligned; Bangla column uses `{typography.bangla-display}` reset to letter-spacing 0 per DESIGN.md, minimum 1.35 line-height so matras are not clipped in the narrow table cell — verify at 640px breakpoint where the table becomes a stacked card list.

---

## 11. Exceptions queue and SLA breach handling

*Lever: naming the failure path explicitly is more trust-building than pretending it doesn't exist — merchants have all been burned by silent courier failures before.*

Not every order moves cleanly through the state machine. The exceptions queue collects anything that has stalled against a threshold you define, so it's a worklist, not a mystery:

- **No confirmation after 48 hours** (configurable) — COD order sits in Placed with no confirmation call logged.
- **No pickup scan after the courier's stated cut-off plus a grace window** — label generated, but the courier never scanned it.
- **No transit scan for N days** (configurable per courier, since typical transit times differ inside vs outside Dhaka) — parcel picked up but gone quiet.
- **Delivery attempted but not completed**, with no rescheduled attempt logged within 24 hours.

Each exception surfaces with the order, the courier, the last known event, and time elapsed since that event — sorted oldest-first so the queue naturally prioritizes the parcels closest to a customer complaint.

### 11.1 SLA breach handling steps

1. Exception ages into the queue automatically; no staff action needed to detect it.
2. Staff opens the order, contacts the courier's escalation channel (courier contact details stored per courier in Settings), and logs the outcome as an order note.
3. If unresolved within a second, longer threshold, the order can be manually moved to `Lost` (§3) to stop it silently aging forever, which also triggers the courier-claim flag.
4. Recurring exception patterns per courier (e.g. consistent late pickups on a specific route) feed back into the courier-selection decision in §5 — this is where the "coverage" column in §5.2 should be updated from your own experience, not just the courier's published claim.

**Design note**: queue as a dense list row component (not cards) — reads more like an inbox than a marketing showcase, deliberately utilitarian since this is a working-tool section, not a persuasion section.

---

## 12. Remittance reconciliation with the courier

*Lever: the ledger metaphor makes an abstract "trust the courier" relationship into a concrete, auditable balance — the same instinct that makes bank statements trustworthy.*

COD money physically sits with the courier between Delivered and the courier's remittance payout. Framique tracks this as a running ledger per courier, not a single trust-based number:

| Ledger state | Meaning |
|---|---|
| **Awaited** | Order Delivered, COD amount logged, courier has not yet paid out |
| **Remitted** | Courier payout received and matched to one or more orders |
| **Short** | Remitted amount doesn't match the sum of matched orders — flagged for manual reconciliation |
| **Disputed** | Order marked Delivered by courier webhook, but merchant has no matching remittance after the courier's stated cycle has passed |

Reconciliation workflow: when a courier payout arrives (bank transfer or courier-app statement), staff enters the payout amount and reference; Framique matches it against Awaited orders for that courier by amount and date range, auto-clearing exact matches and surfacing the remainder for manual line-by-line matching.

Worked check: 45 Delivered orders in a remittance cycle, COD total 54,200৳. Courier pays 52,900৳. The 1,300৳ gap is not "written off" — it's flagged **Short**, and the underlying order-level amounts are listed so the specific 1–3 orders responsible can be raised with the courier directly, with the order ID and delivery timestamp as evidence.

**Design note**: ledger table with a running-balance final row in `surface-2`, monospaced numerals throughout for column alignment.

---

## 13. Peak-season capacity checklist: Eid and Pohela Boishakh

*Lever: a dated, high-stakes seasonal moment converts general advice into an urgent, specific to-do list — merchants remember peak-season failures for years.*

Order volume during Eid-ul-Fitr, Eid-ul-Adha, and Pohela Boishakh windows routinely multiplies baseline daily volume; courier networks and your own packing capacity both come under strain at the same time. Plan against capacity, not just demand:

- [ ] Confirm each courier's own stated peak-season cut-off changes in advance — cut-offs typically move earlier during Eid week, per each courier's seasonal notice.
- [ ] Pre-negotiate a temporary rate or priority-pickup arrangement if your volume during the peak window will meaningfully exceed your normal contracted volume.
- [ ] Increase the soft-reservation timeout for payment orders if payment gateway load is expected to slow checkout completion.
- [ ] Stage packing materials and box sizes for at least your peak-week forecasted volume, not your average-week volume — this is the most common physical bottleneck, not courier capacity.
- [ ] Schedule extra confirmation-call staffing for the COD confirmation step (§6), since call volume scales with order volume, not with courier capacity.
- [ ] Set a temporary, explicit "estimated delivery may extend beyond typical timelines during Eid" notice on the storefront and in the Confirmed SMS, so the delivered-late complaint rate doesn't spike against an unstated expectation.
- [ ] Review the exceptions queue (§11) daily, not weekly, during the peak window — exceptions compound faster when courier networks are also under load.
- [ ] Reconcile remittance more frequently than usual during and immediately after the peak window, since courier back-offices are also processing peak volume.

**Design note**: checklist as a two-column glass card grid at desktop width, collapsing to single column at 640px; no gradient card here — this section is operational, not persuasive, consistent with the "gradients are scarce" rule.

---

## 14. Comparison: Framique vs spreadsheet + courier panels

*Lever: contrast with the reader's actual current workflow (not a straw-man competitor) makes the value concrete, because every line item maps to a task the reader personally does today.*

| Task | Spreadsheet + courier panels | Framique |
|---|---|---|
| Choosing a courier per order | Manual judgment call, no data | Suggested by the decision framework, always overridable |
| Generating a label | Log into courier panel, re-type address | Generated from the order, address already there |
| Requesting pickup | Separate action per courier panel | Batch request from the order list |
| Tracking status | Check each courier's tracking page manually | Webhook-driven timeline on the order and a public customer page |
| Customer "where is my order" messages | Manual reply, per message | Bangla notifications sent automatically at each state |
| Return rate per courier | Not tracked, or tracked manually in a separate sheet | Automatic per-courier, per-month metric |
| COD remittance matching | Manual line-by-line against a courier statement | Auto-matched, exceptions surfaced as Short/Disputed |
| Oversell prevention | Manual stock check, error-prone at volume | Soft-reservation at order placement, real-time |
| Exceptions (stalled orders) | Discovered when a customer complains | Surfaced automatically by elapsed-time thresholds |
| Peak-season readiness | Ad hoc, remembered from last year if at all | Checklist and capacity settings built into the same dashboard |

Caption: The spreadsheet doesn't disappear because it was bad at its job — it disappears because a state machine and a webhook do the same job without the re-typing.

**Design note**: comparison table, hairline rows, Framique column visually weighted with a subtle `surface-1` cell background so the eye tracks down that column without a colored highlight competing with the aurora system.

---

## 15. FAQ

*Lever: objection-handling at the point of highest doubt — placed just before the final CTA, where a remaining unresolved question is most likely to stall conversion.*

1. **Do I need all four couriers, or can I use just one?**
   Use as many or as few as you want. The courier wall and the decision framework are most useful with two or more, since they let you compare, but a single-courier setup works identically — the drawer just won't show alternatives.

2. **What happens if a courier's webhook goes down temporarily?**
   The order stays in its last known state; staff can manually advance it if they have confirmation from the courier through another channel (call, app), and the manual update writes the same order-event log entry a webhook would.

3. **Can I use my own delivery riders instead of a third-party courier?**
   Yes — Manual / own rider is a first-class courier option in the drawer, with the same state machine, minus the label-generation and webhook steps, which are replaced by manual status updates from your staff.

4. **How is the return rate per courier calculated?**
   Returned-state orders in a given month, divided by total orders shipped with that courier in the same month, shown in Analytics → Returns, filterable by return reason.

5. **Does the risk score for COD orders auto-cancel anything?**
   No. It routes to manual review or blocks auto-confirmation; a human always makes the final confirm/cancel decision unless you explicitly configure an auto-cancel rule for a specific risk threshold.

6. **What if the courier's remittance amount is short and they dispute the shortfall?**
   The Short ledger state keeps the specific order IDs and delivery timestamps attached, which is the evidence trail for that conversation with the courier — Framique doesn't adjudicate the dispute, it documents it.

7. **Can customers track their order without creating an account?**
   Yes — the public tracking page is a link tied to the order ID and phone number, sent in the Confirmed SMS, with no login required.

8. **Does inventory get restocked automatically after a return?**
   Only after inspection is marked passed; a returned item sits in a pending-inspection state so a damaged return doesn't silently go back into sellable stock.

9. **How far in advance should I set up peak-season settings?**
   At least two to three weeks before Eid or Pohela Boishakh, so the reservation-timeout and staffing adjustments in §13 are live before the volume spike, not adjusted reactively mid-spike.

10. **What data do I need to switch from a spreadsheet workflow?**
    Your current product list with weights (for rate calculation), courier credentials for each courier you already use, and your historical order data if you want return-rate history to populate from day one rather than starting fresh.

**Design note**: standard faq-row component, canvas background, one row expanded by default (question 1), rest collapsed; JSON-LD FAQPage mirrors these 10 Q&A pairs verbatim.

---

## 16. Final CTA

*Lever: closing on the cost of inaction (manual reconciliation) rather than a generic feature summary, mirroring the worked-example framing from §6 so the last thing the reader sees is a number, not an adjective.*

**H2**: Stop reconciling parcels by hand.
**Sub**: Every state change, every label, every remitted taka — one ledger, not four browser tabs.
**Primary CTA**: `Book a walkthrough` · **Alt CTA**: `Start free — no card`

**বাংলা H2**: পার্সেল হাতে হিসাব করা বন্ধ করুন।
**বাংলা sub**: প্রতিটি স্টেট পরিবর্তন, প্রতিটি লেবেল, প্রতিটি ফেরত টাকা — একটি খাতায়, চারটি ট্যাবে নয়।

**Design note**: gradient-spotlight final CTA card (teal stop, per DESIGN.md's "one or two gradient cards per long page" — this is the second, after §6.1), full-bleed within the 1200px container, white-ink text at ≥4.5:1 against the darkest gradient stop.

---

## Internal linking plan

- Courier wall (§2) → `/pricing` for courier-fee pass-through details.
- §3 lifecycle table → `/product` order-drawer feature anchor.
- §6 worked example → `/analytics` (Analytics → Returns is referenced verbatim).
- §9 inventory states → `/product#inventory` or a dedicated `/inventory` page if one exists.
- §12 remittance → `/pricing#payments` for payment-gateway settlement comparison.
- §13 peak-season checklist → `/blog` seasonal readiness post, if the blog has one, else omit link.
- FAQ §15, Q3 (own rider) → `/product#manual-fulfilment`.
- Final CTA → `/signup` (Start free) and `/contact` or booking widget (Book a walkthrough).

## Image brief

- Hero: glass order-drawer mock, courier chips row, label thumbnail, status strip — dark canvas, low-alpha aurora mesh behind.
- §4 Z row: cropped drawer screenshot, courier selector pills with SteadFast active and blue focus ring, rate line, label PDF thumbnail.
- §6.1: no illustration — numerals carry the section; avoid competing visual noise on the gradient card.
- §8: warehouse pick-list screen crop showing bin locations and product thumbnails, or an abstracted icon sequence if a real screen isn't available yet.
- §10: phone mockup showing a Bangla SMS notification thread, three messages stacked (Confirmed, Out for delivery, Delivered).
- og:image: order-drawer courier panel per SEO block above.

## Icon list

Truck (in transit), box (packed), map-pin (address), phone-check (verification), receipt (remittance), alert-triangle (exceptions), rotate-ccw (returns), calendar (peak season), webhook/plug (integration), check-circle (delivered).

## Motion spec

- Lifecycle timeline (§3): nodes reveal left-to-right on scroll-into-view, 380ms each, staggered 60ms, `cubic-bezier(0.22, 1, 0.36, 1)`, once only.
- Courier wall tiles: 2px lift + tooltip fade-in on hover, 240ms; no motion on touch devices beyond a tap-state background shift.
- Drawer mock in §4: label thumbnail has a single subtle drop-in on first view, no looping animation.
- Aurora backgrounds (hero, final CTA): 24–38s drift loop, per DESIGN.md.
- All motion collapses to static under `prefers-reduced-motion`.

## Accessibility and Bangla notes

- Single `h1` in the hero; all section headings are `h2`, sub-points `h3`.
- Every table has a proper `<caption>` or adjacent descriptive text (already provided per table above) so screen readers announce table purpose before content.
- Bangla strings live in `lang="bn"` spans/blocks; `{typography.bangla-display}` and body Bangla variants drop `letter-spacing` to 0 and hold line-height ≥1.35, per DESIGN.md, so matras in words like "নিশ্চিত" and "ডেলিভারি" are never clipped.
- Icons in §"Icon list" always pair with the existing `aria-label`led text, never standalone.
- Color is never the sole state indicator: the semantic-success dot in §9's table is paired with the word "Yes/No" in the same cell, not color alone.
- Checklists use native checkbox-style list markers with sufficient contrast against canvas, not color-only checkmarks.
- Focus rings use the signal-blue Elevation-3 ring throughout interactive elements (courier tiles, FAQ rows, CTA pills).

## Measurement plan

- CTA click-through rate on `Book a walkthrough` vs `Start free — no card`, split by entry section (hero vs final CTA) via scroll-depth-tagged UTM anchors.
- Time-on-page and scroll depth to §6 (worked example) as a proxy for whether the RTO math lands before bounce.
- FAQ expand rate per question — questions 6 and 9 (remittance dispute, peak-season timing) are hypothesized highest-value if expand rate is high, since they signal late-funnel diligence.
- Courier wall tile hover rate, to validate whether the tooltip coverage/cut-off/remittance summary is discovered without needing the full §5.2 table.
- Downstream: signup-to-first-order-shipped time for visitors who arrived via `/fulfilment`, compared to visitors who arrived via `/product`, as a proxy for whether this page pre-qualifies operationally-ready merchants.

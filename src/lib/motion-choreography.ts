/**
 * Phase 10.4 — the motion choreography spec (TODO §10.4).
 *
 * §10.3 made the page's geometry machine-checkable. This module does the same
 * job for its motion, and for the same reason: a rule that only exists in a
 * markdown bullet is re-litigated on every page, and by page eleven the site
 * has four different entrance durations and a hero that drifts at 8s on one
 * route and 45s on another.
 *
 * The four rules from TODO §10.4, verbatim, and how each becomes a number:
 *
 *   1. "Reveal-on-scroll: 16px rise + opacity, 480ms, once, `Reveal`/`Stagger`."
 *      → REVEAL.risePx / durationMs / once, audited from the *rendered*
 *        transition on a settled node, not from the props a component was given.
 *   2. "Hero aurora drift 24–38s loop; magnetic primary CTA at ≥1024px only."
 *      → DRIFT.minMs…maxMs on the aurora field's animation-duration, and
 *        MAGNETIC.minViewportPx as a hard gate on the pointer-follow.
 *   3. "Marquees and counters honour `prefers-reduced-motion` (static frame)."
 *      → under reduced intent nothing may hold a running animation longer than
 *        REDUCED.maxDurationMs, and every counter must already read its final
 *        value.
 *   4. "No motion on LCP text or on anything above the fold before hydration."
 *      → FOLD: a node intersecting the first viewport may not be in the
 *        `pending` motion state, and the LCP text node may carry no transition
 *        or animation at all.
 *
 * Everything here is pure: no DOM, no timers, no imports. The browser-side gate
 * (`scripts/motion-gate.mjs`) measures, this module judges, and
 * `motion-choreography.test.ts` pins the judgements. That split is what lets the
 * same thresholds be asserted in CI, in a unit test and (in development) from
 * the running app without three copies of the numbers.
 *
 * Severity policy, learned from the rhythm gate: `error` is reserved for things
 * a visitor can feel (motion on the LCP node, motion above the fold before
 * hydration, animation that survives a reduced-motion request, a magnet on a
 * touch phone). Aesthetic drift — a 420ms reveal, a 22s aurora loop — is `warn`,
 * because blocking a deploy on 60ms of easing is how gates get switched off.
 */

/* -------------------------------------------------------------------------- */
/* Spec                                                                       */
/* -------------------------------------------------------------------------- */

/** Reveal-on-scroll: TODO §10.4 bullet 1. */
export const REVEAL = {
  /** Entrance travel, in px. `Reveal`'s default distance must equal this. */
  risePx: 16,
  /** Entrance duration, in ms. */
  durationMs: 480,
  /**
   * ±ms accepted on a measured duration. Browsers serialise transition
   * durations in seconds with 2–3 decimals, and a stagger delay rounds; 40ms
   * absorbs that without absorbing a genuinely different token.
   */
  durationToleranceMs: 40,
  /** ±px accepted on the measured translation. Sub-pixel layout rounds. */
  riseTolerancePx: 2,
  /** A reveal runs once. A node that re-hides on scroll-back is a finding. */
  once: true,
  /**
   * Longest delay any single child may carry. `staggerSchedule` caps the total
   * run at 900ms; a delay past that means someone hand-wrote one.
   */
  maxDelayMs: 900,
  /** Only these properties may be transitioned. Layout properties are jank. */
  allowedProperties: ["opacity", "transform", "filter"] as const,
} as const;

/** Hero aurora drift: TODO §10.4 bullet 2, first half. */
export const DRIFT = {
  minMs: 24_000,
  maxMs: 38_000,
  /** The drift is composited: transform (and at a push, opacity). Nothing else. */
  allowedProperties: ["transform", "opacity"] as const,
  /** A drift must loop; a one-shot atmosphere reads as a bug on long pages. */
  infinite: true,
  /** At most one drifting field per viewport — chroma stays scarce (§10.3). */
  maxPerViewport: 1,
} as const;

/** Magnetic CTA: TODO §10.4 bullet 2, second half. */
export const MAGNETIC = {
  /** Desktop only. Below this width the magnet is off, not just weaker. */
  minViewportPx: 1024,
  /** Fitts's law: the target may never move further than this from its box. */
  maxOffsetPx: 10,
  /** A magnet needs a cursor. Coarse pointers get a static button. */
  requiresFinePointer: true,
  /** One magnetic element per band: the primary CTA, and nothing else. */
  maxPerBand: 1,
} as const;

/** Reduced-motion contract: TODO §10.4 bullet 3. */
export const REDUCED = {
  /**
   * Under reduced intent a short opacity settle is still permitted (it prevents
   * a hard content pop) but nothing may *travel* and nothing may loop.
   */
  maxDurationMs: 200,
  allowedProperties: ["opacity"] as const,
  /** Loops are forbidden outright: marquees and drifts park on a static frame. */
  allowInfinite: false,
} as const;

/** Above-the-fold and LCP contract: TODO §10.4 bullet 4. */
export const FOLD = {
  /**
   * A node counts as above the fold when its top is within the first viewport
   * height plus this slack. The slack exists because a 1px-below-the-fold
   * heading is, to a visitor on a slightly taller phone, above it.
   */
  slackPx: 48,
  /** The LCP text node may carry no transition and no animation whatsoever. */
  lcpMotionAllowed: false,
  /**
   * Before hydration every reveal must render settled. `Reveal` resolves intent
   * to `off` on the server for exactly this reason, so a pending state in the
   * SSR HTML is a regression in that resolution, not a styling nit.
   */
  pendingBeforeHydrationAllowed: false,
} as const;

export const CHOREOGRAPHY = { REVEAL, DRIFT, MAGNETIC, REDUCED, FOLD } as const;

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export type MotionSeverity = "error" | "warn" | "info";

export type MotionFindingCode =
  | "motion.reveal.duration"
  | "motion.reveal.rise"
  | "motion.reveal.property"
  | "motion.reveal.delay"
  | "motion.reveal.repeat"
  | "motion.drift.duration"
  | "motion.drift.loop"
  | "motion.drift.property"
  | "motion.drift.crowded"
  | "motion.drift.missing"
  | "motion.magnetic.viewport"
  | "motion.magnetic.pointer"
  | "motion.magnetic.offset"
  | "motion.magnetic.crowded"
  | "motion.reduced.duration"
  | "motion.reduced.property"
  | "motion.reduced.loop"
  | "motion.reduced.counter"
  | "motion.fold.pending"
  | "motion.fold.lcp"
  | "motion.budget.exceeded"
  | "motion.unknown";

export type MotionFinding = {
  code: MotionFindingCode;
  severity: MotionSeverity;
  /** The rule in human words — this is what a reviewer reads first. */
  rule: string;
  /** `route @width/locale · label`, so a finding is reproducible. */
  where: string;
  message: string;
  actual?: number | string | null;
  expected?: number | string | null;
};

export function formatMotionFinding(f: MotionFinding) {
  const label = f.severity === "error" ? "FAIL" : f.severity === "warn" ? "WARN" : "INFO";
  return `${label} [${f.code}] ${f.where}: ${f.message}`;
}

/** Collapses the same code+message repeated across widths and locales. */
export function dedupeMotionFindings(findings: MotionFinding[]) {
  const seen = new Map<string, MotionFinding>();
  for (const f of findings) {
    const key = `${f.code}|${f.where}|${f.message}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}

export function countMotionBySeverity(findings: MotionFinding[]) {
  return findings.reduce(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { error: 0, warn: 0, info: 0 } as Record<MotionSeverity, number>,
  );
}

/* -------------------------------------------------------------------------- */
/* Measurement shapes                                                         */
/* -------------------------------------------------------------------------- */

/** One `Reveal`/`Stagger` node as the browser rendered it. */
export type RevealSample = {
  label: string;
  /** `pending` before entry, `settled` after. Read from `data-motion-state`. */
  state: "pending" | "settled" | "unknown";
  /** Longest transition duration on the node, ms. */
  durationMs: number;
  /** Largest transition delay on the node, ms. */
  delayMs: number;
  /** Transitioned property names, already split and trimmed. */
  properties: string[];
  /** Absolute translation implied by the pending transform, px. */
  translatePx: number;
  /** Distance of the node's top from the top of the viewport, px. */
  topPx: number;
  /** True when the node reverted to `pending` after having settled once. */
  reHidden?: boolean;
};

/** One drifting atmosphere layer (the `fq-aurora` field, `GradientMesh` blob). */
export type DriftSample = {
  label: string;
  /** `animation-duration`, ms. 0 when no animation is attached. */
  durationMs: number;
  iterationCount: number | "infinite";
  /** Properties the keyframes actually touch, when the gate can read them. */
  properties: string[];
  /** True when the layer is inside the first viewport. */
  aboveFold: boolean;
};

/** One magnetic CTA. */
export type MagneticSample = {
  label: string;
  /** Whether the primitive resolved itself to enabled on this view. */
  enabled: boolean;
  /** Peak offset the gate could provoke with a synthetic pointer move, px. */
  offsetPx: number;
  bandLabel?: string;
};

export type CounterSample = {
  label: string;
  /** Text the visitor sees right now. */
  rendered: string;
  /** Text the node must show at rest (its `sr-only` settled figure). */
  settled: string;
};

export type MotionPageMeasurement = {
  route: string;
  viewportPx: number;
  viewportHeightPx: number;
  locale: string;
  /** `full` for a normal visit, `reduced` when the gate asked for reduce. */
  intent: "full" | "reduced";
  /** False for the SSR/pre-hydration pass. */
  hydrated: boolean;
  reveals: RevealSample[];
  drifts: DriftSample[];
  magnetics: MagneticSample[];
  counters: CounterSample[];
  /** The LCP text node, when the gate could identify one. */
  lcp?: {
    label: string;
    durationMs: number;
    animationName: string | null;
  } | null;
  /** Concurrent JS-driven animations observed at peak, if instrumented. */
  peakConcurrentAnimations?: number | null;
  /** The budget ceiling reported by the runtime, if instrumented. */
  budgetMax?: number | null;
};

/* -------------------------------------------------------------------------- */
/* Auditors                                                                   */
/* -------------------------------------------------------------------------- */

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function at(
  m: Pick<MotionPageMeasurement, "route" | "viewportPx" | "locale" | "intent" | "hydrated">,
  label: string,
) {
  // The pass is part of the location: "the LCP node animates" means something
  // different on the SSR pass than on the reduced-motion pass, and a reviewer
  // who cannot tell them apart cannot reproduce the finding.
  const pass = !m.hydrated ? "ssr" : m.intent;
  return `${m.route} @${m.viewportPx}/${m.locale}/${pass} · ${label}`;
}

/**
 * Reveal contract. Deliberately audits only *settled* nodes for property and
 * duration, and only *pending* nodes for travel distance: a settled node has
 * `transform: none`, so measuring its rise would manufacture a failure on
 * correct markup.
 */
export function auditReveal(m: MotionPageMeasurement): MotionFinding[] {
  const findings: MotionFinding[] = [];
  if (m.intent !== "full") return findings;

  for (const s of m.reveals) {
    const where = at(m, s.label);

    if (s.durationMs > 0 && !near(s.durationMs, REVEAL.durationMs, REVEAL.durationToleranceMs)) {
      findings.push({
        code: "motion.reveal.duration",
        severity: "warn",
        rule: `Reveal entrance is ${REVEAL.durationMs}ms`,
        where,
        message: `Entrance runs ${Math.round(s.durationMs)}ms. Use the shared token rather than a per-band duration.`,
        actual: Math.round(s.durationMs),
        expected: REVEAL.durationMs,
      });
    }

    const illegal = s.properties.filter(
      (p) => p !== "all" && !(REVEAL.allowedProperties as readonly string[]).includes(p),
    );
    if (illegal.length) {
      findings.push({
        code: "motion.reveal.property",
        severity: "error",
        rule: "Entrances animate opacity and transform only",
        where,
        message: `Transitions ${illegal.join(", ")}, which forces layout or paint on every frame.`,
        actual: illegal.join(", "),
        expected: REVEAL.allowedProperties.join(", "),
      });
    }

    if (s.delayMs > REVEAL.maxDelayMs) {
      findings.push({
        code: "motion.reveal.delay",
        severity: "warn",
        rule: `Stagger totals at most ${REVEAL.maxDelayMs}ms`,
        where,
        message: `Delayed ${Math.round(s.delayMs)}ms, so the visitor waits for content that is already on screen.`,
        actual: Math.round(s.delayMs),
        expected: REVEAL.maxDelayMs,
      });
    }

    if (
      s.state === "pending" &&
      s.translatePx > 0 &&
      !near(s.translatePx, REVEAL.risePx, REVEAL.riseTolerancePx)
    ) {
      findings.push({
        code: "motion.reveal.rise",
        severity: "warn",
        rule: `Entrance travel is ${REVEAL.risePx}px`,
        where,
        message: `Travels ${Math.round(s.translatePx)}px. Long travel reads as jank on a mid-range phone.`,
        actual: Math.round(s.translatePx),
        expected: REVEAL.risePx,
      });
    }

    if (REVEAL.once && s.reHidden) {
      findings.push({
        code: "motion.reveal.repeat",
        severity: "warn",
        rule: "A reveal runs once",
        where,
        message:
          "Node returned to the pending state after settling, so scrolling back up re-animates content the visitor has already read.",
      });
    }
  }

  return findings;
}

/** Hero aurora drift: duration window, loop, composited properties, scarcity. */
export function auditDrift(m: MotionPageMeasurement): MotionFinding[] {
  const findings: MotionFinding[] = [];

  if (m.intent === "reduced") {
    for (const d of m.drifts.filter((x) => x.durationMs > 0 && x.iterationCount === "infinite")) {
      findings.push({
        code: "motion.reduced.loop",
        severity: "error",
        rule: "Reduced motion parks every loop",
        where: at(m, d.label),
        message: "Atmosphere keeps looping after a reduced-motion request.",
        actual: "infinite",
        expected: "none",
      });
    }
    return findings;
  }

  const active = m.drifts.filter((d) => d.durationMs > 0);

  for (const d of active) {
    const where = at(m, d.label);

    if (d.durationMs < DRIFT.minMs || d.durationMs > DRIFT.maxMs) {
      findings.push({
        code: "motion.drift.duration",
        severity: "warn",
        rule: `Aurora drift loops in ${DRIFT.minMs / 1000}–${DRIFT.maxMs / 1000}s`,
        where,
        message:
          d.durationMs < DRIFT.minMs
            ? `Loops in ${Math.round(d.durationMs / 1000)}s, which is fast enough to read as movement instead of atmosphere.`
            : `Loops in ${Math.round(d.durationMs / 1000)}s, slow enough that the field looks static and the GPU work is wasted.`,
        actual: Math.round(d.durationMs),
        expected: `${DRIFT.minMs}–${DRIFT.maxMs}`,
      });
    }

    if (DRIFT.infinite && d.iterationCount !== "infinite") {
      findings.push({
        code: "motion.drift.loop",
        severity: "warn",
        rule: "Atmosphere loops forever",
        where,
        message: `Runs ${d.iterationCount} time(s) and then freezes mid-composition.`,
        actual: String(d.iterationCount),
        expected: "infinite",
      });
    }

    const illegal = d.properties.filter(
      (p) => !(DRIFT.allowedProperties as readonly string[]).includes(p),
    );
    if (illegal.length) {
      findings.push({
        code: "motion.drift.property",
        severity: "error",
        rule: "Atmosphere is composited",
        where,
        message: `Keyframes animate ${illegal.join(", ")}, which repaints a blurred layer every frame.`,
        actual: illegal.join(", "),
        expected: DRIFT.allowedProperties.join(", "),
      });
    }
  }

  const aboveFold = active.filter((d) => d.aboveFold).length;
  if (aboveFold > DRIFT.maxPerViewport) {
    findings.push({
      code: "motion.drift.crowded",
      severity: "warn",
      rule: `At most ${DRIFT.maxPerViewport} drifting field per viewport`,
      where: at(m, "first viewport"),
      message: `${aboveFold} drifting atmospheres share the first viewport, so each one halves the weight of the others.`,
      actual: aboveFold,
      expected: DRIFT.maxPerViewport,
    });
  }

  return findings;
}

/** Magnetic CTA gating. Below 1024px, or on a coarse pointer, it must be off. */
export function auditMagnetic(m: MotionPageMeasurement): MotionFinding[] {
  const findings: MotionFinding[] = [];
  const belowBreakpoint = m.viewportPx < MAGNETIC.minViewportPx;

  for (const s of m.magnetics) {
    const where = at(m, s.label);

    if (s.enabled && belowBreakpoint) {
      findings.push({
        code: "motion.magnetic.viewport",
        severity: "error",
        rule: `Magnetic CTA only at ≥${MAGNETIC.minViewportPx}px`,
        where,
        message: `Magnet is live at ${m.viewportPx}px, where the visitor taps rather than hovers and the button moves under the thumb.`,
        actual: m.viewportPx,
        expected: `≥${MAGNETIC.minViewportPx}`,
      });
    }

    if (s.enabled && m.intent === "reduced") {
      findings.push({
        code: "motion.reduced.property",
        severity: "error",
        rule: "Reduced motion disables pointer-follow",
        where,
        message: "Magnet still follows the pointer after a reduced-motion request.",
      });
    }

    if (s.offsetPx > MAGNETIC.maxOffsetPx + 0.5) {
      findings.push({
        code: "motion.magnetic.offset",
        severity: "warn",
        rule: `Magnetic pull is capped at ${MAGNETIC.maxOffsetPx}px`,
        where,
        message: `Pulled ${Math.round(s.offsetPx)}px, far enough that the target starts running away from the cursor.`,
        actual: Math.round(s.offsetPx),
        expected: MAGNETIC.maxOffsetPx,
      });
    }
  }

  const perBand = new Map<string, number>();
  for (const s of m.magnetics) {
    const band = s.bandLabel ?? "page";
    perBand.set(band, (perBand.get(band) ?? 0) + 1);
  }
  for (const [band, count] of perBand) {
    if (count > MAGNETIC.maxPerBand) {
      findings.push({
        code: "motion.magnetic.crowded",
        severity: "warn",
        rule: `One magnetic element per band`,
        where: at(m, band),
        message: `${count} magnetic elements in one band — the primary CTA stops being the primary CTA.`,
        actual: count,
        expected: MAGNETIC.maxPerBand,
      });
    }
  }

  return findings;
}

/** Reduced-motion pass: nothing travels, nothing loops, counters read final. */
export function auditReducedMotion(m: MotionPageMeasurement): MotionFinding[] {
  const findings: MotionFinding[] = [];
  if (m.intent !== "reduced") return findings;

  for (const s of m.reveals) {
    const where = at(m, s.label);

    if (s.durationMs > REDUCED.maxDurationMs) {
      findings.push({
        code: "motion.reduced.duration",
        severity: "error",
        rule: `Reduced motion caps transitions at ${REDUCED.maxDurationMs}ms`,
        where,
        message: `Transition still runs ${Math.round(s.durationMs)}ms.`,
        actual: Math.round(s.durationMs),
        expected: REDUCED.maxDurationMs,
      });
    }

    const illegal = s.properties.filter(
      (p) => p !== "all" && !(REDUCED.allowedProperties as readonly string[]).includes(p),
    );
    if (illegal.length || s.translatePx > 0.5) {
      findings.push({
        code: "motion.reduced.property",
        severity: "error",
        rule: "Reduced motion is a cross-fade, never travel",
        where,
        message: illegal.length
          ? `Still transitions ${illegal.join(", ")} under reduced motion.`
          : `Still travels ${Math.round(s.translatePx)}px under reduced motion.`,
      });
    }

    if (s.state === "pending") {
      findings.push({
        code: "motion.fold.pending",
        severity: "error",
        rule: "A downgrade never hides content",
        where,
        message:
          "Node is parked in the pending (invisible) state under reduced motion, so the content never appears.",
      });
    }
  }

  for (const c of m.counters) {
    if (c.rendered.trim() !== c.settled.trim()) {
      findings.push({
        code: "motion.reduced.counter",
        severity: "error",
        rule: "Counters render their final figure under reduced motion",
        where: at(m, c.label),
        message: `Shows "${c.rendered.trim()}" instead of the settled "${c.settled.trim()}".`,
        actual: c.rendered.trim(),
        expected: c.settled.trim(),
      });
    }
  }

  return findings;
}

/**
 * Fold and LCP contract. This is the rule with real user-visible cost, so both
 * findings are blocking: a pending node above the fold is invisible content on
 * first paint, and a transition on the LCP text node delays the metric itself.
 */
export function auditFold(m: MotionPageMeasurement): MotionFinding[] {
  const findings: MotionFinding[] = [];
  const foldLimit = m.viewportHeightPx + FOLD.slackPx;

  if (!FOLD.pendingBeforeHydrationAllowed) {
    for (const s of m.reveals) {
      if (s.state !== "pending") continue;
      if (s.topPx > foldLimit) continue;
      // A pending node above the fold is only legitimate once hydration has
      // run and the observer is about to fire it; before hydration it is
      // simply invisible content.
      findings.push({
        code: "motion.fold.pending",
        severity: m.hydrated ? "warn" : "error",
        rule: "Nothing above the fold animates before hydration",
        where: at(m, s.label),
        message: m.hydrated
          ? "Node above the fold is still pending after hydration; the first screen should render settled."
          : "Node above the fold renders invisible in the SSR HTML, so the first paint is blank where content should be.",
        actual: Math.round(s.topPx),
        expected: `> ${Math.round(foldLimit)}`,
      });
    }
  }

  /**
   * The LCP rule is audited on the full and SSR passes only. Under reduced
   * motion the global stylesheet clamps *every* element to a 200ms opacity
   * transition on purpose (that clamp is what makes the downgrade safe), so
   * reading it back here would report the accessibility feature as a defect —
   * a false positive that trains reviewers to ignore the gate.
   */
  if (m.lcp && !FOLD.lcpMotionAllowed && m.intent !== "reduced") {
    const animated = m.lcp.durationMs > 0 || (m.lcp.animationName && m.lcp.animationName !== "none");
    if (animated) {
      findings.push({
        code: "motion.fold.lcp",
        severity: "error",
        rule: "The LCP text node never animates",
        where: at(m, m.lcp.label),
        message: `Headline carries ${m.lcp.animationName && m.lcp.animationName !== "none" ? `animation "${m.lcp.animationName}"` : `a ${Math.round(m.lcp.durationMs)}ms transition`}, which delays the largest contentful paint it is supposed to be.`,
      });
    }
  }

  return findings;
}

/** Budget sanity: the runtime cap must actually bound concurrent animations. */
export function auditBudget(m: MotionPageMeasurement): MotionFinding[] {
  const peak = m.peakConcurrentAnimations;
  const max = m.budgetMax;
  if (typeof peak !== "number" || typeof max !== "number" || max <= 0) return [];
  if (peak <= max) return [];
  return [
    {
      code: "motion.budget.exceeded",
      severity: "warn",
      rule: "Concurrent animations stay inside the motion budget",
      where: at(m, "motion budget"),
      message: `${peak} animations ran concurrently against a ceiling of ${max}; the overflow should have rendered its final state instead.`,
      actual: peak,
      expected: max,
    },
  ];
}

/** Every auditor, one call — this is what the gate and the dev overlay use. */
export function auditMotionPage(m: MotionPageMeasurement) {
  const findings = dedupeMotionFindings([
    ...auditReveal(m),
    ...auditDrift(m),
    ...auditMagnetic(m),
    ...auditReducedMotion(m),
    ...auditFold(m),
    ...auditBudget(m),
  ]);
  const counts = countMotionBySeverity(findings);
  return {
    route: m.route,
    viewportPx: m.viewportPx,
    locale: m.locale,
    intent: m.intent,
    hydrated: m.hydrated,
    findings,
    counts,
    ok: counts.error === 0,
  };
}
